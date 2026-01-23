/**
 * Seizn Policy Configuration (SSOT)
 *
 * WP-P0-04: 법무/가격/정책 문구 SSOT
 * All policy-related values MUST be defined here.
 * Pages should import and use these values, never hardcode.
 *
 * @see scripts/policy-consistency-check.mjs - automated validation
 */

// ============================================
// Data Retention Policies
// ============================================

export const DATA_RETENTION = {
  /** How long user data is kept after account deletion */
  ACCOUNT_DELETION_DAYS: 30,

  /** How long raw logs are retained */
  RAW_LOGS_DAYS: 30,

  /** How long memories are kept after last access */
  INACTIVE_MEMORIES_DAYS: 90,

  /** Grace period for data export before permanent deletion */
  EXPORT_GRACE_DAYS: 30,
} as const;

// ============================================
// Refund Policies
// ============================================

export const REFUND_POLICY = {
  /** Money-back guarantee period in days */
  GUARANTEE_DAYS: 14,

  /** Processing time for refunds in business days */
  PROCESSING_DAYS: 5,

  /** Maximum refund requests per year */
  MAX_REQUESTS_PER_YEAR: 2,
} as const;

// ============================================
// Communication Policies
// ============================================

export const COMMUNICATION = {
  /** Days notice before policy changes take effect */
  POLICY_CHANGE_NOTICE_DAYS: 7,

  /** Maximum response time for privacy inquiries */
  PRIVACY_RESPONSE_DAYS: 30,

  /** Maximum response time for data requests */
  DATA_REQUEST_RESPONSE_DAYS: 30,
} as const;

// ============================================
// Invitation & Token Policies
// ============================================

export const TOKENS = {
  /** Days until organization invite expires */
  INVITE_EXPIRY_DAYS: 7,

  /** Days until review token expires */
  REVIEW_TOKEN_EXPIRY_DAYS: 7,

  /** Days until password reset token expires */
  PASSWORD_RESET_EXPIRY_HOURS: 24,
} as const;

// ============================================
// Support Policies
// ============================================

export const SUPPORT = {
  /** Standard support response time in hours */
  STANDARD_RESPONSE_HOURS: 48,

  /** Priority support response time in hours */
  PRIORITY_RESPONSE_HOURS: 24,

  /** Enterprise support response time in hours */
  ENTERPRISE_RESPONSE_HOURS: 4,
} as const;

// ============================================
// Utility Functions
// ============================================

/**
 * Format days as human-readable string
 * @example formatDays(14) -> "14 days"
 * @example formatDays(1) -> "1 day"
 */
export function formatDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * Format hours as human-readable string
 * @example formatHours(24) -> "24 hours"
 * @example formatHours(1) -> "1 hour"
 */
export function formatHours(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/**
 * Get formatted data retention string for privacy policy
 */
export function getDataRetentionText(): string {
  return `${DATA_RETENTION.ACCOUNT_DELETION_DAYS} days after deletion request`;
}

/**
 * Get formatted refund guarantee string
 */
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
} as const;

export type PolicyConfig = typeof POLICY;
