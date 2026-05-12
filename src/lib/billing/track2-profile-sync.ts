import type { createServerClient } from '@/lib/supabase';
import type { V8Track2Tier } from './v8-products';
import type { V9Track2Tier } from './v9-products';

// Track 2 plan column values mirror the v9 catalog tiers. `studio_managed`
// is a billing variant of Studio and collapses to the same profile.plan
// surface so /api/me + rate limits see one Studio.
export type Track2ProfilePlan = 'free' | 'indie' | 'pro' | 'studio' | 'enterprise';

export function track2TierToProfilePlan(
  tier: V8Track2Tier | V9Track2Tier,
): Track2ProfilePlan {
  if (tier === 'studio_managed') return 'studio';
  return tier;
}

export function stripeTimestampToIso(value?: number | null): string | null {
  return value ? new Date(value * 1000).toISOString() : null;
}

export interface SyncTrack2ProfileSubscriptionParams {
  userId: string;
  customerId: string;
  baseSubscriptionUpdates: Record<string, unknown>;
  tier: V8Track2Tier | V9Track2Tier;
  priceLockVersion: string;
}

export type SyncResult = { ok: true } | { ok: false; error: string };

// Reflects an active Track 2 subscription on the `profiles` row. The caller
// is responsible for assembling the per-subscription `baseSubscriptionUpdates`
// (stripe ids, periods, charter flags, etc.); this helper layers in the
// Track 2 tier-derived fields (`plan`, `plan_updated_at`, lock version,
// customer id).
//
// This was extracted from `src/app/api/webhooks/stripe/route.ts` so the
// Bug 3 fix (profile.plan now follows tier) has dedicated unit coverage.
export async function syncTrack2ProfileSubscription(
  supabase: ReturnType<typeof createServerClient>,
  params: SyncTrack2ProfileSubscriptionParams,
): Promise<SyncResult> {
  const { error } = await supabase
    .from('profiles')
    .update({
      ...params.baseSubscriptionUpdates,
      stripe_customer_id: params.customerId,
      plan: track2TierToProfilePlan(params.tier),
      plan_updated_at: new Date().toISOString(),
      price_lock_version: params.priceLockVersion,
    })
    .eq('id', params.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Minimal shape used during cancellation. Accepts the full Stripe event
// object too (it's a superset).
export interface StripeCancellationEventData {
  ended_at?: number | null;
}

// Downgrade the profile when the Track 2 subscription is canceled/deleted.
// Resets `plan` to `free`, clears stripe ids, and stamps the ended_at
// timestamps consistently across the legacy / current subscription columns.
export async function syncTrack2ProfileCancellation(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  eventData: StripeCancellationEventData,
): Promise<SyncResult> {
  const endedAtIso =
    stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString();

  const { error } = await supabase
    .from('profiles')
    .update({
      plan: 'free',
      plan_updated_at: new Date().toISOString(),
      stripe_subscription_id: null,
      stripe_subscription_status: 'canceled',
      subscription_status: 'cancelled',
      stripe_price_id: null,
      stripe_current_period_end: endedAtIso,
      subscription_cancelled: true,
      subscription_ends_at: endedAtIso,
      subscription_ended_at: endedAtIso,
      subscription_renews_at: null,
    })
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
