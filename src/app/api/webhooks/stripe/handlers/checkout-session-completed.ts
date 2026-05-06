import { AUTHOR_PRICE_LOCK_VERSION } from '@/lib/stripe-config';
import { findUser, logBillingEvent } from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleCheckoutSessionCompleted(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = eventData.customer;
  const subscriptionId = eventData.subscription;
  const customUserId = eventData.client_reference_id || eventData.metadata?.user_id;

  if (eventData.mode !== 'subscription') {
    console.log('Checkout is not for subscription, skipping plan update');
    await logBillingEvent(supabase, customUserId || null, 'checkout_completed', {
      mode: eventData.mode,
      customer_id: customerId,
      payment_status: eventData.payment_status,
    });
    return;
  }

  if (!subscriptionId || !customerId) {
    console.error('Missing subscription or customer ID in checkout session');
    return;
  }

  let user = await findUser(supabase, customerId, customUserId);
  if (!user && customUserId) {
    user = { id: customUserId };
  }

  if (!user) {
    console.error('Could not find user for checkout session', { customerId, customUserId });
    return;
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_subscription_status: eventData.status ?? null,
      price_lock_version: eventData.metadata?.price_lock_version ?? AUTHOR_PRICE_LOCK_VERSION,
      plan_updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update user with checkout info:', error);
    await logBillingEvent(supabase, user.id, 'checkout_completed', {
      customer_id: customerId,
      subscription_id: subscriptionId,
    }, 'failed', error.message);
  } else {
    console.log(`Checkout completed for user ${user.id}`);
    await logBillingEvent(supabase, user.id, 'checkout_completed', {
      customer_id: customerId,
      subscription_id: subscriptionId,
      payment_status: eventData.payment_status,
    });
  }
}
