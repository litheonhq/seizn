import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({})),
  hasServerSupabaseServiceRoleConfig: vi.fn(() => false),
}));

vi.mock('@/lib/stripe-config', () => ({
  AUTHOR_PRICE_LOCK_VERSION: 7,
  getPlanFromStripePriceId: vi.fn(),
  mapStripeSubscriptionStatus: vi.fn(),
}));

vi.mock('@/lib/billing/v8-products', () => ({
  applyV8Track2TierToApiKeys: vi.fn(),
  getV8Track2TierFromStripePriceId: vi.fn(),
}));

vi.mock('@/lib/stripe-metered', () => ({
  ensureMeteredPriceAttached: vi.fn(),
  ensureV8Track2OpusOverageAttached: vi.fn(),
  ensureV8Track2OpusOverageDetached: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  paymentFailedEmail: vi.fn(),
}));

const handlerCalls: string[] = [];
vi.mock('../checkout-session-completed', () => ({
  handleCheckoutSessionCompleted: vi.fn(async () => { handlerCalls.push('checkout'); }),
}));
vi.mock('../subscription-created', () => ({
  handleSubscriptionCreated: vi.fn(async () => { handlerCalls.push('sub.created'); }),
}));
vi.mock('../subscription-updated', () => ({
  handleSubscriptionUpdated: vi.fn(async () => { handlerCalls.push('sub.updated'); }),
}));
vi.mock('../subscription-deleted', () => ({
  handleSubscriptionDeleted: vi.fn(async () => { handlerCalls.push('sub.deleted'); }),
}));
vi.mock('../invoice-paid', () => ({
  handleInvoicePaid: vi.fn(async () => { handlerCalls.push('invoice.paid'); }),
}));
vi.mock('../invoice-payment-failed', () => ({
  handleInvoicePaymentFailed: vi.fn(async () => { handlerCalls.push('invoice.failed'); }),
}));
vi.mock('../customer-created', () => ({
  handleCustomerCreated: vi.fn(async () => { handlerCalls.push('cust.created'); }),
  handleCustomerUpdated: vi.fn(async () => { handlerCalls.push('cust.updated'); }),
}));

import { dispatchStripeEvent } from '../index';
import type { StripeEventObject, SupabaseClient } from '../types';

const FAKE_EVENT: StripeEventObject = { id: 'evt_1', object: 'event' };
const FAKE_SUPABASE = {} as SupabaseClient;

describe('dispatchStripeEvent', () => {
  it('routes checkout.session.completed', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('checkout.session.completed', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['checkout']);
  });

  it('routes customer.subscription.created', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('customer.subscription.created', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['sub.created']);
  });

  it('routes customer.subscription.updated', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('customer.subscription.updated', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['sub.updated']);
  });

  it('routes customer.subscription.deleted', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('customer.subscription.deleted', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['sub.deleted']);
  });

  it('routes invoice.paid', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('invoice.paid', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['invoice.paid']);
  });

  it('routes invoice.payment_failed', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('invoice.payment_failed', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['invoice.failed']);
  });

  it('routes customer.created', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('customer.created', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['cust.created']);
  });

  it('routes customer.updated', async () => {
    handlerCalls.length = 0;
    await dispatchStripeEvent('customer.updated', FAKE_EVENT, FAKE_SUPABASE);
    expect(handlerCalls).toEqual(['cust.updated']);
  });

  it('logs and no-ops on unknown event type (no throw)', async () => {
    handlerCalls.length = 0;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(dispatchStripeEvent('payment_intent.created', FAKE_EVENT, FAKE_SUPABASE)).resolves.toBeUndefined();
    expect(handlerCalls).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Stripe event'));
    consoleSpy.mockRestore();
  });
});
