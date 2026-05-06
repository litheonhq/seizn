import {
  applyV8Track2TierToApiKeys,
  getV8Track2TierFromStripePriceId,
} from '@/lib/billing/v8-products';
import {
  extractPriceId,
  findUser,
  logBillingEvent,
  stripeTimestampToIso,
} from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleSubscriptionDeleted(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = eventData.customer as string;
  const subscriptionId = eventData.id;
  const priceId = extractPriceId(eventData.items);

  if (!customerId) {
    console.error('Missing customer ID in subscription deletion');
    return;
  }

  const user = await findUser(supabase, customerId, eventData.metadata?.user_id);

  if (user && priceId) {
    const v8Tier = getV8Track2TierFromStripePriceId(priceId);
    if (v8Tier) {
      const downgrade = await applyV8Track2TierToApiKeys(
        user.id,
        'free',
        supabase as unknown as Parameters<typeof applyV8Track2TierToApiKeys>[2],
      );
      await logBillingEvent(supabase, user.id, 'subscription_deleted', {
        subscription_id: subscriptionId,
        channel: 'track2',
        previous_tier: v8Tier,
        downgraded_to: 'free',
        ended_at: eventData.ended_at,
      }, downgrade.ok ? 'success' : 'failed', downgrade.ok ? undefined : downgrade.error);
      return;
    }
  }

  if (!user) return;

  const { error } = await supabase
    .from('profiles')
    .update({
      plan: 'free',
      plan_updated_at: new Date().toISOString(),
      stripe_subscription_id: null,
      stripe_subscription_status: 'canceled',
      subscription_status: 'cancelled',
      stripe_price_id: null,
      stripe_current_period_end: stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString(),
      subscription_cancelled: true,
      subscription_ends_at: stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString(),
      subscription_renews_at: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to downgrade subscription:', error);
    await logBillingEvent(supabase, user.id, 'subscription_deleted', {
      subscription_id: subscriptionId,
    }, 'failed', error.message);
  } else {
    console.log(`Subscription deleted for user ${user.id}, downgraded to free`);
    await logBillingEvent(supabase, user.id, 'subscription_deleted', {
      subscription_id: subscriptionId,
      ended_at: eventData.ended_at,
      canceled_at: eventData.canceled_at,
    });
  }
}
