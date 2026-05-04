import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAuthorByokDiscount, removeAuthorByokDiscount } from '@/lib/stripe/byok-discount';

const mocks = vi.hoisted(() => ({
  profile: {
    stripe_customer_id: 'cus_author_123',
    stripe_subscription_id: 'sub_author_123',
    byok_discount_active: false,
    byok_discount_coupon: null,
  } as {
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    byok_discount_active?: boolean | null;
    byok_discount_coupon?: string | null;
  },
  updates: [] as Record<string, unknown>[],
  customersUpdate: vi.fn(),
  subscriptionsUpdate: vi.fn(),
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
        mocks.updates.push(values);
        return {
          eq: () => ({ eq: () => ({}) }),
        };
      },
    }),
  }),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    customers: { update: mocks.customersUpdate },
    subscriptions: { update: mocks.subscriptionsUpdate },
  }),
}));

const ORIGINAL_ENV = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_BYOK_COUPON_ID: process.env.STRIPE_BYOK_COUPON_ID,
};

describe('BYOK Stripe discount sync', () => {
  afterEach(() => {
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: 'sub_author_123',
      byok_discount_active: false,
      byok_discount_coupon: null,
    };
    mocks.updates = [];
    mocks.customersUpdate.mockReset();
    mocks.subscriptionsUpdate.mockReset();
    restoreEnv('STRIPE_SECRET_KEY', ORIGINAL_ENV.STRIPE_SECRET_KEY);
    restoreEnv('STRIPE_BYOK_COUPON_ID', ORIGINAL_ENV.STRIPE_BYOK_COUPON_ID);
  });

  it('applies the BYOK coupon to an active subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_byok';

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: true,
      coupon: 'SEIZN_BYOK_50',
      status: 'applied',
    });
    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_author_123', {
      discounts: [{ coupon: 'SEIZN_BYOK_50' }],
    });
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: true,
      byok_discount_coupon: 'SEIZN_BYOK_50',
      byok_discount_status: 'applied',
      byok_discount_error: null,
    });
  });

  it('removes the BYOK coupon from an active subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_byok';

    await expect(removeAuthorByokDiscount('user-1')).resolves.toMatchObject({
      removed: true,
      coupon: 'SEIZN_BYOK_50',
      status: 'inactive',
    });
    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_author_123', {
      discounts: [],
    });
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: false,
      byok_discount_coupon: null,
      byok_discount_status: 'inactive',
      byok_discount_error: null,
    });
  });

  it('marks pending on the Stripe customer when no subscription exists', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_byok';
    process.env.STRIPE_BYOK_COUPON_ID = 'CUSTOM_BYOK_50';
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
      byok_discount_active: false,
      byok_discount_coupon: null,
    };

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: false,
      coupon: 'CUSTOM_BYOK_50',
      status: 'pending',
      reason: 'pending_subscription',
    });
    expect(mocks.customersUpdate).toHaveBeenCalledWith('cus_author_123', {
      metadata: {
        seizn_byok_discount: 'pending',
        seizn_byok_coupon: 'CUSTOM_BYOK_50',
      },
    });
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: false,
      byok_discount_coupon: 'CUSTOM_BYOK_50',
      byok_discount_status: 'pending',
      byok_discount_error: null,
    });
  });

  it('marks a pending BYOK discount when the user has no Stripe customer yet', async () => {
    mocks.profile = {
      stripe_customer_id: null,
      stripe_subscription_id: null,
      byok_discount_active: false,
      byok_discount_coupon: null,
    };

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: false,
      status: 'pending',
      reason: 'missing_billing_customer',
    });
    expect(mocks.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: false,
      byok_discount_coupon: 'SEIZN_BYOK_50',
      byok_discount_status: 'pending',
      byok_discount_error: null,
    });
  });

  it('marks an error when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: false,
      status: 'error',
      reason: 'stripe_not_configured',
    });
    expect(mocks.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: false,
      byok_discount_coupon: 'SEIZN_BYOK_50',
      byok_discount_status: 'error',
      byok_discount_error: 'stripe_not_configured',
    });
  });

  it('marks an error when the Stripe coupon API fails', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_byok';
    mocks.subscriptionsUpdate.mockRejectedValueOnce(new Error('coupon missing'));

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: false,
      status: 'error',
      reason: 'stripe_sync_failed',
      error: 'coupon missing',
    });
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: false,
      byok_discount_coupon: 'SEIZN_BYOK_50',
      byok_discount_status: 'error',
      byok_discount_error: 'coupon missing',
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
