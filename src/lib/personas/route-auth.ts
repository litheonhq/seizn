import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { getEffectivePlan, getPlan, isUnlimited } from '@/lib/plan-limits';
import { createServerClient } from '@/lib/supabase';

export type PersonaRouteAuth = {
  userId: string;
  organizationId: string;
  plan: string;
  batchLimit: number;
};

export async function resolvePersonaRouteAuth(
  request: NextRequest,
): Promise<{ auth: PersonaRouteAuth } | { response: NextResponse }> {
  const user = await getRequestUser(request);
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required.' } },
        { status: 401 },
      ),
    };
  }

  const supabase = createServerClient();
  const organizationId =
    user.organizationId ||
    (await resolveComplianceOrganizationId(supabase, {
      userId: user.id,
      keyId: null,
    }));

  if (!organizationId) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: { code: 'organization_required', message: 'Organization scope is required.' },
        },
        { status: 403 },
      ),
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('plan, subscription_ends_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'profile_lookup_failed', message: 'Unable to load plan.' } },
        { status: 500 },
      ),
    };
  }

  const plan = getEffectivePlan({
    plan: typeof data?.plan === 'string' ? data.plan : 'free',
    subscription_ends_at:
      typeof data?.subscription_ends_at === 'string' ? data.subscription_ends_at : null,
  });
  const batchLimit = getPlan(plan).features.personaSeedingMaxBatch;

  return {
    auth: {
      userId: user.id,
      organizationId,
      plan,
      batchLimit,
    },
  };
}

export function validatePersonaBatchLimit(
  count: number,
  auth: PersonaRouteAuth,
): NextResponse | null {
  const plan = getPlan(auth.plan);
  if (!plan.features.personaSeeding) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'plan_required',
          message: 'Persona seeding is not available on this plan.',
        },
      },
      { status: 403 },
    );
  }

  if (!isUnlimited(auth.batchLimit) && count > auth.batchLimit) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'quota_exceeded',
          message: 'Persona seeding batch limit exceeded.',
          requested: count,
          limit: auth.batchLimit,
        },
      },
      { status: 403 },
    );
  }

  return null;
}

export function parsePersonaCount(value: unknown, fallback = 12): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(5000, Math.max(1, Math.floor(parsed)));
}
