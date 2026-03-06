import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { normalizeSessionOrganizationId } from '@/lib/profile/organization';
import { logServerError } from '@/lib/server/logger';

// GET /api/dashboard/organizations - minimal org list for dashboard UIs
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

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
      .eq('user_id', user.id);

    if (error) {
      logServerError('Dashboard organizations error', error);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    const organizations =
      (data || [])
        // Supabase relationship selects can be typed as object or array depending on schema inference.
        // Normalize to a flat list of org records.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .flatMap((row: any) => {
          const org = row?.organization;
          if (!org) return [];
          return Array.isArray(org) ? org : [org];
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((org: any) => ({
          id: String(org.id),
          name: String(org.name),
          slug: String(org.slug),
        }));

    const activeOrganizationId = await normalizeSessionOrganizationId({
      userId: user.id,
      email: user.email ?? null,
      organizationId: user.organizationId ?? null,
      organizationSelection: user.organizationSelection ?? null,
    });

    const normalizedActiveOrganizationId =
      typeof activeOrganizationId === 'string' &&
      organizations.some((organization) => organization.id === activeOrganizationId)
        ? activeOrganizationId
        : null;

    return NextResponse.json({
      success: true,
      organizations,
      count: organizations.length,
      activeOrganizationId: normalizedActiveOrganizationId,
    });
  } catch (error) {
    logServerError('Dashboard organizations GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
