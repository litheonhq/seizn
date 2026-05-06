import { handleCheckoutSessionCompleted } from './checkout-session-completed';
import { handleCustomerCreated, handleCustomerUpdated } from './customer-created';
import { handleInvoicePaid } from './invoice-paid';
import { handleInvoicePaymentFailed } from './invoice-payment-failed';
import { handleSubscriptionCreated } from './subscription-created';
import { handleSubscriptionDeleted } from './subscription-deleted';
import { handleSubscriptionUpdated } from './subscription-updated';
import type {
  StripeEventObject,
  StripeEventType,
  SupabaseClient,
} from './types';

export type StripeEventHandler = (
  eventData: StripeEventObject,
  supabase: SupabaseClient,
) => Promise<void>;

const HANDLERS: Record<StripeEventType, StripeEventHandler> = {
  'checkout.session.completed': handleCheckoutSessionCompleted,
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'customer.created': handleCustomerCreated,
  'customer.updated': handleCustomerUpdated,
};

/**
 * Dispatch a Stripe event to its handler. Unknown event types log and no-op so
 * Stripe still sees a 200 from the webhook (preventing retry storms for
 * events we have not yet wired up).
 */
export async function dispatchStripeEvent(
  eventType: string,
  eventData: StripeEventObject,
  supabase: SupabaseClient,
): Promise<void> {
  const handler = HANDLERS[eventType as StripeEventType];
  if (!handler) {
    console.log(`Unhandled Stripe event: ${eventType}`);
    return;
  }
  await handler(eventData, supabase);
}

export type { StripeEventObject, StripeEventType, StripeWebhookPayload, SupabaseClient } from './types';
export { verifyStripeSignature } from './utils';
