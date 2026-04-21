import type { createServerClient } from '@/lib/supabase';

export const DESIGN_PARTNER_COUPON_CODE =
  process.env.SEIZN_DESIGN_PARTNER_COUPON || 'SEIZN_DP_2026';
export const DESIGN_PARTNER_MAX_SLOTS = 10;

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface DesignPartnerSlotStats {
  maxSlots: number;
  claimedSlots: number;
  remainingSlots: number;
}

export async function getDesignPartnerSlotStats(
  supabase: SupabaseLike
): Promise<DesignPartnerSlotStats> {
  const [{ count: relationshipCount }, { count: approvedApplicationCount }] =
    await Promise.all([
      supabase
        .from('design_partner_relationships')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'completed']),
      supabase
        .from('design_partner_applications')
        .select('id', { count: 'exact', head: true })
        .in('status', ['approved', 'converted']),
    ]);

  const claimedSlots = Math.max(relationshipCount || 0, approvedApplicationCount || 0);
  return {
    maxSlots: DESIGN_PARTNER_MAX_SLOTS,
    claimedSlots,
    remainingSlots: Math.max(0, DESIGN_PARTNER_MAX_SLOTS - claimedSlots),
  };
}

export async function isApprovedDesignPartnerStudio(
  supabase: SupabaseLike,
  studioId: string | null | undefined
): Promise<boolean> {
  if (!studioId) return false;

  const { data: relationship } = await supabase
    .from('design_partner_relationships')
    .select('id')
    .eq('studio_id', studioId)
    .in('status', ['active', 'completed'])
    .maybeSingle();

  if (relationship) return true;

  const { data: application } = await supabase
    .from('design_partner_applications')
    .select('id')
    .eq('studio_id', studioId)
    .in('status', ['approved', 'converted'])
    .maybeSingle();

  return Boolean(application);
}
