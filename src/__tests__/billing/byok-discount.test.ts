import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAuthorByokDiscount, removeAuthorByokDiscount } from '@/lib/stripe/byok-discount';

const mocks = vi.hoisted(() => ({
  profile: {
    stripe_customer_id: 'cus_author_123',
    stripe_subscription_id: 'sub_author_123',
  } as { stripe_customer_id?: string | null; stripe_subscription_id?: string | null },
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
    });
    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_author_123', {
      discounts: [{ coupon: 'SEIZN_BYOK_50' }],
    });
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: true,
      byok_discount_coupon: 'SEIZN_BYOK_50',
    });
  });

  it('removes the BYOK coupon from an active subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_byok';

    await expect(removeAuthorByokDiscount('user-1')).resolves.toMatchObject({
      removed: true,
      coupon: 'SEIZN_BYOK_50',
    });
    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_author_123', {
      discounts: [],
    });
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: false,
      byok_discount_coupon: null,
    });
  });

  it('queues the discount on the Stripe customer when no subscription exists', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_byok';
    process.env.STRIPE_BYOK_COUPON_ID = 'CUSTOM_BYOK_50';
    mocks.profile = {
      stripe_customer_id: 'cus_author_123',
      stripe_subscription_id: null,
    };

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: true,
      coupon: 'CUSTOM_BYOK_50',
    });
    expect(mocks.customersUpdate).toHaveBeenCalledWith('cus_author_123', {
      metadata: {
        seizn_byok_discount: 'pending',
        seizn_byok_coupon: 'CUSTOM_BYOK_50',
      },
    });
  });

  it('marks a pending BYOK discount when the user has no Stripe customer yet', async () => {
    mocks.profile = {
      stripe_customer_id: null,
      stripe_subscription_id: null,
    };

    await expect(applyAuthorByokDiscount('user-1')).resolves.toMatchObject({
      applied: false,
      reason: 'missing_billing_customer',
    });
    expect(mocks.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.updates.at(-1)).toMatchObject({
      byok_discount_active: true,
      byok_discount_coupon: 'SEIZN_BYOK_50',
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
