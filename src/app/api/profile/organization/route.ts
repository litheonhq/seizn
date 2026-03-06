import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import {
  normalizeSessionOrganizationId,
  updateProfileOrganizationId,
} from '@/lib/profile/organization';
import { createServerClient } from '@/lib/supabase';
import {
  createAuthJsSessionToken,
  getAuthJsSessionCookieName,
  getAuthJsSessionCookieOptions,
} from '@/lib/auth/session-token';
import { logServerError, logServerWarn } from '@/lib/server/logger';

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

function normalizeOrganization(
  value: unknown
): OrganizationRow | null {
  const organization = Array.isArray(value) ? value[0] : value;
  if (!organization || typeof organization !== 'object') {
    return null;
  }

  const record = organization as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.slug !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const organizationId =
      session.user.organizationSelection === 'personal'
        ? null
        : session.user.organizationId ||
      (await normalizeSessionOrganizationId({
        userId: session.user.id,
        email: session.user.email ?? null,
        organizationSelection: session.user.organizationSelection ?? null,
      }));

    if (!organizationId) {
      return NextResponse.json({
        success: true,
        organizationId: null,
        organization: null,
      });
    }

    const { data, error } = await supabase
      .from('organization_members')
      .select(
        `
        organization:organizations (
          id,
          name,
          slug
        )
      `
      )
      .eq('organization_id', organizationId)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) {
      logServerError('Profile organization GET error', error, {
        userId: session.user.id,
        organizationId,
      });
      return NextResponse.json({ error: 'Failed to fetch active organization' }, { status: 500 });
    }

    const organization = normalizeOrganization(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any)?.organization
    );

    return NextResponse.json({
      success: true,
      organizationId: organization?.id ?? null,
      organization,
    });
  } catch (error) {
    logServerError('Profile organization route GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!Object.prototype.hasOwnProperty.call(body, 'organizationId')) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    const rawOrganizationId = body.organizationId;
    if (rawOrganizationId !== null && typeof rawOrganizationId !== 'string') {
      return NextResponse.json({ error: 'organizationId must be a string or null' }, { status: 400 });
    }

    const organizationId =
      typeof rawOrganizationId === 'string' ? rawOrganizationId.trim() : null;

    if (typeof rawOrganizationId === 'string' && !organizationId) {
      return NextResponse.json({ error: 'organizationId must not be empty' }, { status: 400 });
    }

    const supabase = createServerClient();
    let organization: OrganizationRow | null = null;

    if (organizationId) {
      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select(
          `
          organization:organizations (
            id,
            name,
            slug
          )
        `
        )
        .eq('organization_id', organizationId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (membershipError) {
        logServerError('Profile organization membership check error', membershipError, {
          userId: session.user.id,
          organizationId,
        });
        return NextResponse.json({ error: 'Failed to validate organization access' }, { status: 500 });
      }

      organization = normalizeOrganization(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (membership as any)?.organization
      );

      if (!organization) {
        return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
      }
    }

    const updated = await updateProfileOrganizationId(
      supabase,
      {
        userId: session.user.id,
        email: session.user.email ?? null,
      },
      organizationId
    );

    const sessionToken = await createAuthJsSessionToken({
      userId: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? undefined,
      organizationId,
      organizationSelection: organizationId ? 'organization' : 'personal',
    });

    if (!updated) {
      logServerWarn('Profile organization stored in session fallback only', null, {
        userId: session.user.id,
        organizationId,
      });
    }

    const response = NextResponse.json({
      success: true,
      organizationId: organization?.id ?? null,
      organization,
      persistedToProfile: updated,
    });
    response.cookies.set(
      getAuthJsSessionCookieName(),
      sessionToken,
      getAuthJsSessionCookieOptions()
    );
    return response;
  } catch (error) {
    logServerError('Profile organization route PATCH error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
