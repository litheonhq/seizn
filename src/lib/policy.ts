/**
 * Seizn Policy Configuration (SSOT)
 *
 * WP-P0-04: 정책 SSOT
 * All policy-related values MUST be defined here.
 * Pages should import and use these values, never hardcode.
 *
 * @see scripts/policy-consistency-check.mjs - automated validation
 */

// ============================================
// Plan Limits (SSOT for all pricing/limits)
// ============================================

export interface PlanLimitsConfig {
  name: string;
  memories: number;
  apiCallsPerMonth: number;
  apiKeys: number;
  collections: number;
  rateLimit: number;
  priceMonthly: number;
  priceYearly: number;
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
}

export const PLAN_LIMITS: Record<string, PlanLimitsConfig> = {
  free: {
    name: 'Free',
    memories: 10_000,
    apiCallsPerMonth: 1_000,
    apiKeys: 2,
    collections: 3,
    rateLimit: 60,
    priceMonthly: 0,
    priceYearly: 0,
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
  },
  starter: {
    name: 'Starter',
    memories: 50_000,
    apiCallsPerMonth: 5_000,
    apiKeys: 3,
    collections: 10,
    rateLimit: 120,
    priceMonthly: 9,
    priceYearly: 90,
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
  },
  plus: {
    name: 'Plus',
    memories: 100_000,
    apiCallsPerMonth: 10_000,
    apiKeys: 5,
    collections: 25,
    rateLimit: 300,
    priceMonthly: 29,
    priceYearly: 290,
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
  },
  pro: {
    name: 'Pro',
    memories: 1_000_000,
    apiCallsPerMonth: 100_000,
    apiKeys: 10,
    collections: 100,
    rateLimit: 600,
    priceMonthly: 99,
    priceYearly: 990,
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
  },
  enterprise: {
    name: 'Enterprise',
    memories: -1,
    apiCallsPerMonth: -1,
    apiKeys: 100,
    collections: -1,
    rateLimit: 3000,
    priceMonthly: 499,
    priceYearly: 4990,
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
  },
} as const;

export function getPlanLimits(planName: string): PlanLimitsConfig {
  return PLAN_LIMITS[planName] || PLAN_LIMITS.free;
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

export function formatLimit(limit: number): string {
  if (isUnlimited(limit)) return 'Unlimited';
  return limit.toLocaleString();
}

export const SDK_INFO = {
  packageName: 'seizn',
  installCommand: 'npm install seizn',
  pythonPackage: 'seizn',
  pythonInstallCommand: 'pip install seizn',
} as const;

// ============================================
// Data Retention Policies
// ============================================

export const DATA_RETENTION = {
  ACCOUNT_DELETION_DAYS: 30,
  RAW_LOGS_DAYS: 30,
  INACTIVE_MEMORIES_DAYS: 90,
  EXPORT_GRACE_DAYS: 30,
} as const;

// ============================================
// Refund Policies
// ============================================

export const REFUND_POLICY = {
  GUARANTEE_DAYS: 14,
  PROCESSING_DAYS: 5,
  MAX_REQUESTS_PER_YEAR: 2,
} as const;

// ============================================
// Communication Policies
// ============================================

export const COMMUNICATION = {
  POLICY_CHANGE_NOTICE_DAYS: 7,
  PRIVACY_RESPONSE_DAYS: 30,
  DATA_REQUEST_RESPONSE_DAYS: 30,
} as const;

// ============================================
// Invitation & Token Policies
// ============================================

export const TOKENS = {
  INVITE_EXPIRY_DAYS: 7,
  REVIEW_TOKEN_EXPIRY_DAYS: 7,
  PASSWORD_RESET_EXPIRY_HOURS: 24,
} as const;

// ============================================
// Support Policies
// ============================================

export const SUPPORT = {
  STANDARD_RESPONSE_HOURS: 48,
  PRIORITY_RESPONSE_HOURS: 24,
  ENTERPRISE_RESPONSE_HOURS: 4,
} as const;

// ============================================
// Utility Functions
// ============================================

export function formatDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

export function formatHours(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function getDataRetentionText(): string {
  return `${DATA_RETENTION.ACCOUNT_DELETION_DAYS} days after deletion request`;
}

export function getRefundGuaranteeText(): string {
  return `${REFUND_POLICY.GUARANTEE_DAYS}-day money-back guarantee`;
}

// ============================================
// Export All Constants for Type Safety
// ============================================

export const POLICY = {
  DATA_RETENTION,
  REFUND_POLICY,
  COMMUNICATION,
  TOKENS,
  SUPPORT,
  PLAN_LIMITS,
  SDK_INFO,
} as const;

export type PolicyConfig = typeof POLICY;
