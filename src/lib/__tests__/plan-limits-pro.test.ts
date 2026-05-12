import { describe, expect, it } from 'vitest';
import { hasFeature, PLANS } from '@/lib/plan-limits';
import { PLAN_YEARLY_USD_CENTS } from '@/lib/stripe-config';

describe('Pro plan feature differentiators', () => {
  it('includes SSO on Pro and keeps Studio without SSO', () => {
    expect(hasFeature('pro', 'sso')).toBe(true);
    expect(hasFeature('studio', 'sso')).toBe(false);
  });

  it('grants two quarterly post-mortem credits on Pro', () => {
    expect(PLANS.pro.features.postMortemCredits).toBe(2);
  });

  it('enables Chaos Monkey priority queue for Pro', () => {
    expect(PLANS.pro.features.chaosMonkeyPriorityQueue).toBe(true);
  });

  it('raises Studio memory and monthly API call quotas to one million', () => {
    expect(PLANS.studio.memories).toBe(1_000_000);
    expect(PLANS.studio.apiCallsMonthly).toBe(1_000_000);
  });

  it('keeps Pro display pricing aligned with the v9 Stripe catalog', () => {
    expect(PLANS.pro.priceMonthly).toBe(149);
    expect(PLANS.pro.priceYearly).toBe(1_788);
    expect(PLAN_YEARLY_USD_CENTS.pro).toBe(178_800);
  });
});
