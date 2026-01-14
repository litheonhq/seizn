import { NextResponse } from 'next/server';
import { PLANS as PLAN_CONFIG, formatLimit, isUnlimited } from '@/lib/plan-limits';

/**
 * GET /api/plans - Single Source of Truth for pricing
 *
 * This endpoint serves the canonical pricing data.
 * All pricing displays (website, dashboard, docs) should reference this.
 */
export async function GET() {
  const plans = Object.entries(PLAN_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    price: key === 'enterprise' ? null : config.priceMonthly,
    priceYearly: key === 'enterprise' ? null : config.priceYearly,
    currency: 'USD',
    interval: key === 'free' ? null : 'month',
    popular: key === 'pro',
    limits: {
      memories: config.memories,
      memoriesDisplay: formatLimit(config.memories),
      apiCallsDaily: config.apiCallsDaily,
      apiCallsDailyDisplay: formatLimit(config.apiCallsDaily),
      apiKeys: config.apiKeys,
      rateLimit: config.rateLimit,
      maxInputTokens: config.maxInputTokens,
      maxOutputTokens: config.maxOutputTokens,
    },
    features: {
      ...config.features,
      support: key === 'free' ? 'community' :
               key === 'starter' ? 'email' :
               key === 'plus' ? 'email' :
               key === 'pro' ? 'priority' : 'dedicated',
    },
    description: getDescription(key),
  }));

  return NextResponse.json({
    plans: plans.reduce((acc, plan) => ({ ...acc, [plan.id]: plan }), {}),
    planList: plans.filter(p => ['free', 'plus', 'pro', 'enterprise'].includes(p.id)),
    note: 'Features with -1 value represent unlimited usage. Use limitsDisplay for formatted values.',
  });
}

function getDescription(planKey: string): string {
  const descriptions: Record<string, string> = {
    free: 'Perfect for getting started and small projects',
    starter: 'For growing projects with more usage',
    plus: 'For teams building production applications',
    pro: 'For professional developers and teams',
    enterprise: 'Custom solutions for large organizations',
  };
  return descriptions[planKey] || '';
}
