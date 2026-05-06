import { paymentFailedEmail, sendEmail } from '@/lib/email';
import { findUser, logBillingEvent } from './utils';
import type { StripeEventObject, SupabaseClient } from './types';

export async function handleInvoicePaymentFailed(
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = eventData.customer as string;
  const subscriptionId = eventData.subscription;

  console.log(
    `Payment failed for customer ${customerId}, subscription ${subscriptionId}`,
    {
      amount_due: eventData.amount_due,
      currency: eventData.currency,
    },
  );

  const user = await findUser(supabase, customerId, null);

  if (user) {
    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_payment_failed: true,
        subscription_payment_failed_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) console.error('Failed to mark payment as failed:', error);

    await logBillingEvent(supabase, user.id, 'invoice_payment_failed', {
      subscription_id: subscriptionId,
      amount_due: eventData.amount_due,
      currency: eventData.currency,
      hosted_invoice_url: eventData.hosted_invoice_url,
    });
  }

  if (user?.email) {
    await sendEmail({
      to: user.email,
      subject: 'Action required: Your Seizn payment failed',
      html: paymentFailedEmail(
        user.full_name || 'there',
        String(eventData.amount_due),
        eventData.currency,
        eventData.hosted_invoice_url,
      ),
    }).catch((err) => console.error('Failed to send payment failure email:', err));
  }
}
