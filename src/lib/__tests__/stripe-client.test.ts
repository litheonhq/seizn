import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = {
  STRIPE_RESTRICTED_KEY: process.env.STRIPE_RESTRICTED_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_SECRET_KEY_SEIZN: process.env.STRIPE_SECRET_KEY_SEIZN,
};

describe('getStripeClient', () => {
  afterEach(() => {
    restoreEnv('STRIPE_RESTRICTED_KEY', ORIGINAL_ENV.STRIPE_RESTRICTED_KEY);
    restoreEnv('STRIPE_SECRET_KEY', ORIGINAL_ENV.STRIPE_SECRET_KEY);
    restoreEnv('STRIPE_SECRET_KEY_SEIZN', ORIGINAL_ENV.STRIPE_SECRET_KEY_SEIZN);
    vi.resetModules();
  });

  it('prefers the restricted Stripe key when it is available', async () => {
    process.env.STRIPE_RESTRICTED_KEY = 'rk_test_runtime_restricted_key';
    process.env.STRIPE_SECRET_KEY = 'sk_test_expired_or_legacy_key';
    process.env.STRIPE_SECRET_KEY_SEIZN = 'sk_test_seizn_fallback';
    vi.resetModules();

    const { getStripeSecretKey } = await import('@/lib/stripe');

    expect(getStripeSecretKey()).toBe('rk_test_runtime_restricted_key');
  });

  it('accepts the Seizn-specific Stripe secret fallback used by env guard', async () => {
    delete process.env.STRIPE_RESTRICTED_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY_SEIZN = 'sk_test_seizn_fallback';
    vi.resetModules();

    const { getStripeClient } = await import('@/lib/stripe');

    expect(() => getStripeClient()).not.toThrow();
  });
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
