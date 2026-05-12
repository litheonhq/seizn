import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/billing/checkout/route';
import { CHECKOUT_LEGAL_VERSIONS } from '@/lib/checkout-copy';

const PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID = 'price_pro_managed_monthly_charter_v9';
const PRO_BYOK_MONTHLY_CHARTER_PRICE_ID = 'price_pro_byok_monthly_charter_v9';
const TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID = 'price_track2_pro_monthly_charter_v9';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'user-1', email: 'author@example.com' } } as { user?: { id?: string; email?: string | null } } | null,
  profile: {
    plan: 'free',
    stripe_customer_id: 'cus_author_123',
    stripe_subscription_id: null,
    stripe_subscription_status: null,
    subscription_status: null,
    stripe_price_id: null,
  } as {
    plan?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_subscription_status?: string | null;
    subscription_status?: string | null;
    stripe_price_id?: string | null;
  } | null,
  customerCreate: vi.fn(),
  subscriptionsList: vi.fn(),
  checkoutList: vi.fn(),
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
    checkout: { sessions: { create: mocks.checkoutCreate, list: mocks.checkoutList } },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  }),
}));

const ORIGINAL_ENV = {
  STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER:
    process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER,
  STRIPE_PRICE_ID_V9_PRO_BYOK_MONTHLY_CHARTER:
    process.env.STRIPE_PRICE_ID_V9_PRO_BYOK_MONTHLY_CHARTER,
  STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER:
    process.env.STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER,
};

describe('Author checkout route', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER =
      PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID;
    process.env.STRIPE_PRICE_ID_V9_PRO_BYOK_MONTHLY_CHARTER =
      PRO_BYOK_MONTHLY_CHARTER_PRICE_ID;
    process.env.STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER =
      TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID;
    mocks.session = { user: { id: 'user-1', email: 'author@example.com' } };
    mocks.profile = {
      plan: 'free',
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
      stripe_price_id: null,
    };
    mocks.byokStatus = { enabled: false };
    mocks.profileUpdates = [];
    mocks.customerCreate.mockResolvedValue({ id: 'cus_created_123' });
    mocks.subscriptionsList.mockResolvedValue({ data: [] });
    mocks.checkoutList.mockResolvedValue({ data: [] });
    mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_123' });
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_123' });
  });

  afterEach(() => {
    restoreEnv(
      'STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER',
      ORIGINAL_ENV.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER,
    );
    restoreEnv(
      'STRIPE_PRICE_ID_V9_PRO_BYOK_MONTHLY_CHARTER',
      ORIGINAL_ENV.STRIPE_PRICE_ID_V9_PRO_BYOK_MONTHLY_CHARTER,
    );
    restoreEnv(
      'STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER',
      ORIGINAL_ENV.STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER,
    );
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
        data: [stripeSubscription('sub_author_123', status, PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
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
        return_url: 'https://app.seizn.test/dashboard/author/settings?section=billing',
      });
      expect(mocks.profileUpdates).toContainEqual(expect.objectContaining({
        stripe_subscription_id: 'sub_author_123',
        stripe_subscription_status: status,
        stripe_price_id: PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID,
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
      data: [stripeSubscription('sub_live_123', 'active', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
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
        data: [stripeSubscription('sub_author_123', status, PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
      });

      const response = await POST(makeCheckoutRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.url).toBe('https://checkout.stripe.com/session_123');
      expectCheckoutCreateWith({
        customer: 'cus_author_123',
        line_items: [{ price: PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID, quantity: 1 }],
      });
      expect(mocks.portalCreate).not.toHaveBeenCalled();
    }
  );

  it('allows checkout when local active state is stale but Stripe only has canceled subscriptions', async () => {
    mocks.profile = {
      plan: 'pro',
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: 'sub_stale_123',
      stripe_subscription_status: 'active',
      subscription_status: 'active',
      stripe_price_id: PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID,
    };
    mocks.subscriptionsList.mockResolvedValue({
      data: [stripeSubscription('sub_canceled_123', 'canceled', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
    });

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expect(mocks.portalCreate).not.toHaveBeenCalled();
    expectCheckoutCreateWith({
      customer: 'cus_author_123',
    });
    expect(mocks.profileUpdates).toContainEqual(expect.objectContaining({
      plan: 'free',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: 'inactive',
      stripe_price_id: null,
    }));
  });

  it('paginates Stripe subscription history before allowing checkout', async () => {
    mocks.profile = {
      plan: 'free',
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
      stripe_price_id: null,
    };
    const canceledSubscriptions = Array.from({ length: 10 }, (_, index) =>
      stripeSubscription(`sub_canceled_${index}`, 'canceled', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)
    );
    mocks.subscriptionsList
      .mockResolvedValueOnce({ data: canceledSubscriptions, has_more: true })
      .mockResolvedValueOnce({
        data: [stripeSubscription('sub_trial_late', 'trialing', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
        has_more: false,
      });

    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.destination).toBe('billing_portal');
    expect(mocks.subscriptionsList).toHaveBeenNthCalledWith(2, {
      customer: 'cus_author_123',
      status: 'all',
      limit: 10,
      starting_after: 'sub_canceled_9',
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
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
        stripeSubscription('sub_canceled_123', 'canceled', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID),
        stripeSubscription('sub_trial_123', 'trialing', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID),
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
      data: [stripeSubscription('sub_paused_123', 'paused', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
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
    }), expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^author-customer-v9-[a-z0-9]+$/),
    }));
    expect(mocks.profileUpdates).toContainEqual({ stripe_customer_id: 'cus_created_123' });
    expectCheckoutCreateWith({
      customer: 'cus_created_123',
    });
  });

  it('creates checkout as a v9 subscription session without a Stripe trial', async () => {
    const response = await POST(makeCheckoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expectCheckoutCreateWith({
      mode: 'subscription',
      payment_method_types: ['card'],
      payment_method_collection: 'if_required',
      subscription_data: expect.objectContaining({
        metadata: expect.objectContaining({
          legal_terms_version: CHECKOUT_LEGAL_VERSIONS.terms,
          legal_privacy_version: CHECKOUT_LEGAL_VERSIONS.privacy,
          legal_accepted: 'true',
        }),
      }),
      metadata: expect.objectContaining({
        legal_terms_version: CHECKOUT_LEGAL_VERSIONS.terms,
        legal_privacy_version: CHECKOUT_LEGAL_VERSIONS.privacy,
        legal_accepted: 'true',
      }),
    });

    mocks.checkoutCreate.mockClear();
    mocks.checkoutList.mockResolvedValue({
      data: [{
        id: 'cs_open_123',
        url: 'https://checkout.stripe.com/open_123',
        metadata: {
          user_id: 'user-1',
          author_billing_tier: 'pro',
          billing_cadence: 'monthly',
          billing_column: 'managed',
          price_lock_version: 'v9',
          legal_terms_version: CHECKOUT_LEGAL_VERSIONS.terms,
          legal_privacy_version: CHECKOUT_LEGAL_VERSIONS.privacy,
          legal_accepted: 'true',
        },
      }],
    });

    const reuseResponse = await POST(makeCheckoutRequest({
      successUrl: 'https://app.seizn.test/dashboard/author/settings?section=billing&from=hero',
      cancelUrl: 'https://app.seizn.test/pricing?from=hero',
    }));
    const reuseBody = await reuseResponse.json();

    expect(reuseResponse.status).toBe(200);
    expect(reuseBody).toEqual({
      url: 'https://checkout.stripe.com/open_123',
      destination: 'checkout_session',
      reason: 'open_checkout_session',
    });
    expect(mocks.checkoutList).toHaveBeenCalledWith({
      customer: 'cus_author_123',
      status: 'open',
      limit: 10,
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('uses the explicitly selected BYOK price column for checkout', async () => {
    mocks.byokStatus = { enabled: false };

    const response = await POST(makeCheckoutRequest({ column: 'byok' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expectCheckoutCreateWith({
      line_items: [{ price: PRO_BYOK_MONTHLY_CHARTER_PRICE_ID, quantity: 1 }],
      subscription_data: expect.objectContaining({
        metadata: expect.objectContaining({
          billing_column: 'byok',
        }),
      }),
      metadata: expect.objectContaining({
        billing_column: 'byok',
      }),
    });
  });

  it('keeps the explicitly selected Managed column even when BYOK is active', async () => {
    mocks.byokStatus = { enabled: true };

    const response = await POST(makeCheckoutRequest({ column: 'managed' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expectCheckoutCreateWith({
      line_items: [{ price: PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID, quantity: 1 }],
      metadata: expect.objectContaining({
        billing_column: 'managed',
      }),
    });
  });

  it('rejects an invalid explicit billing column instead of falling back to another price', async () => {
    const response = await POST(makeCheckoutRequest({ column: 'discounted-byok' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid author billing tier' });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('creates a Track 2 checkout session with v9 metadata', async () => {
    const response = await POST(makeCheckoutRequest({
      channel: 'track2',
      tier: 'pro',
      cadence: 'monthly',
      successUrl: 'https://app.seizn.test/dashboard/account/api-keys?checkout=success',
      cancelUrl: 'https://app.seizn.test/pricing#track-2',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_author_123',
        line_items: [{ price: TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: 'https://app.seizn.test/dashboard/account/api-keys?checkout=success',
        cancel_url: 'https://app.seizn.test/pricing#track-2',
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({
            user_id: 'user-1',
            billing_channel: 'track2',
            track2_tier: 'pro',
            billing_cadence: 'monthly',
            price_lock_version: 'v9',
            legal_accepted: 'true',
          }),
        }),
        metadata: expect.objectContaining({
          billing_channel: 'track2',
          track2_tier: 'pro',
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^track2-checkout-v9-[a-z0-9]+$/),
      })
    );
  });

  it('does not treat an active Track 1 subscription as a duplicate Track 2 checkout', async () => {
    mocks.subscriptionsList.mockResolvedValue({
      data: [stripeSubscription('sub_author_123', 'active', PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID)],
      has_more: false,
    });

    const response = await POST(makeCheckoutRequest({
      channel: 'track2',
      tier: 'pro',
      cadence: 'monthly',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_123');
    expect(mocks.portalCreate).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).toHaveBeenCalled();
  });

  it('redirects an active Track 2 subscriber to the billing portal', async () => {
    mocks.subscriptionsList.mockResolvedValue({
      data: [stripeSubscription('sub_track2_123', 'active', TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID)],
      has_more: false,
    });

    const response = await POST(makeCheckoutRequest({
      channel: 'track2',
      tier: 'pro',
      cadence: 'monthly',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      url: 'https://billing.stripe.com/session_123',
      destination: 'billing_portal',
      reason: 'active_subscription',
    });
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: 'cus_author_123',
      return_url: 'https://app.seizn.test/dashboard/account/api-keys',
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('requires current legal agreement metadata before creating checkout', async () => {
    const response = await POST(makeCheckoutRequest({ legalAccepted: false }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Legal agreement is required before checkout' });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });
});

function makeCheckoutRequest(overrides: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('https://app.seizn.test/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tier: 'pro',
      cadence: 'monthly',
      legalAccepted: true,
      legalVersions: CHECKOUT_LEGAL_VERSIONS,
      ...overrides,
    }),
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

function expectCheckoutCreateWith(params: Record<string, unknown>): void {
  expect(mocks.checkoutCreate).toHaveBeenCalledWith(
    expect.objectContaining(params),
    expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^author-checkout-v9-[a-z0-9]+$/),
    })
  );
}
