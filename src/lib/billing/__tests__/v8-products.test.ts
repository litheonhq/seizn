import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  V8_GRANDFATHER_DAYS,
  V8_PRICE_LOCK_VERSION,
  V8_TRACK2_PRODUCTS,
  V8_TRACK2_QUOTA,
  applyV8Track2TierToApiKeys,
  getV8Track2BillingCadenceFromPriceId,
  getV8Track2Config,
  getV8Track2Quota,
  getV8Track2StripePriceId,
  getV8Track2TierFromStripePriceId,
  isV8Track2Tier,
  isV8Track2Upgrade,
  v8Track2GrandfatherCutoffIso,
} from '../v8-products';

const fixtureEnv: NodeJS.ProcessEnv = {
  STRIPE_PRICE_ID_V8_INDIE_MONTHLY: 'price_indie_m',
  STRIPE_PRICE_ID_V8_INDIE_YEARLY: 'price_indie_y',
  STRIPE_PRICE_ID_V8_PRO_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_ID_V8_STUDIO_MONTHLY: 'price_studio_m',
  STRIPE_PRICE_ID_V8_STUDIO_MANAGED_MONTHLY: 'price_smgmt_m',
};

describe('v8 Track 2 product catalog', () => {
  it('locks the price version + grandfather window per spec', () => {
    expect(V8_PRICE_LOCK_VERSION).toBe('v8');
    expect(V8_GRANDFATHER_DAYS).toBe(90);
  });

  it('exposes 6 tiers with monotonically non-decreasing monthly USD (paid tiers)', () => {
    const ordered = ['free', 'indie', 'pro', 'studio', 'studio_managed'] as const;
    const monthlies = ordered.map((tier) => V8_TRACK2_PRODUCTS[tier].monthlyUsd ?? 0);
    for (let i = 1; i < monthlies.length; i += 1) {
      expect(monthlies[i]).toBeGreaterThanOrEqual(monthlies[i - 1]);
    }
    expect(V8_TRACK2_PRODUCTS.enterprise.monthlyUsd).toBeNull();
  });

  it('matches Appendix B quota / rate / scope contract', () => {
    expect(V8_TRACK2_QUOTA.free).toEqual({
      monthlyQuota: 100,
      monthlyQuotaPeriod: 'day',
      rateLimitPerMinute: 30,
      scopes: ['recall', 'remember', 'graph', 'search'],
    });
    expect(V8_TRACK2_QUOTA.studio_managed.scopes).toContain('managed_llm');
    expect(V8_TRACK2_QUOTA.studio_managed.scopes).toContain('audit:read');
    expect(V8_TRACK2_QUOTA.studio.rateLimitPerMinute).toBe(600);
    expect(V8_TRACK2_QUOTA.enterprise.scopes).toEqual(['*']);
  });

  it('isV8Track2Tier guards string narrowing', () => {
    expect(isV8Track2Tier('indie')).toBe(true);
    expect(isV8Track2Tier('plus')).toBe(false);
    expect(isV8Track2Tier(null)).toBe(false);
  });

  it('config + quota lookups return strict references', () => {
    expect(getV8Track2Config('pro').label).toBe('Pro');
    expect(getV8Track2Quota('pro').monthlyQuota).toBe(10_000);
  });

  it('resolves price IDs from env + ignores price_TODO sentinel', () => {
    expect(getV8Track2StripePriceId('indie', 'monthly', fixtureEnv)).toBe('price_indie_m');
    expect(getV8Track2StripePriceId('indie', 'yearly', fixtureEnv)).toBe('price_indie_y');
    expect(getV8Track2StripePriceId('free', 'monthly', fixtureEnv)).toBeNull();
    expect(
      getV8Track2StripePriceId('indie', 'monthly', {
        ...fixtureEnv,
        STRIPE_PRICE_ID_V8_INDIE_MONTHLY: 'price_TODO',
      }),
    ).toBeNull();
  });

  it('resolves tier + cadence from a Stripe price ID', () => {
    expect(getV8Track2TierFromStripePriceId('price_studio_m', fixtureEnv)).toBe('studio');
    expect(getV8Track2BillingCadenceFromPriceId('price_indie_y', fixtureEnv)).toBe('yearly');
    expect(getV8Track2TierFromStripePriceId('price_unknown', fixtureEnv)).toBeNull();
  });

  it('isV8Track2Upgrade compares tier order', () => {
    expect(isV8Track2Upgrade('indie', 'pro')).toBe(true);
    expect(isV8Track2Upgrade('studio', 'pro')).toBe(false);
    expect(isV8Track2Upgrade('studio', 'studio')).toBe(false);
  });

  it('grandfather cutoff = +90 days from a UTC ISO start', () => {
    const cutoff = v8Track2GrandfatherCutoffIso('2026-05-06T00:00:00.000Z');
    expect(cutoff).toBe('2026-08-04T00:00:00.000Z');
  });

  it('throws on invalid grandfather start date', () => {
    expect(() => v8Track2GrandfatherCutoffIso('not-a-date')).toThrow(/Invalid ISO date/);
  });
});

describe('applyV8Track2TierToApiKeys', () => {
  type UpdateCall = {
    table: string;
    values: Record<string, unknown>;
    eqArgs: [string, string];
  };

  let calls: UpdateCall[];
  let nextError: { message: string } | null;

  function makeSupabase() {
    return {
      from(table: string) {
        return {
          update(values: Record<string, unknown>) {
            return {
              async eq(column: string, value: string) {
                calls.push({ table, values, eqArgs: [column, value] });
                return { error: nextError };
              },
            };
          },
        };
      },
    };
  }

  beforeEach(() => {
    calls = [];
    nextError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes quota/rate/scope columns for the user across api_keys', async () => {
    const result = await applyV8Track2TierToApiKeys('user-1', 'studio', makeSupabase());
    expect(result).toEqual({ ok: true, updated: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('api_keys');
    expect(calls[0].eqArgs).toEqual(['user_id', 'user-1']);
    expect(calls[0].values).toMatchObject({
      monthly_quota: 100_000,
      monthly_quota_period: 'month',
      rate_limit_per_minute: 600,
    });
    expect(calls[0].values.scopes).toEqual(V8_TRACK2_QUOTA.studio.scopes);
  });

  it('forwards supabase errors as { ok: false }', async () => {
    nextError = { message: 'permission denied' };
    const result = await applyV8Track2TierToApiKeys('user-2', 'free', makeSupabase());
    expect(result).toEqual({ ok: false, error: 'permission denied' });
  });
});
