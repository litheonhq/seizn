import { NextResponse } from 'next/server';
import { PLAN_LIMITS } from '@/lib/usage';
import { RATE_LIMITS } from '@/lib/rate-limit';

// Plan pricing and features
const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: null, // Forever free
    features: {
      memories: PLAN_LIMITS.free.memories,
      apiCallsDaily: PLAN_LIMITS.free.apiCallsDaily,
      apiKeys: PLAN_LIMITS.free.apiKeys,
      rateLimit: RATE_LIMITS.free,
      support: 'community',
      analytics: false,
      webhooks: false,
    },
    description: 'Perfect for getting started and small projects',
  },
  plus: {
    name: 'Plus',
    price: 9,
    currency: 'USD',
    interval: 'month',
    features: {
      memories: PLAN_LIMITS.plus.memories,
      apiCallsDaily: PLAN_LIMITS.plus.apiCallsDaily,
      apiKeys: PLAN_LIMITS.plus.apiKeys,
      rateLimit: RATE_LIMITS.plus,
      support: 'email',
      analytics: true,
      webhooks: false,
    },
    description: 'For growing projects with more usage',
  },
  pro: {
    name: 'Pro',
    price: 29,
    currency: 'USD',
    interval: 'month',
    popular: true,
    features: {
      memories: PLAN_LIMITS.pro.memories,
      apiCallsDaily: PLAN_LIMITS.pro.apiCallsDaily,
      apiKeys: PLAN_LIMITS.pro.apiKeys,
      rateLimit: RATE_LIMITS.pro,
      support: 'priority',
      analytics: true,
      webhooks: true,
    },
    description: 'For professional developers and teams',
  },
  enterprise: {
    name: 'Enterprise',
    price: null, // Custom pricing
    currency: 'USD',
    interval: 'month',
    features: {
      memories: -1, // Unlimited
      apiCallsDaily: -1, // Unlimited
      apiKeys: PLAN_LIMITS.enterprise.apiKeys,
      rateLimit: RATE_LIMITS.enterprise,
      support: 'dedicated',
      analytics: true,
      webhooks: true,
      sso: true,
      customSla: true,
      onPremise: true,
    },
    description: 'Custom solutions for large organizations',
  },
};

// GET /api/plans - List all plans with pricing
export async function GET() {
  return NextResponse.json({
    plans: PLANS,
    note: 'Features with -1 value represent unlimited usage',
  });
}
