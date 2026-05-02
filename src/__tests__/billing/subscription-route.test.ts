import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { GET, POST } from '@/app/api/account/subscription/route';

const mocks = vi.hoisted(() => ({
  profile: {
    id: 'profile-user-1',
    email: 'author@example.com',
    plan: 'pro',
    stripe_customer_id: 'cus_author_123',
    stripe_subscription_id: 'sub_author_123',
    stripe_subscription_status: 'active',
    subscription_status: 'active',
    stripe_price_id: 'price_pro_monthly_v7',
    stripe_current_period_start: null,
    stripe_current_period_end: '2026-06-03T00:00:00.000Z',
    subscription_renews_at: '2026-06-03T00:00:00.000Z',
    subscription_ends_at: '2026-06-03T00:00:00.000Z',
    subscription_trial_ends_at: null,
    subscription_cancelled: false,
    subscription_payment_failed: false,
    subscription_payment_failed_at: null,
    byok_discount_active: false,
    byok_discount_status: 'pending',
    byok_discount_error: null,
    price_lock_version: 'v7',
  } as Record<string, unknown> | null,
  filters: [] as Array<[string, string]>,
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
        create: async () => ({ url: 'https://billing.stripe.com/session_123' }),
      },
    },
    subscriptions: {
      update: async () => ({
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: 1_779_926_400,
      }),
    },
  }),
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  AUTHOR_UI_ENABLED: process.env.AUTHOR_UI_ENABLED,
  AUTHOR_UI_ALLOWED_USER_IDS: process.env.AUTHOR_UI_ALLOWED_USER_IDS,
  AUTHOR_UI_ALLOWED_EMAILS: process.env.AUTHOR_UI_ALLOWED_EMAILS,
  STRIPE_PRICE_ID_PRO_MONTHLY: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
};

describe('account subscription route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = [];
    process.env.NODE_ENV = 'test';
    delete process.env.AUTHOR_UI_ENABLED;
    delete process.env.AUTHOR_UI_ALLOWED_USER_IDS;
    delete process.env.AUTHOR_UI_ALLOWED_EMAILS;
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly_v7';
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
    restoreEnv('STRIPE_PRICE_ID_PRO_MONTHLY', ORIGINAL_ENV.STRIPE_PRICE_ID_PRO_MONTHLY);
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

  it('uses the normalized Author UI user id and returns BYOK discount status', async () => {
    const response = await GET(new NextRequest('https://example.com/api/account/subscription'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.filters).toContainEqual(['id', 'profile-user-1']);
    expect(body).toMatchObject({
      plan: 'pro',
      byok_discount_active: false,
      byok_discount_status: 'pending',
      byok_discount_error: null,
      stripe_price_id: 'price_pro_monthly_v7',
      billing_cadence: 'monthly',
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
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
