import { NextRequest, NextResponse } from 'next/server';
import {
  canPinRegion,
  getPreferredRegion,
  isPreferredRegion,
  requireKoreanResidency,
  type PreferredRegion,
} from '@/lib/personas/region-pref';
import { resolvePersonaRouteAuth } from '@/lib/personas/route-auth';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

type RegionPreferenceBody = {
  preferredRegion?: unknown;
  region?: unknown;
};

function regionFromBody(body: RegionPreferenceBody): PreferredRegion | null {
  const candidate = body.preferredRegion ?? body.region;
  return isPreferredRegion(candidate) ? candidate : null;
}

async function isOrganizationOwner(params: {
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const { data, error } = await createServerClient()
    .from('organization_members')
    .select('role')
    .eq('organization_id', params.organizationId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { role?: unknown } | null)?.role === 'owner';
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolvePersonaRouteAuth(request);
    if ('response' in resolved) return resolved.response;

    const preferredRegion = await getPreferredRegion(resolved.auth.organizationId);

    return NextResponse.json({
      success: true,
      plan: resolved.auth.plan,
      preferredRegion,
      requiresKoreanResidency: await requireKoreanResidency(resolved.auth.organizationId),
      regionPinAvailable: canPinRegion(resolved.auth.plan),
    });
  } catch (error) {
    logServerError('Persona region preference GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'region_preference_failed', message: 'Failed to load region preference.' } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolvePersonaRouteAuth(request);
    if ('response' in resolved) return resolved.response;

    const body = (await request.json()) as RegionPreferenceBody;
    const preferredRegion = regionFromBody(body);
    if (!preferredRegion) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_region',
            message: 'preferredRegion must be auto, seoul, us-east-1, or eu-west-1.',
          },
        },
        { status: 400 },
      );
    }

    if (preferredRegion === 'seoul' && !canPinRegion(resolved.auth.plan)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'plan_required',
            message: 'Seoul data residency preference requires Pro or Enterprise.',
            requiredFeature: 'regionPin',
          },
        },
        { status: 403 },
      );
    }

    const owner = await isOrganizationOwner({
      organizationId: resolved.auth.organizationId,
      userId: resolved.auth.userId,
    });
    if (!owner) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'owner_required',
            message: 'Only an organization owner can change data residency preference.',
          },
        },
        { status: 403 },
      );
    }

    const { data, error } = await createServerClient()
      .from('organizations')
      .update({ preferred_region: preferredRegion })
      .eq('id', resolved.auth.organizationId)
      .select('id, preferred_region')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      preferredRegion: (data as { preferred_region?: unknown }).preferred_region ?? preferredRegion,
      requiresKoreanResidency: preferredRegion === 'seoul',
      regionPinAvailable: canPinRegion(resolved.auth.plan),
    });
  } catch (error) {
    logServerError('Persona region preference PATCH failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'region_preference_failed', message: 'Failed to save region preference.' } },
      { status: 500 },
    );
  }
}
