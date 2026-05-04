import { describe, expect, it } from 'vitest';
import {
  AUTHOR_BILLING_TIERS,
  getAuthorStripePriceId,
  getAuthorTierFromStripePriceId,
  getAuthorTokenCap,
  getBillingCadenceFromStripePriceId,
  getPlanFromStripePriceId,
  getStripePriceIdsForPlan,
  isValidStripePriceId,
  type AuthorBillingTier,
  type BillingCadence,
} from '@/lib/stripe-config';

const ENV = {
  STRIPE_PRICE_ID_INDIE_MONTHLY: 'price_indie_monthly_v7',
  STRIPE_PRICE_ID_INDIE_YEARLY: 'price_indie_yearly_v7',
  STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly_v7',
  STRIPE_PRICE_ID_PRO_YEARLY: 'price_pro_yearly_v7',
  STRIPE_PRICE_ID_STUDIO_MONTHLY: 'price_studio_monthly_v7',
  STRIPE_PRICE_ID_STUDIO_YEARLY: 'price_studio_yearly_v7',
  STRIPE_PRICE_ID_ENTERPRISE_MONTHLY: 'price_enterprise_monthly_v7',
  STRIPE_PRICE_ID_ENTERPRISE_YEARLY: 'price_enterprise_yearly_v7',
} as NodeJS.ProcessEnv;

const CASES: Array<[AuthorBillingTier, BillingCadence, string]> = [
  ['indie', 'monthly', 'price_indie_monthly_v7'],
  ['indie', 'yearly', 'price_indie_yearly_v7'],
  ['pro', 'monthly', 'price_pro_monthly_v7'],
  ['pro', 'yearly', 'price_pro_yearly_v7'],
  ['studio', 'monthly', 'price_studio_monthly_v7'],
  ['studio', 'yearly', 'price_studio_yearly_v7'],
  ['enterprise', 'monthly', 'price_enterprise_monthly_v7'],
  ['enterprise', 'yearly', 'price_enterprise_yearly_v7'],
];

describe('Stripe v7 author billing config', () => {
  it.each(CASES)('resolves %s %s to the configured Stripe price', (tier, cadence, priceId) => {
    expect(getAuthorStripePriceId(tier, cadence, ENV)).toBe(priceId);
    expect(getAuthorTierFromStripePriceId(priceId, ENV)).toBe(tier);
    expect(getBillingCadenceFromStripePriceId(priceId, ENV)).toBe(cadence);
    expect(getPlanFromStripePriceId(priceId, ENV)).toBe(tier);
    expect(isValidStripePriceId(priceId, ENV)).toBe(true);
  });

  it.each(CASES)('does not invent a Stripe price when %s %s env is missing', (tier, cadence) => {
    expect(getAuthorStripePriceId(tier, cadence, {})).toBeNull();
  });

  it('does not accept legacy hard-coded Stripe prices', () => {
    expect(isValidStripePriceId('price_1TJdcl8XSoMws9Uf0hNjQdar', ENV)).toBe(false);
    expect(getPlanFromStripePriceId('price_1TJdcm8XSoMws9UfAYJ7xu7G', ENV)).toBeNull();
  });

  it('keeps the v7 public tier amounts and caps locked', () => {
    expect(AUTHOR_BILLING_TIERS.indie.monthlyUsd).toBe(39);
    expect(AUTHOR_BILLING_TIERS.pro.monthlyUsd).toBe(149);
    expect(AUTHOR_BILLING_TIERS.studio.monthlyUsd).toBe(499);
    expect(AUTHOR_BILLING_TIERS.enterprise.monthlyUsd).toBe(2500);
    expect(getAuthorTokenCap('indie')).toBe(1_000_000);
    expect(getAuthorTokenCap('pro')).toBe(5_000_000);
    expect(getAuthorTokenCap('studio')).toBe(20_000_000);
    expect(getAuthorTokenCap('enterprise')).toBeNull();
  });

  it('returns both cadence price IDs for a plan', () => {
    expect(getStripePriceIdsForPlan('studio', ENV)).toEqual([
      'price_studio_monthly_v7',
      'price_studio_yearly_v7',
    ]);
  });
});
