import { getPlan } from '@/lib/plan-limits';
import { createServerClient } from '@/lib/supabase';

type Supabase = ReturnType<typeof createServerClient>;

export const PREFERRED_REGIONS = ['auto', 'seoul', 'us-east-1', 'eu-west-1'] as const;

export type PreferredRegion = (typeof PREFERRED_REGIONS)[number];

export function isPreferredRegion(value: unknown): value is PreferredRegion {
  return typeof value === 'string' && (PREFERRED_REGIONS as readonly string[]).includes(value);
}

export function normalizePreferredRegion(value: unknown): PreferredRegion {
  return isPreferredRegion(value) ? value : 'auto';
}

export function canPinRegion(planName: string): boolean {
  return getPlan(planName).features.regionPin;
}

export async function getPreferredRegion(
  orgId: string,
  supabase: Supabase = createServerClient(),
): Promise<PreferredRegion> {
  const { data, error } = await supabase
    .from('organizations')
    .select('preferred_region')
    .eq('id', orgId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizePreferredRegion((data as { preferred_region?: unknown } | null)?.preferred_region);
}

export async function requireKoreanResidency(
  orgId: string,
  supabase: Supabase = createServerClient(),
): Promise<boolean> {
  return (await getPreferredRegion(orgId, supabase)) === 'seoul';
}
