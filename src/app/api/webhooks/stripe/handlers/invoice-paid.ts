import { findUser, logBillingEvent } from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleInvoicePaid(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = eventData.customer as string;
  const subscriptionId = eventData.subscription;

  console.log(
    `Invoice paid for customer ${customerId}, subscription ${subscriptionId}`,
    {
      amount_paid: eventData.amount_paid,
      currency: eventData.currency,
      billing_reason: eventData.billing_reason,
    },
  );

  const user = await findUser(supabase, customerId, null);
  if (!user) return;

  // Clear any payment failed flags now that we have a successful charge.
  await supabase
    .from('profiles')
    .update({
      subscription_payment_failed: false,
      subscription_payment_failed_at: null,
    })
    .eq('id', user.id);

  await logBillingEvent(supabase, user.id, 'invoice_paid', {
    subscription_id: subscriptionId,
    amount_paid: eventData.amount_paid,
    currency: eventData.currency,
    billing_reason: eventData.billing_reason,
    invoice_url: eventData.hosted_invoice_url,
  });
}
