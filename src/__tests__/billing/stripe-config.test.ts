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
  type BillingColumn,
  type CharterStatus,
} from '@/lib/stripe-config';

const ENV = {
  STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY_CHARTER: 'price_indie_managed_monthly_charter_v9',
  STRIPE_PRICE_ID_V9_INDIE_MANAGED_ANNUAL_CHARTER: 'price_indie_managed_annual_charter_v9',
  STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER: 'price_pro_managed_monthly_charter_v9',
  STRIPE_PRICE_ID_V9_PRO_MANAGED_ANNUAL_CHARTER: 'price_pro_managed_annual_charter_v9',
  STRIPE_PRICE_ID_V9_STUDIO_MANAGED_MONTHLY_CHARTER: 'price_studio_managed_monthly_charter_v9',
  STRIPE_PRICE_ID_V9_STUDIO_MANAGED_ANNUAL_CHARTER: 'price_studio_managed_annual_charter_v9',
  STRIPE_PRICE_ID_V9_ENTERPRISE_MANAGED_MONTHLY_CHARTER: 'price_enterprise_managed_monthly_charter_v9',
  STRIPE_PRICE_ID_V9_ENTERPRISE_MANAGED_ANNUAL_CHARTER: 'price_enterprise_managed_annual_charter_v9',
} as NodeJS.ProcessEnv;

const CASES: Array<[AuthorBillingTier, BillingColumn, BillingCadence, CharterStatus, string]> = [
  ['indie', 'managed', 'monthly', 'charter', 'price_indie_managed_monthly_charter_v9'],
  ['indie', 'managed', 'yearly', 'charter', 'price_indie_managed_annual_charter_v9'],
  ['pro', 'managed', 'monthly', 'charter', 'price_pro_managed_monthly_charter_v9'],
  ['pro', 'managed', 'yearly', 'charter', 'price_pro_managed_annual_charter_v9'],
  ['studio', 'managed', 'monthly', 'charter', 'price_studio_managed_monthly_charter_v9'],
  ['studio', 'managed', 'yearly', 'charter', 'price_studio_managed_annual_charter_v9'],
  ['enterprise', 'managed', 'monthly', 'charter', 'price_enterprise_managed_monthly_charter_v9'],
  ['enterprise', 'managed', 'yearly', 'charter', 'price_enterprise_managed_annual_charter_v9'],
];

describe('Stripe v9 author billing config', () => {
  it.each(CASES)('resolves %s %s %s %s to the configured Stripe price', (tier, column, cadence, charter, priceId) => {
    expect(getAuthorStripePriceId(tier, column, cadence, charter, ENV)).toBe(priceId);
    expect(getAuthorTierFromStripePriceId(priceId, ENV)).toBe(tier);
    expect(getBillingCadenceFromStripePriceId(priceId, ENV)).toBe(cadence);
    expect(getPlanFromStripePriceId(priceId, ENV)).toBe(tier);
    expect(isValidStripePriceId(priceId, ENV)).toBe(true);
  });

  it.each(CASES)('does not invent a Stripe price when %s %s %s %s env is missing', (tier, column, cadence, charter) => {
    expect(getAuthorStripePriceId(tier, column, cadence, charter, {})).toBeNull();
  });

  it('does not accept legacy hard-coded Stripe prices', () => {
    expect(isValidStripePriceId('price_1TJdcl8XSoMws9Uf0hNjQdar', ENV)).toBe(false);
    expect(getPlanFromStripePriceId('price_1TJdcm8XSoMws9UfAYJ7xu7G', ENV)).toBeNull();
  });

  it('keeps the v9 public managed tier amounts and caps locked', () => {
    expect(AUTHOR_BILLING_TIERS.indie.managedMonthlyUsd).toBe(39);
    expect(AUTHOR_BILLING_TIERS.pro.managedMonthlyUsd).toBe(149);
    expect(AUTHOR_BILLING_TIERS.studio.managedMonthlyUsd).toBe(499);
    expect(AUTHOR_BILLING_TIERS.enterprise.managedMonthlyUsd).toBe(2500);
    expect(getAuthorTokenCap('indie')).toBe(1_000_000);
    expect(getAuthorTokenCap('pro')).toBe(5_000_000);
    expect(getAuthorTokenCap('studio')).toBe(20_000_000);
    expect(getAuthorTokenCap('enterprise')).toBeNull();
  });

  it('returns both cadence price IDs for a plan', () => {
    expect(getStripePriceIdsForPlan('studio', ENV)).toEqual([
      'price_studio_managed_monthly_charter_v9',
      'price_studio_managed_annual_charter_v9',
    ]);
  });
});
