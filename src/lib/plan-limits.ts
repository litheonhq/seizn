/**
 * Seizn Plan Limits Configuration
 *
 * Centralized configuration for all plan limits and quotas.
 * Connected to billing (Paddle) via profiles.plan field.
 *
 * IMPORTANT: All quotas are MONTHLY (reset at UTC midnight on 1st of month)
 * Rate limits are per-minute (RPM) for burst protection
 */

// ============================================
// Plan Configuration
// ============================================

export interface PlanThrottle {
  /** Requests per second */
  rps: number;
  /** Burst limit */
  burst: number;
}

export interface PlanConfig {
  // Display name
  name: string;

  // Quotas (ALL MONTHLY - no daily limits)
  memories: number;           // Max memories (-1 = unlimited)
  apiCallsMonthly: number;    // Monthly API calls (-1 = unlimited)
  apiKeys: number;            // Max API keys

  // Rate limits (requests per minute for burst protection)
  rateLimit: number;

  // Throttle configuration (rps and burst)
  throttle: PlanThrottle;

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
    memories: 12_000,           // 12K memories
    apiCallsMonthly: 1_000,     // 1K/month
    apiKeys: 2,
    rateLimit: 60,              // 60 RPM (1 req/sec)
    throttle: { rps: 3, burst: 10 },
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
    memories: 50_000,           // 50K memories
    apiCallsMonthly: 5_000,     // 5K/month
    apiKeys: 3,
    rateLimit: 120,             // 120 RPM (2 req/sec)
    throttle: { rps: 5, burst: 15 },
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
    memories: 100_000,          // 100K memories
    apiCallsMonthly: 10_000,    // 10K/month
    apiKeys: 5,
    rateLimit: 300,             // 300 RPM (5 req/sec)
    throttle: { rps: 10, burst: 30 },
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
    memories: 1_000_000,        // 1M memories
    apiCallsMonthly: 100_000,   // 100K/month
    apiKeys: 10,
    rateLimit: 600,             // 600 RPM (10 req/sec)
    throttle: { rps: 30, burst: 100 },
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
    memories: -1,               // Unlimited
    apiCallsMonthly: -1,        // Unlimited
    apiKeys: 100,
    rateLimit: 3000,            // 3000 RPM (50 req/sec)
    throttle: { rps: 200, burst: 500 },
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
  limitType: 'memories' | 'apiCallsMonthly' | 'apiKeys' | 'rateLimit'
): number {
  const plan = getPlan(planName);
  return plan[limitType];
}

// ============================================
// Quota Headers (RFC Draft Standard)
// ============================================

/**
 * Quota information for response headers
 */
export interface QuotaInfo {
  limit: number;
  remaining: number;
  reset: Date;      // UTC midnight on 1st of next month
  used: number;
}

/**
 * Get the next monthly reset date (1st of next month, UTC midnight)
 */
export function getNextMonthlyReset(): Date {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return nextMonth;
}

/**
 * Generate standardized quota headers
 * Following RFC draft pattern for rate limits
 */
export function getQuotaHeaders(info: QuotaInfo): Record<string, string> {
  const resetTimestamp = Math.floor(info.reset.getTime() / 1000);

  return {
    'X-Quota-Limit': String(info.limit),
    'X-Quota-Remaining': String(Math.max(0, info.remaining)),
    'X-Quota-Reset': info.reset.toISOString(),
    'X-Quota-Reset-Unix': String(resetTimestamp),
    'X-Quota-Used': String(info.used),
  };
}

/**
 * Generate standardized rate limit headers
 * Following RFC 6585 / IETF draft-ietf-httpapi-ratelimit-headers
 */
export function getRateLimitHeaders(info: {
  limit: number;
  remaining: number;
  reset: number;  // seconds until reset
}): Record<string, string> {
  return {
    'RateLimit-Limit': String(info.limit),
    'RateLimit-Remaining': String(Math.max(0, info.remaining)),
    'RateLimit-Reset': String(info.reset),
  };
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
