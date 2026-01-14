/**
 * Guardrails Configuration
 *
 * Default configurations for feature flags, kill switches, and cost limits.
 * These can be overridden via environment variables or runtime configuration.
 */

import type { FeatureName, FeatureFlag } from '../lib/guardrails/feature-flags';
import type { CostLimitConfig } from '../lib/guardrails/cost-limiter';

// ============================================
// Environment Configuration
// ============================================

/**
 * Check if we're in development mode
 */
export const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Check if we're in production mode
 */
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Check if guardrails are disabled (dev mode override)
 */
export const guardrailsDisabled = process.env.DISABLE_GUARDRAILS === 'true';

// ============================================
// Feature Flag Configuration
// ============================================

/**
 * Features that are in beta (shown with beta badge)
 */
export const BETA_FEATURES: FeatureName[] = [
  'autopilot',
  'drift_detection',
  'ab_testing',
];

/**
 * Features that should be hidden from the UI entirely
 */
export const HIDDEN_FEATURES: FeatureName[] = [
  // Add features here that are WIP and shouldn't be visible
];

/**
 * Default feature flag overrides for specific environments
 */
export const ENVIRONMENT_FEATURE_OVERRIDES: Partial<Record<string, Partial<Record<FeatureName, Partial<FeatureFlag>>>>> = {
  development: {
    // Enable all features in development for testing
    autopilot: { enabled: true, rolloutPercentage: 100 },
    drift_detection: { enabled: true, rolloutPercentage: 100 },
    ab_testing: { enabled: true, rolloutPercentage: 100 },
  },
  staging: {
    // Enable beta features for internal testing
    autopilot: { enabled: true, rolloutPercentage: 50 },
    drift_detection: { enabled: true, rolloutPercentage: 25 },
  },
  production: {
    // Conservative settings for production
    autopilot: { enabled: true, rolloutPercentage: 10 },
    drift_detection: { enabled: true, rolloutPercentage: 5 },
    ab_testing: { enabled: false },
  },
};

// ============================================
// Kill Switch Configuration
// ============================================

/**
 * Features that can be killed via environment variables
 * Format: KILL_SWITCH_{FEATURE_NAME}=true
 */
export const KILLABLE_FEATURES = [
  'reranking',
  'hybrid_search',
  'federated_search',
  'rag_query',
  'bulk_operations',
  'webhooks',
  'autopilot',
  'pii_detection',
  'answer_contract',
  'embeddings',
  'llm_calls',
  'ingestion',
  'search',
  'all_api',
] as const;

/**
 * Default kill switch durations for different scenarios
 */
export const KILL_SWITCH_DURATIONS = {
  /** Short maintenance (5 minutes) */
  short: 5 * 60 * 1000,
  /** Medium maintenance (30 minutes) */
  medium: 30 * 60 * 1000,
  /** Long maintenance (2 hours) */
  long: 2 * 60 * 60 * 1000,
  /** Extended maintenance (24 hours) */
  extended: 24 * 60 * 60 * 1000,
};

// ============================================
// Cost Limit Configuration
// ============================================

/**
 * Cost per operation estimates (in cents)
 * Used for pre-flight cost estimation
 */
export const OPERATION_COSTS = {
  /** Vector search (embedding lookup) */
  vectorSearch: 0.01,
  /** Hybrid search (vector + BM25) */
  hybridSearch: 0.02,
  /** Federated search (multiple sources) */
  federatedSearch: 0.05,
  /** Reranking (per 10 items) */
  reranking: 0.1,
  /** RAG query (LLM call) */
  ragQuery: 1.0,
  /** Answer contract verification */
  answerContract: 0.5,
  /** PII detection */
  piiDetection: 0.2,
  /** Document ingestion (per page) */
  ingestionPerPage: 0.05,
  /** Embedding generation (per 1K tokens) */
  embeddingPer1kTokens: 0.02,
};

/**
 * Custom cost limits for specific users (overrides plan defaults)
 * Key: userId, Value: CostLimitConfig
 */
export const USER_COST_OVERRIDES: Record<string, Partial<CostLimitConfig>> = {
  // Example: Give a specific user higher limits
  // 'user-id-here': { dailyLimitCents: 10000 },
};

/**
 * Grace period for cost limit warnings (in percentage points)
 * Users get a warning this far before the actual limit
 */
export const COST_WARNING_GRACE = 10;

/**
 * How often to clean up old cost entries (in milliseconds)
 */
export const COST_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// ============================================
// Alert Configuration
// ============================================

/**
 * Thresholds for triggering alerts
 */
export const ALERT_THRESHOLDS = {
  /** Percentage of kill switches active to trigger alert */
  killSwitchActivePercent: 25,
  /** Number of users hitting cost limits to trigger alert */
  usersAtCostLimit: 100,
  /** Number of blocked requests per minute to trigger alert */
  blockedRequestsPerMinute: 50,
};

/**
 * Alert notification channels
 */
export const ALERT_CHANNELS = {
  slack: process.env.SLACK_WEBHOOK_URL,
  email: process.env.ALERT_EMAIL,
  pagerDuty: process.env.PAGERDUTY_KEY,
};

// ============================================
// Degradation Configuration
// ============================================

/**
 * Degradation levels and their effects
 */
export const DEGRADATION_CONFIG = {
  full: {
    description: 'All features available',
    maxResults: 10,
    maxTokens: 8000,
    rerankEnabled: true,
    answerContractEnabled: true,
  },
  degraded: {
    description: 'Expensive features disabled',
    maxResults: 5,
    maxTokens: 2000,
    rerankEnabled: false,
    answerContractEnabled: false,
  },
  blocked: {
    description: 'All API calls blocked',
    maxResults: 0,
    maxTokens: 0,
    rerankEnabled: false,
    answerContractEnabled: false,
  },
};

// ============================================
// API Response Configuration
// ============================================

/**
 * HTTP status codes for guardrail blocks
 */
export const GUARDRAIL_STATUS_CODES = {
  featureDisabled: 403,
  killSwitchActive: 503,
  costLimitExceeded: 429,
  degradedMode: 200, // Still OK but with reduced functionality
};

/**
 * Standard error messages
 */
export const GUARDRAIL_MESSAGES = {
  featureDisabled: 'This feature is not available on your current plan.',
  killSwitchActive: 'This feature is temporarily unavailable. Please try again later.',
  costLimitExceeded: 'Daily usage limit exceeded. Please try again tomorrow or upgrade your plan.',
  degradedMode: 'Operating in degraded mode due to high usage.',
};

// ============================================
// Export Configuration Object
// ============================================

export const guardrailsConfig = {
  isDevelopment,
  isProduction,
  guardrailsDisabled,
  betaFeatures: BETA_FEATURES,
  hiddenFeatures: HIDDEN_FEATURES,
  environmentOverrides: ENVIRONMENT_FEATURE_OVERRIDES,
  killableFeatures: KILLABLE_FEATURES,
  killSwitchDurations: KILL_SWITCH_DURATIONS,
  operationCosts: OPERATION_COSTS,
  userCostOverrides: USER_COST_OVERRIDES,
  costWarningGrace: COST_WARNING_GRACE,
  costCleanupInterval: COST_CLEANUP_INTERVAL,
  alertThresholds: ALERT_THRESHOLDS,
  alertChannels: ALERT_CHANNELS,
  degradationConfig: DEGRADATION_CONFIG,
  statusCodes: GUARDRAIL_STATUS_CODES,
  messages: GUARDRAIL_MESSAGES,
};

export default guardrailsConfig;
