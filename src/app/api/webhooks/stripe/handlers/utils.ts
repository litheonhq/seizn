import * as crypto from 'crypto';
import {
  AUTHOR_PRICE_LOCK_VERSION,
  getPlanFromStripePriceId,
  mapStripeSubscriptionStatus,
} from '@/lib/stripe-config';
import {
  applyV8Track2TierToApiKeys,
  getV8Track2TierFromStripePriceId,
  type V8Track2Tier,
} from '@/lib/billing/v8-products';
import {
  ensureMeteredPriceAttached,
  ensureV8Track2OpusOverageAttached,
  ensureV8Track2OpusOverageDetached,
} from '@/lib/stripe-metered';
import type {
  ProfileUser,
  StripeEventObject,
  StripeSubscriptionItem,
  SupabaseClient,
} from './types';

/**
 * Verify Stripe webhook signature.
 * Parses the Stripe-Signature header (`t=<ts>,v1=<sig>`), checks the timestamp
 * is within tolerance (5 min), and confirms the v1 signature matches an HMAC
 * SHA-256 over `<ts>.<rawBody>` keyed by the webhook secret.
 */
export function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const parts = signature.split(',');
    const signatureData: Record<string, string> = {};
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) signatureData[key.trim()] = value.trim();
    }

    const timestamp = signatureData['t'];
    const expectedSignature = signatureData['v1'];
    if (!timestamp || !expectedSignature) {
      console.error('Missing timestamp or signature in Stripe-Signature header');
      return false;
    }

    const timestampInt = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300;
    if (Math.abs(now - timestampInt) > tolerance) {
      console.error('Stripe webhook timestamp is outside acceptable range');
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(signedPayload).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(digest),
    );
  } catch (error) {
    console.error('Error verifying Stripe signature:', error);
    return false;
  }
}

export function extractPriceId(items?: { data: StripeSubscriptionItem[] }): string | null {
  if (!items || items.data.length === 0) return null;
  return items.data[0]?.price?.id || null;
}

export function stripeTimestampToIso(value?: number | null): string | null {
  return value ? new Date(value * 1000).toISOString() : null;
}

export function buildSubscriptionProfileUpdates(
  eventData: StripeEventObject,
): Record<string, unknown> {
  const priceId = extractPriceId(eventData.items);
  const plan = priceId ? getPlanFromStripePriceId(priceId) : null;
  const periodEnd = stripeTimestampToIso(eventData.current_period_end);
  const cancelAtPeriodEnd = eventData.cancel_at_period_end === true;
  const updates: Record<string, unknown> = {
    stripe_subscription_id: eventData.id,
    stripe_subscription_status: eventData.status ?? null,
    subscription_status: mapStripeSubscriptionStatus(eventData.status),
    stripe_price_id: priceId,
    stripe_current_period_start: stripeTimestampToIso(eventData.current_period_start),
    stripe_current_period_end: periodEnd,
    subscription_ends_at: periodEnd,
    subscription_renews_at: cancelAtPeriodEnd ? null : periodEnd,
    subscription_trial_ends_at: stripeTimestampToIso(eventData.trial_end),
    subscription_cancelled: cancelAtPeriodEnd || eventData.status === 'canceled',
    subscription_payment_failed: eventData.status === 'past_due' || eventData.status === 'unpaid',
    price_lock_version: AUTHOR_PRICE_LOCK_VERSION,
  };
  if (plan) {
    updates.plan = plan;
    updates.plan_updated_at = new Date().toISOString();
  }
  return updates;
}

/**
 * Find user by Stripe customer ID first, then fall back to a custom user ID
 * (set on checkout via `client_reference_id` / metadata.user_id).
 */
export async function findUser(
  supabase: SupabaseClient,
  customerId: string | undefined,
  customUserId: string | undefined | null,
): Promise<ProfileUser | null> {
  if (customerId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('stripe_customer_id', customerId)
      .single();
    if (profile) return profile;
  }
  if (customUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', customUserId)
      .single();
    if (profile) return profile;
  }
  return null;
}

export async function logBillingEvent(
  supabase: SupabaseClient,
  userId: string | null,
  action: string,
  details: Record<string, unknown>,
  status: 'success' | 'failed' = 'success',
  errorMessage?: string,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: `billing.${action}`,
      resource_type: 'subscription',
      details,
      status,
      error_message: errorMessage,
    });
  } catch (error) {
    console.error('Failed to log billing event:', error);
  }
}

export type V8AdjustmentResult =
  | { matched: true; tier: V8Track2Tier; updated: boolean; error?: string }
  | { matched: false };

/**
 * Apply a v8 Track 2 (API+MCP) tier to the user's api_keys row if the price
 * matches a Track 2 product. Returns `matched: false` for plain author-plan
 * subscriptions so the legacy flow runs unchanged.
 */
export async function maybeApplyV8Track2(
  supabase: SupabaseClient,
  userId: string,
  priceId: string,
): Promise<V8AdjustmentResult> {
  const tier = getV8Track2TierFromStripePriceId(priceId);
  if (!tier) return { matched: false };
  const result = await applyV8Track2TierToApiKeys(
    userId,
    tier,
    supabase as unknown as Parameters<typeof applyV8Track2TierToApiKeys>[2],
  );
  if (!result.ok) return { matched: true, tier, updated: false, error: result.error };
  return { matched: true, tier, updated: true };
}

export async function attachMeteredOverageItems(subscriptionId: string, plan: string): Promise<void> {
  try {
    const result = await ensureMeteredPriceAttached(subscriptionId, plan);
    if (result.attached.length > 0) {
      console.log('Attached metered overage subscription items', {
        subscription_id: subscriptionId,
        plan,
        attached_count: result.attached.length,
      });
    }
  } catch (error) {
    console.error('Failed to attach metered overage subscription items:', error);
  }
}

export async function attachV8Track2ManagedOverage(
  subscriptionId: string,
  tier: V8Track2Tier,
): Promise<void> {
  try {
    const result = await ensureV8Track2OpusOverageAttached(subscriptionId, tier);
    if (result.attached) {
      console.log('Attached v8 Track 2 Studio Managed Opus overage', {
        subscription_id: subscriptionId,
        tier,
        price_id: result.priceId,
      });
    } else if (result.reason !== 'non_managed_tier' && result.reason !== 'already_attached') {
      console.warn('v8 Track 2 Studio Managed Opus overage attach skipped', {
        subscription_id: subscriptionId,
        tier,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.error('Failed to attach v8 Track 2 Studio Managed Opus overage:', error);
  }
}

/**
 * Detach the Studio Managed Opus overage subscription item when a user moves
 * OFF Studio Managed (downgrade to Hobby/Pro). No-op when the user is still on
 * Studio Managed — the attach helper handles the upgrade case separately, so
 * both calls together are idempotent.
 */
export async function detachV8Track2ManagedOverageIfDowngrade(
  subscriptionId: string,
  newTier: V8Track2Tier,
): Promise<void> {
  if (newTier === 'studio_managed') return;
  try {
    const result = await ensureV8Track2OpusOverageDetached(subscriptionId, newTier);
    if (result.detached) {
      console.log('Detached v8 Track 2 Studio Managed Opus overage on downgrade', {
        subscription_id: subscriptionId,
        new_tier: newTier,
        subscription_item_id: result.subscriptionItemId,
      });
    } else if (result.reason !== 'still_managed_tier' && result.reason !== 'not_attached') {
      console.warn('v8 Track 2 Studio Managed Opus overage detach skipped', {
        subscription_id: subscriptionId,
        new_tier: newTier,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.error('Failed to detach v8 Track 2 Studio Managed Opus overage:', error);
  }
}
