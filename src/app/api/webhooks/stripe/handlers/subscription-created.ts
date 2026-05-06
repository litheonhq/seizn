import { getPlanFromStripePriceId } from '@/lib/stripe-config';
import {
  attachMeteredOverageItems,
  attachV8Track2ManagedOverage,
  buildSubscriptionProfileUpdates,
  extractPriceId,
  findUser,
  logBillingEvent,
  maybeApplyV8Track2,
} from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleSubscriptionCreated(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = eventData.customer as string;
  const subscriptionId = eventData.id;
  const priceId = extractPriceId(eventData.items);
  const customUserId = eventData.metadata?.user_id;

  if (!priceId) {
    console.error('No price ID in subscription');
    return;
  }

  let user = await findUser(supabase, customerId, customUserId);
  if (!user && customUserId) {
    user = { id: customUserId };
  }
  if (!user) {
    console.error('Could not find user for subscription', { customerId, customUserId });
    return;
  }

  const v8 = await maybeApplyV8Track2(supabase, user.id, priceId);
  if (v8.matched) {
    if (!v8.updated) {
      console.error('Failed to apply v8 Track 2 tier on api_keys:', v8.error);
      await logBillingEvent(supabase, user.id, 'subscription_created', {
        subscription_id: subscriptionId,
        channel: 'track2',
        tier: v8.tier,
        price_id: priceId,
      }, 'failed', v8.error);
    } else {
      console.log(`v8 Track 2 subscription created for user ${user.id}: ${v8.tier}`);
      await attachV8Track2ManagedOverage(subscriptionId, v8.tier);
      await logBillingEvent(supabase, user.id, 'subscription_created', {
        subscription_id: subscriptionId,
        channel: 'track2',
        tier: v8.tier,
        price_id: priceId,
        current_period_end: eventData.current_period_end,
      });
    }
    return;
  }

  const plan = getPlanFromStripePriceId(priceId);
  if (!plan) {
    console.error(`Unknown price ID: ${priceId}`);
    return;
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      ...buildSubscriptionProfileUpdates(eventData),
      stripe_customer_id: customerId,
    })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update user plan:', error);
    await logBillingEvent(supabase, user.id, 'subscription_created', {
      subscription_id: subscriptionId,
      plan,
      price_id: priceId,
    }, 'failed', error.message);
  } else {
    console.log(`Subscription created for user ${user.id}: ${plan} plan`);
    await attachMeteredOverageItems(subscriptionId, plan);
    await logBillingEvent(supabase, user.id, 'subscription_created', {
      subscription_id: subscriptionId,
      plan,
      price_id: priceId,
      current_period_end: eventData.current_period_end,
    });
  }
}
