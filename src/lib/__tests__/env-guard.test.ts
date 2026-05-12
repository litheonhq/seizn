import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/env/route';
import { checkProductionEnv, REQUIRED_PRODUCTION_ENV_VARS } from '@/lib/env-guard';

const ORIGINAL_ENV = { ...process.env };
const REQUIRED_ENV_NAMES = [
  ...REQUIRED_PRODUCTION_ENV_VARS.map((variable) => variable.name),
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_SECRET_KEY_SEIZN',
];

function setNodeEnv(value: string) {
  process.env.NODE_ENV = value;
}

function setRequiredProductionEnv() {
  process.env.STRIPE_SECRET_KEY = 'sk_live_test';
  process.env.STRIPE_METERED_PRICE_ID_MEMORIES = 'price_memories';
  process.env.STRIPE_METERED_PRICE_ID_OPS = 'price_ops';
  process.env.STRIPE_METER_ID_MEMORIES = 'meter_memories';
  process.env.STRIPE_METER_ID_OPS = 'meter_ops';
  process.env.SEIZN_DESIGN_PARTNER_COUPON = 'SEIZN_DP_2026';
  process.env.CRON_SECRET = 'cron-secret';
}

beforeEach(() => {
  for (const name of REQUIRED_ENV_NAMES) {
    delete process.env[name];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('production env guard', () => {
  it('returns ok=true when all required production variables are set', () => {
    setRequiredProductionEnv();

    const result = checkProductionEnv();

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toHaveLength(REQUIRED_PRODUCTION_ENV_VARS.length);
  });

  it('reports missing metered memories price id', () => {
    setRequiredProductionEnv();
    delete process.env.STRIPE_METERED_PRICE_ID_MEMORIES;

    const result = checkProductionEnv();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('STRIPE_METERED_PRICE_ID_MEMORIES');
  });

  it('accepts a Stripe restricted key as the billing runtime key', () => {
    setRequiredProductionEnv();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY_SEIZN;
    process.env.STRIPE_RESTRICTED_KEY = 'rk_live_test';

    const result = checkProductionEnv();

    expect(result.ok).toBe(true);
    expect(result.missing).not.toContain('STRIPE_SECRET_KEY');
  });

  it('skips health route checks outside production', async () => {
    setNodeEnv('test');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, mode: 'non-production' });
  });

  it('returns 200 from the health route when production env is complete', async () => {
    setNodeEnv('production');
    setRequiredProductionEnv();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      missing: [],
      presentCount: REQUIRED_PRODUCTION_ENV_VARS.length,
      requiredCount: REQUIRED_PRODUCTION_ENV_VARS.length,
    });
  });

  it('returns 503 from the health route when production env is missing required values', async () => {
    setNodeEnv('production');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.missing).toContainEqual({
      name: 'STRIPE_METERED_PRICE_ID_MEMORIES',
      description: 'Metered price for memories overage; missing value silently disables overage billing',
    });
    expect(body.presentCount).toBe(0);
    expect(body.requiredCount).toBe(REQUIRED_PRODUCTION_ENV_VARS.length);
  });
});
