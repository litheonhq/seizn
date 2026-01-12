/**
 * Seizn Plan Limits Configuration
 *
 * Centralized configuration for all plan limits and quotas.
 * Connected to billing (Lemon Squeezy) via profiles.plan field.
 */

// ============================================
// Plan Configuration
// ============================================

export interface PlanConfig {
  // Display name
  name: string;

  // Quotas
  memories: number;           // Max memories (-1 = unlimited)
  apiCallsDaily: number;      // Daily API calls (-1 = unlimited)
  apiKeys: number;            // Max API keys

  // Rate limits (requests per minute)
  rateLimit: number;

  // Features
  features: {
    hybridSearch: boolean;
    reranking: boolean;
    federatedSearch: boolean;
    ragQuery: boolean;
    bulkOperations: boolean;
    analytics: boolean;
    webhooks: boolean;
    sso: boolean;
    prioritySupport: boolean;
  };

  // Token limits (per request)
  maxInputTokens: number;
  maxOutputTokens: number;

  // Pricing (for reference)
  priceMonthly: number;       // USD
  priceYearly: number;        // USD (yearly)
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    name: 'Free',
    memories: 10_000,
    apiCallsDaily: 1_000,
    apiKeys: 2,
    rateLimit: 60,           // 1 req/sec
    features: {
      hybridSearch: true,
      reranking: false,
      federatedSearch: false,
      ragQuery: true,
      bulkOperations: false,
      analytics: false,
      webhooks: false,
      sso: false,
      prioritySupport: false,
    },
    maxInputTokens: 4_000,
    maxOutputTokens: 1_000,
    priceMonthly: 0,
    priceYearly: 0,
  },

  starter: {
    name: 'Starter',
    memories: 50_000,
    apiCallsDaily: 5_000,
    apiKeys: 3,
    rateLimit: 120,          // 2 req/sec
    features: {
      hybridSearch: true,
      reranking: true,
      federatedSearch: false,
      ragQuery: true,
      bulkOperations: true,
      analytics: false,
      webhooks: false,
      sso: false,
      prioritySupport: false,
    },
    maxInputTokens: 8_000,
    maxOutputTokens: 2_000,
    priceMonthly: 9,
    priceYearly: 90,
  },

  plus: {
    name: 'Plus',
    memories: 100_000,
    apiCallsDaily: 10_000,
    apiKeys: 5,
    rateLimit: 300,          // 5 req/sec
    features: {
      hybridSearch: true,
      reranking: true,
      federatedSearch: true,
      ragQuery: true,
      bulkOperations: true,
      analytics: true,
      webhooks: true,
      sso: false,
      prioritySupport: false,
    },
    maxInputTokens: 16_000,
    maxOutputTokens: 4_000,
    priceMonthly: 29,
    priceYearly: 290,
  },

  pro: {
    name: 'Pro',
    memories: 1_000_000,
    apiCallsDaily: 100_000,
    apiKeys: 10,
    rateLimit: 600,          // 10 req/sec
    features: {
      hybridSearch: true,
      reranking: true,
      federatedSearch: true,
      ragQuery: true,
      bulkOperations: true,
      analytics: true,
      webhooks: true,
      sso: false,
      prioritySupport: true,
    },
    maxInputTokens: 32_000,
    maxOutputTokens: 8_000,
    priceMonthly: 99,
    priceYearly: 990,
  },

  enterprise: {
    name: 'Enterprise',
    memories: -1,            // Unlimited
    apiCallsDaily: -1,       // Unlimited
    apiKeys: 100,
    rateLimit: 3000,         // 50 req/sec
    features: {
      hybridSearch: true,
      reranking: true,
      federatedSearch: true,
      ragQuery: true,
      bulkOperations: true,
      analytics: true,
      webhooks: true,
      sso: true,
      prioritySupport: true,
    },
    maxInputTokens: 128_000,
    maxOutputTokens: 32_000,
    priceMonthly: 499,
    priceYearly: 4990,
  },
};

// ============================================
// Plan Utilities
// ============================================

/**
 * Get plan configuration by name
 */
export function getPlan(planName: string): PlanConfig {
  return PLANS[planName] || PLANS.free;
}

/**
 * Check if a feature is available for a plan
 */
export function hasFeature(
  planName: string,
  feature: keyof PlanConfig['features']
): boolean {
  const plan = getPlan(planName);
  return plan.features[feature];
}

/**
 * Get the limit for a specific resource
 */
export function getLimit(
  planName: string,
  limitType: 'memories' | 'apiCallsDaily' | 'apiKeys' | 'rateLimit'
): number {
  const plan = getPlan(planName);
  return plan[limitType];
}

/**
 * Check if limit is unlimited (-1)
 */
export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/**
 * Format limit for display
 */
export function formatLimit(limit: number): string {
  if (isUnlimited(limit)) return 'Unlimited';
  return limit.toLocaleString();
}

// ============================================
// Subscription Status
// ============================================

export interface SubscriptionStatus {
  plan: string;
  isActive: boolean;
  isCancelled: boolean;
  endsAt: Date | null;
  renewsAt: Date | null;
  daysRemaining: number | null;
}

/**
 * Calculate subscription status from profile data
 */
export function getSubscriptionStatus(profile: {
  plan: string;
  subscription_ends_at?: string | null;
  subscription_renews_at?: string | null;
  subscription_cancelled?: boolean;
}): SubscriptionStatus {
  const now = new Date();
  const endsAt = profile.subscription_ends_at
    ? new Date(profile.subscription_ends_at)
    : null;
  const renewsAt = profile.subscription_renews_at
    ? new Date(profile.subscription_renews_at)
    : null;

  // Free plan is always active
  if (profile.plan === 'free') {
    return {
      plan: 'free',
      isActive: true,
      isCancelled: false,
      endsAt: null,
      renewsAt: null,
      daysRemaining: null,
    };
  }

  // Check if subscription has expired
  const isExpired = endsAt && endsAt < now;
  const isCancelled = profile.subscription_cancelled || false;

  // Calculate days remaining
  let daysRemaining: number | null = null;
  if (endsAt && !isExpired) {
    daysRemaining = Math.ceil(
      (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    plan: isExpired ? 'free' : profile.plan,
    isActive: !isExpired,
    isCancelled,
    endsAt,
    renewsAt,
    daysRemaining,
  };
}

/**
 * Get the effective plan (considering subscription expiry)
 */
export function getEffectivePlan(profile: {
  plan: string;
  subscription_ends_at?: string | null;
}): string {
  const status = getSubscriptionStatus(profile);
  return status.plan;
}

// ============================================
// Usage Percentage
// ============================================

/**
 * Calculate usage percentage
 */
export function getUsagePercentage(current: number, limit: number): number {
  if (isUnlimited(limit)) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

/**
 * Get usage status (normal, warning, critical)
 */
export function getUsageStatus(
  current: number,
  limit: number
): 'normal' | 'warning' | 'critical' {
  const percentage = getUsagePercentage(current, limit);
  if (percentage >= 90) return 'critical';
  if (percentage >= 75) return 'warning';
  return 'normal';
}
