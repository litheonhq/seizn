/**
 * Charter Managed entitlements helper.
 *
 * Locked 2026-05-07. Maps a (tier, charter_eligible) pair to the perks the
 * v9 launch promised:
 *   - Priority queue (all Managed)
 *   - 48h support SLA (all Managed)
 *   - Beta features access (all Managed)
 *   - Founding Member badge (Charter eligible)
 *   - xhigh effort default (Pro+ Managed)
 *   - Monthly Continuity Report (Pro+ Managed)
 *   - Collaborator seats (Pro=2, Studio=5, Enterprise=unlimited)
 *   - Custom prompt overrides (Studio+)
 *
 * Sync from Stripe webhook → managed_entitlements table.
 */

import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
  type BillingColumn,
  isAuthorBillingTier,
} from '@/lib/stripe-config';

export interface ManagedEntitlements {
  userId: string;
  tier: AuthorBillingTier;
  foundingMember: boolean;
  betaFeaturesEnabled: boolean;
  prioritySupportSlaHours: number;
  collaboratorSeats: number;
  /** xhigh effort default for Author LLM calls. Pro+ Managed only. */
  xhighEffortIncluded: boolean;
  /** Monthly auto-generated continuity report. Pro+ Managed only. */
  continuityReportEnabled: boolean;
  /** Custom prompt overrides allowed. Studio+ Managed only. */
  customPromptsEnabled: boolean;
  /** Tier requires user-supplied API key even though we manage SLA/perks. */
  requiresUserApiKey: boolean;
}

export const SEATS_BY_TIER: Record<AuthorBillingTier, number> = {
  indie: 1,
  pro: 2,
  studio: 5,
  enterprise: 100, // effectively unlimited; renegotiated per contract.
};

export function deriveEntitlements(
  userId: string,
  tier: AuthorBillingTier,
  column: BillingColumn,
  charterEligible: boolean,
): ManagedEntitlements | null {
  const tierConfig = AUTHOR_BILLING_TIERS[tier];
  // Enterprise is byokOnly = true: it sells under the Managed Stripe product
  // (since *_MANAGED env prefix carries the price), but the user must supply
  // their own LLM key. So Enterprise customers DO get Managed perks (priority
  // queue, support, badge, seats, custom prompts) but NOT a Managed LLM —
  // requiresUserApiKey signals that the perk pipeline must still demand a key.
  // BYOK column on non-byokOnly tiers gets no Managed perks at all.
  if (column !== 'managed' && !tierConfig.byokOnly) return null;
  return {
    userId,
    tier,
    foundingMember: charterEligible,
    betaFeaturesEnabled: true,
    prioritySupportSlaHours: 48,
    collaboratorSeats: SEATS_BY_TIER[tier],
    // Indie Managed runs medium effort to protect $27/mo margin. Pro+ gets
    // xhigh by default per CLAUDE.md "Effort 정책: Pro/Studio/Enterprise
    // Managed: xhigh 포함". Enterprise is byokOnly (user-supplied LLM key)
    // but the perk pipeline still defaults their effort to xhigh — round 4
    // audit caught the prior `!byokOnly` clause incorrectly degrading them.
    xhighEffortIncluded: tier !== 'indie',
    continuityReportEnabled: tier !== 'indie',
    customPromptsEnabled: tier === 'studio' || tier === 'enterprise',
    requiresUserApiKey: Boolean(tierConfig.byokOnly),
  };
}

/**
 * Upsert the Managed entitlements row for a user. Idempotent — ON CONFLICT
 * updates the row in place.
 *
 * Caller signals downgrade explicitly via `downgrade: true` to delete the
 * row. Without that flag, a missing-perks case (e.g., user moved to BYOK
 * column on a non-Enterprise tier) leaves the row alone — webhook
 * anomalies must not silently strip Enterprise / Managed perks (audit
 * round 3 hardening).
 */
export async function syncManagedEntitlements(input: {
  userId: string;
  tier: AuthorBillingTier;
  column: BillingColumn;
  charterEligible: boolean;
  downgrade?: boolean;
}): Promise<void> {
  if (!hasServerSupabaseServiceRoleConfig()) return;
  if (input.downgrade) {
    const supabase = createServerClient();
    await supabase.from('managed_entitlements').delete().eq('user_id', input.userId);
    return;
  }
  const entitlements = deriveEntitlements(
    input.userId,
    input.tier,
    input.column,
    input.charterEligible,
  );
  if (!entitlements) {
    // No perks computed (e.g., BYOK column on non-Enterprise tier). Leave
    // any existing row alone — the explicit downgrade path is the only
    // way to remove perks. Log so support can detect anomalies.
    console.log('[entitlements] derive returned null; preserving existing row', {
      userId: input.userId,
      tier: input.tier,
      column: input.column,
    });
    return;
  }
  const supabase = createServerClient();
  const { error } = await supabase.from('managed_entitlements').upsert(
    {
      user_id: entitlements.userId,
      tier: entitlements.tier,
      founding_member: entitlements.foundingMember,
      beta_features_enabled: entitlements.betaFeaturesEnabled,
      priority_support_sla_hours: entitlements.prioritySupportSlaHours,
      collaborator_seats: entitlements.collaboratorSeats,
      custom_prompt_overrides: null,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[entitlements] upsert failed', {
      userId: input.userId,
      tier: input.tier,
      error: error.message,
    });
  }
}

/**
 * Read entitlements for a user. Returns null if the user has no Managed
 * subscription.
 */
export async function getManagedEntitlements(
  userId: string,
): Promise<ManagedEntitlements | null> {
  if (!hasServerSupabaseServiceRoleConfig()) return null;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('managed_entitlements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<{
      user_id: string;
      tier: string;
      founding_member: boolean;
      beta_features_enabled: boolean;
      priority_support_sla_hours: number;
      collaborator_seats: number;
    }>();
  if (!data || !isAuthorBillingTier(data.tier)) return null;
  const tierConfig = AUTHOR_BILLING_TIERS[data.tier];
  return {
    userId: data.user_id,
    tier: data.tier,
    foundingMember: data.founding_member,
    betaFeaturesEnabled: data.beta_features_enabled,
    prioritySupportSlaHours: data.priority_support_sla_hours,
    collaboratorSeats: data.collaborator_seats,
    xhighEffortIncluded: data.tier !== 'indie',
    continuityReportEnabled: data.tier !== 'indie',
    customPromptsEnabled: data.tier === 'studio' || data.tier === 'enterprise',
    requiresUserApiKey: Boolean(tierConfig.byokOnly),
  };
}

/**
 * Read xhigh entitlement for the LLM provider router. Returns true when
 * Managed Pro+ — used to choose `effort: 'xhigh'` vs default.
 */
export async function isXhighEffortIncluded(userId: string): Promise<boolean> {
  const entitlements = await getManagedEntitlements(userId);
  return entitlements?.xhighEffortIncluded ?? false;
}
