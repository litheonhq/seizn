import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { GET, POST } from '@/app/api/account/subscription/route';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/csrf';

const PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID = 'price_pro_managed_monthly_charter_v9';
const TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID = 'price_track2_pro_monthly_charter_v9';

const mocks = vi.hoisted(() => ({
  profile: {
    id: 'profile-user-1',
    email: 'author@example.com',
    plan: 'pro',
    stripe_customer_id: 'cus_author_123',
    stripe_subscription_id: 'sub_author_123',
    stripe_subscription_status: 'active',
    subscription_status: 'active',
    stripe_price_id: 'price_pro_managed_monthly_charter_v9',
    stripe_current_period_start: null,
    stripe_current_period_end: '2026-06-03T00:00:00.000Z',
    subscription_renews_at: '2026-06-03T00:00:00.000Z',
    subscription_ends_at: '2026-06-03T00:00:00.000Z',
    subscription_trial_ends_at: null,
    subscription_cancelled: false,
    subscription_payment_failed: false,
    subscription_payment_failed_at: null,
    price_lock_version: 'v9',
  } as Record<string, unknown> | null,
  filters: [] as Array<[string, string]>,
  portalCreate: vi.fn(async () => ({ url: 'https://billing.stripe.com/session_123' })),
  subscriptionsList: vi.fn(async () => ({ data: [], has_more: false })),
  subscriptionUpdate: vi.fn(async () => ({
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: 1_779_926_400,
  })),
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          mocks.filters.push([column, value]);
          return {
            single: async () => ({ data: mocks.profile, error: mocks.profile ? null : { message: 'missing' } }),
          };
        },
      }),
      update: () => ({
        eq: (column: string, value: string) => {
          mocks.filters.push([column, value]);
          return {};
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/author/llm', () => ({
  getAuthorByokStatus: async () => ({ enabled: true, provider: 'anthropic', status: 'active' }),
  getAuthorModelUsageSummary: async () => ({
    tokens_in: 100,
    tokens_out: 50,
    total_tokens: 150,
    request_count: 2,
    byok_active: true,
  }),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    billingPortal: {
      sessions: {
        create: mocks.portalCreate,
      },
    },
    subscriptions: {
      list: mocks.subscriptionsList,
      update: mocks.subscriptionUpdate,
    },
  }),
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  AUTHOR_UI_ENABLED: process.env.AUTHOR_UI_ENABLED,
  AUTHOR_UI_ALLOWED_USER_IDS: process.env.AUTHOR_UI_ALLOWED_USER_IDS,
  AUTHOR_UI_ALLOWED_EMAILS: process.env.AUTHOR_UI_ALLOWED_EMAILS,
  STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER:
    process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER,
  STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER:
    process.env.STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER,
};

describe('account subscription route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = [];
    process.env.NODE_ENV = 'test';
    delete process.env.AUTHOR_UI_ENABLED;
    delete process.env.AUTHOR_UI_ALLOWED_USER_IDS;
    delete process.env.AUTHOR_UI_ALLOWED_EMAILS;
    process.env.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER =
      PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID;
    process.env.STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER =
      TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID;
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'profile-user-1',
      email: 'author@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });
  });

  afterEach(() => {
    restoreEnv('NODE_ENV', ORIGINAL_ENV.NODE_ENV);
    restoreEnv('AUTHOR_UI_ENABLED', ORIGINAL_ENV.AUTHOR_UI_ENABLED);
    restoreEnv('AUTHOR_UI_ALLOWED_USER_IDS', ORIGINAL_ENV.AUTHOR_UI_ALLOWED_USER_IDS);
    restoreEnv('AUTHOR_UI_ALLOWED_EMAILS', ORIGINAL_ENV.AUTHOR_UI_ALLOWED_EMAILS);
    restoreEnv(
      'STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER',
      ORIGINAL_ENV.STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER,
    );
    restoreEnv(
      'STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER',
      ORIGINAL_ENV.STRIPE_PRICE_ID_V9_TRACK2_PRO_MONTHLY_CHARTER,
    );
  });

  it('returns 401 when the Author UI request user is missing', async () => {
    vi.mocked(getRequestUser).mockResolvedValue(null);

    const response = await GET(new NextRequest('https://example.com/api/account/subscription'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when Author UI is disabled', async () => {
    process.env.AUTHOR_UI_ENABLED = 'false';

    const response = await GET(new NextRequest('https://example.com/api/account/subscription'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Author UI is not enabled for this account' });
  });

  it('returns 403 for production users outside the allowlist', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTHOR_UI_ENABLED = 'true';
    process.env.AUTHOR_UI_ALLOWED_USER_IDS = 'other-user';
    process.env.AUTHOR_UI_ALLOWED_EMAILS = 'other@example.com';

    const response = await GET(new NextRequest('https://example.com/api/account/subscription'));

    expect(response.status).toBe(403);
  });

  it('uses the normalized Author UI user id and returns subscription state', async () => {
    const response = await GET(new NextRequest('https://example.com/api/account/subscription'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.filters).toContainEqual(['id', 'profile-user-1']);
    expect(body).toMatchObject({
      plan: 'pro',
      stripe_price_id: PRO_MANAGED_MONTHLY_CHARTER_PRICE_ID,
      billing_cadence: 'monthly',
    });
  });

  it('recovers a paid Track 2 subscription from Stripe when local profile state is stale', async () => {
    mocks.profile = {
      ...(mocks.profile ?? {}),
      plan: 'free',
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: null,
      stripe_price_id: null,
      track2_tier: 'free',
      track2_subscription_id: null,
      track2_subscription_status: null,
      track2_price_id: null,
    };
    mocks.subscriptionsList.mockResolvedValue({
      data: [track2Subscription('sub_track2_123', 'active', TRACK2_PRO_MONTHLY_CHARTER_PRICE_ID)],
      has_more: false,
    });

    const response = await GET(new NextRequest('https://example.com/api/account/subscription'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan).toBe('free');
    expect(body.track2).toMatchObject({
      tier: 'pro',
      tier_label: 'Pro',
      status: 'active',
      price_label: '$23/mo',
      billing_cadence: 'monthly',
      quota: {
        calls: 10000,
        period: 'month',
        rate_limit_per_minute: 60,
      },
    });
  });

  it('applies Author UI CSRF checks to subscription mutations', async () => {
    const response = await POST(new NextRequest('https://example.com/api/account/subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'CSRF validation failed: token mismatch',
    });
  });

  it('sends portal requests without a Stripe customer to pricing', async () => {
    mocks.profile = {
      ...(mocks.profile ?? {}),
      stripe_customer_id: null,
      stripe_subscription_id: null,
    };

    const response = await POST(subscriptionMutationRequest({ action: 'portal' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      url: '/pricing',
      destination: 'pricing',
      reason: 'no_billing_account',
    });
    expect(mocks.portalCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });
});

function subscriptionMutationRequest(body: Record<string, unknown>): NextRequest {
  const token = 'csrf-token';
  return new NextRequest('https://example.com/api/account/subscription', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      [CSRF_HEADER_NAME]: token,
    },
    body: JSON.stringify(body),
  });
}

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function track2Subscription(id: string, status: string, priceId: string) {
  return {
    id,
    status,
    cancel_at_period_end: false,
    start_date: 1_778_100_000,
    items: {
      data: [
        {
          price: { id: priceId },
          current_period_start: 1_778_100_000,
          current_period_end: 1_780_692_000,
        },
      ],
    },
  };
}
