import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/billing/checkout/route';
import { AUTHOR_TRIAL_DAYS } from '@/lib/stripe-config';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'user-1', email: 'author@example.com' } } as { user?: { id?: string; email?: string | null } } | null,
  profile: {
    stripe_customer_id: 'cus_author_123',
    stripe_subscription_id: null,
    stripe_subscription_status: null,
    subscription_status: null,
  } as {
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_subscription_status?: string | null;
    subscription_status?: string | null;
  } | null,
  customerCreate: vi.fn(),
  subscriptionsList: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  profileUpdates: [] as Record<string, unknown>[],
  byokStatus: { enabled: false },
}));

vi.mock('@/lib/auth', () => ({
  auth: async () => mocks.session,
}));

vi.mock('@/lib/csrf', () => ({
  verifyCsrf: () => null,
}));

vi.mock('@/lib/author/llm', () => ({
  getAuthorByokStatus: async () => mocks.byokStatus,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mocks.profile, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        mocks.profileUpdates.push(values);
        return { eq: () => ({}) };
      },
    }),
  }),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    customers: { create: mocks.customerCreate },
    subscriptions: { list: mocks.subscriptionsList },
    checkout: { sessions: { create: mocks.checkoutCreate } },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  }),
}));

const ORIGINAL_ENV = {
  STRIPE_PRICE_ID_PRO_MONTHLY: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
};

describe('Author checkout route', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly_v7';
    mocks.session = { user: { id: 'user-1', email: 'author@example.com' } };
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
    };
    mocks.byokStatus = { enabled: false };
    mocks.profileUpdates = [];
    mocks.customerCreate.mockResolvedValue({ id: 'cus_created_123' });
    mocks.subscriptionsList.mockResolvedValue({ data: [] });
    mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_123' });
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_123' });
  });

  afterEach(() => {
    restoreEnv('STRIPE_PRICE_ID_PRO_MONTHLY', ORIGINAL_ENV.STRIPE_PRICE_ID_PRO_MONTHLY);
    vi.clearAllMocks();
  });

  it.each(['active', 'trialing', 'past_due'])(
    'redirects an existing %s subscriber to the billing portal',
    async (status) => {
      mocks.profile = {
        stripe_customer_id: 'cus_author_123',
        stripe_subscription_id: 'sub_author_123',
        stripe_subscription_status: status,
        subscription_status: status,
      };
      mocks.subscriptionsList.mockResolvedValue({
        data: [stripeSubscription('sub_author_123', status, 'price_pro_monthly_v7')],
      });

      const response = await POST(makeCheckoutRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        url: 'https://billing.stripe.com/session_123',
        destination: 'billing_portal',
        reason: 'active_subscription',
      });
      expect(mocks.portalCreate).toHaveBeenCalledWith({
        customer: 'cus_author_123',
        return_url: 'https://app.seizn.test/dashboard/billing',
      });
      expect(mocks.profileUpdates).toContainEqual(expect.objectContaining({
        stripe_subscription_id: 'sub_author_123',
        stripe_subscription_status: status,
        stripe_price_id: 'price_pro_monthly_v7',
      }));
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    }
  );

  it('recovers a stale local profile from a live Stripe subscription before checkout', async () => {
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
    };
    mocks.subscriptionsList.mockResolvedValue({
      data: [stripeSubscription('sub_live_123', 'active', 'price_pro_monthly_v7')],
    });

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.destination).toBe('billing_portal');
    expect(mocks.profileUpdates).toContainEqual(expect.objectContaining({
      stripe_subscription_id: 'sub_live_123',
      stripe_subscription_status: 'active',
      subscription_status: 'active',
    }));
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it.each(['canceled', 'incomplete', 'incomplete_expired'])(
    'allows a new checkout for a %s subscription state',
    async (status) => {
      mocks.profile = {
        stripe_customer_id: 'cus_author_123',
        stripe_subscription_id: 'sub_author_123',
        stripe_subscription_status: status,
        subscription_status: status,
      };
      mocks.subscriptionsList.mockResolvedValue({
        data: [stripeSubscription('sub_author_123', status, 'price_pro_monthly_v7')],
      });

      const response = await POST(makeCheckoutRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.url).toBe('https://checkout.stripe.com/session_123');
      expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_author_123',
        line_items: [{ price: 'price_pro_monthly_v7', quantity: 1 }],
      }));
      expect(mocks.portalCreate).not.toHaveBeenCalled();
    }
  );

  it('allows checkout when local active state is stale but Stripe only has canceled subscriptions', async () => {
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: 'sub_stale_123',
      stripe_subscription_status: 'active',
      subscription_status: 'active',
    };
    mocks.subscriptionsList.mockResolvedValue({
      data: [stripeSubscription('sub_canceled_123', 'canceled', 'price_pro_monthly_v7')],
    });

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expect(mocks.portalCreate).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_author_123',
    }));
  });

  it('chooses an active subscription from multiple Stripe subscriptions', async () => {
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
    };
    mocks.subscriptionsList.mockResolvedValue({
      data: [
        stripeSubscription('sub_canceled_123', 'canceled', 'price_pro_monthly_v7'),
        stripeSubscription('sub_trial_123', 'trialing', 'price_pro_monthly_v7'),
      ],
    });

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      destination: 'billing_portal',
      reason: 'active_subscription',
    });
    expect(mocks.profileUpdates).toContainEqual(expect.objectContaining({
      stripe_subscription_id: 'sub_trial_123',
      stripe_subscription_status: 'trialing',
      subscription_status: 'active',
    }));
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('blocks duplicate checkout for other live Stripe subscription states', async () => {
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
    };
    mocks.subscriptionsList.mockResolvedValue({
      data: [stripeSubscription('sub_paused_123', 'paused', 'price_pro_monthly_v7')],
    });

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.destination).toBe('billing_portal');
    expect(mocks.profileUpdates).toContainEqual(expect.objectContaining({
      stripe_subscription_id: 'sub_paused_123',
      stripe_subscription_status: 'paused',
      subscription_status: 'paused',
    }));
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe customer before checkout when none exists', async () => {
    mocks.profile = {
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
    };

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expect(mocks.customerCreate).toHaveBeenCalledWith(expect.objectContaining({
      email: 'author@example.com',
      metadata: expect.objectContaining({ user_id: 'user-1' }),
    }));
    expect(mocks.profileUpdates).toContainEqual({ stripe_customer_id: 'cus_created_123' });
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_created_123',
    }));
  });

  it('creates checkout as a no-card 30-day trial session', async () => {
    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      payment_method_types: ['card'],
      payment_method_collection: 'if_required',
      subscription_data: expect.objectContaining({
        trial_period_days: AUTHOR_TRIAL_DAYS,
        trial_settings: {
          end_behavior: {
            missing_payment_method: 'cancel',
          },
        },
      }),
    }));
  });
});

function makeCheckoutRequest(): NextRequest {
  return new NextRequest('https://app.seizn.test/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tier: 'pro', cadence: 'monthly' }),
  });
}

function stripeSubscription(id: string, status: string, priceId: string) {
  return {
    id,
    status,
    items: {
      data: [{ price: { id: priceId } }],
    },
  };
}

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
