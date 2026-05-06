import {
  attachMeteredOverageItems,
  attachV8Track2ManagedOverage,
  buildSubscriptionProfileUpdates,
  detachV8Track2ManagedOverageIfDowngrade,
  extractPriceId,
  findUser,
  logBillingEvent,
  maybeApplyV8Track2,
} from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleSubscriptionUpdated(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = eventData.customer as string;
  const subscriptionId = eventData.id;
  const priceId = extractPriceId(eventData.items);

  if (!customerId) {
    console.error('Missing customer ID in subscription update');
    return;
  }

  const user = await findUser(supabase, customerId, eventData.metadata?.user_id);
  if (!user) {
    console.error(`User not found for customer: ${customerId}`);
    return;
  }

  if (priceId) {
    const v8 = await maybeApplyV8Track2(supabase, user.id, priceId);
    if (v8.matched) {
      if (!v8.updated) {
        console.error('Failed to apply v8 Track 2 tier on api_keys:', v8.error);
        await logBillingEvent(supabase, user.id, 'subscription_updated', {
          subscription_id: subscriptionId,
          channel: 'track2',
          tier: v8.tier,
          price_id: priceId,
        }, 'failed', v8.error);
      } else {
        console.log(`v8 Track 2 subscription updated for user ${user.id}: ${v8.tier}`);
        // Symmetric upgrade/downgrade handling for the Studio Managed Opus
        // overage line: attach if user is now on Studio Managed, detach if
        // they moved off it. Both calls are idempotent.
        await attachV8Track2ManagedOverage(subscriptionId, v8.tier);
        await detachV8Track2ManagedOverageIfDowngrade(subscriptionId, v8.tier);
        await logBillingEvent(supabase, user.id, 'subscription_updated', {
          subscription_id: subscriptionId,
          channel: 'track2',
          tier: v8.tier,
          price_id: priceId,
          cancel_at_period_end: eventData.cancel_at_period_end,
          status: eventData.status,
        });
      }
      return;
    }
  }

  const updates = buildSubscriptionProfileUpdates(eventData);
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update subscription:', error);
    await logBillingEvent(supabase, user.id, 'subscription_updated', {
      subscription_id: eventData.id,
      updates,
    }, 'failed', error.message);
  } else {
    console.log(`Subscription updated for user ${user.id}`);
    if (typeof updates.plan === 'string') {
      await attachMeteredOverageItems(subscriptionId, updates.plan);
    }
    await logBillingEvent(supabase, user.id, 'subscription_updated', {
      subscription_id: eventData.id,
      cancel_at_period_end: eventData.cancel_at_period_end,
      status: eventData.status,
      price_id: priceId,
    });
  }
}
