/**
 * Feature Flags for Seizn
 *
 * Controls feature availability based on plan, environment, and manual overrides.
 * Can be controlled via environment variables or config.
 */

import { getPlan, type PlanConfig } from '../plan-limits';

// ============================================
// Types
// ============================================

export interface FeatureFlag {
  /** Unique feature identifier */
  name: string;
  /** Whether the feature is globally enabled */
  enabled: boolean;
  /** Human-readable description */
  description: string;
  /** Minimum plan required (null = available to all) */
  planRequired: string | null;
  /** Environment variable override key */
  envKey?: string;
  /** Whether this is a beta feature */
  isBeta?: boolean;
  /** Percentage of users to enable for (0-100, for gradual rollout) */
  rolloutPercentage?: number;
}

export type FeatureName =
  | 'reranking'
  | 'hybrid_search'
  | 'federated_search'
  | 'rag_query'
  | 'bulk_operations'
  | 'analytics'
  | 'webhooks'
  | 'sso'
  | 'priority_support'
  | 'autopilot'
  | 'semantic_chunking'
  | 'pii_detection'
  | 'answer_contract'
  | 'drift_detection'
  | 'ab_testing'
  | 'custom_embeddings'
  | 'multi_tenant'
  | 'audit_logs';

// ============================================
// Default Feature Flags
// ============================================

export const DEFAULT_FEATURE_FLAGS: Record<FeatureName, FeatureFlag> = {
  reranking: {
    name: 'reranking',
    enabled: true,
    description: 'Cohere reranking for improved search relevance',
    planRequired: 'starter',
    envKey: 'FEATURE_RERANKING',
  },
  hybrid_search: {
    name: 'hybrid_search',
    enabled: true,
    description: 'Combine vector and keyword search',
    planRequired: null, // Available to all plans
    envKey: 'FEATURE_HYBRID_SEARCH',
  },
  federated_search: {
    name: 'federated_search',
    enabled: true,
    description: 'Search across multiple data sources',
    planRequired: 'plus',
    envKey: 'FEATURE_FEDERATED_SEARCH',
  },
  rag_query: {
    name: 'rag_query',
    enabled: true,
    description: 'RAG-powered question answering',
    planRequired: null, // Available to all plans
    envKey: 'FEATURE_RAG_QUERY',
  },
  bulk_operations: {
    name: 'bulk_operations',
    enabled: true,
    description: 'Bulk import/export operations',
    planRequired: 'starter',
    envKey: 'FEATURE_BULK_OPERATIONS',
  },
  analytics: {
    name: 'analytics',
    enabled: true,
    description: 'Usage analytics and insights',
    planRequired: 'plus',
    envKey: 'FEATURE_ANALYTICS',
  },
  webhooks: {
    name: 'webhooks',
    enabled: true,
    description: 'Webhook notifications',
    planRequired: 'plus',
    envKey: 'FEATURE_WEBHOOKS',
  },
  sso: {
    name: 'sso',
    enabled: true,
    description: 'Single Sign-On (SAML/OIDC)',
    planRequired: 'enterprise',
    envKey: 'FEATURE_SSO',
  },
  priority_support: {
    name: 'priority_support',
    enabled: true,
    description: 'Priority customer support',
    planRequired: 'pro',
    envKey: 'FEATURE_PRIORITY_SUPPORT',
  },
  autopilot: {
    name: 'autopilot',
    enabled: true,
    description: 'Autopilot retrieval strategy selection',
    planRequired: 'plus',
    envKey: 'FEATURE_AUTOPILOT',
    isBeta: true,
  },
  semantic_chunking: {
    name: 'semantic_chunking',
    enabled: true,
    description: 'AI-powered semantic document chunking',
    planRequired: 'starter',
    envKey: 'FEATURE_SEMANTIC_CHUNKING',
  },
  pii_detection: {
    name: 'pii_detection',
    enabled: true,
    description: 'Automatic PII detection and masking',
    planRequired: 'plus',
    envKey: 'FEATURE_PII_DETECTION',
  },
  answer_contract: {
    name: 'answer_contract',
    enabled: true,
    description: 'Claim-level answer verification',
    planRequired: 'plus',
    envKey: 'FEATURE_ANSWER_CONTRACT',
  },
  drift_detection: {
    name: 'drift_detection',
    enabled: true,
    description: 'Embedding drift detection and monitoring',
    planRequired: 'pro',
    envKey: 'FEATURE_DRIFT_DETECTION',
    isBeta: true,
  },
  ab_testing: {
    name: 'ab_testing',
    enabled: true,
    description: 'A/B testing for retrieval strategies',
    planRequired: 'pro',
    envKey: 'FEATURE_AB_TESTING',
    isBeta: true,
  },
  custom_embeddings: {
    name: 'custom_embeddings',
    enabled: true,
    description: 'Custom embedding model support',
    planRequired: 'enterprise',
    envKey: 'FEATURE_CUSTOM_EMBEDDINGS',
  },
  multi_tenant: {
    name: 'multi_tenant',
    enabled: true,
    description: 'Multi-tenant workspace support',
    planRequired: 'enterprise',
    envKey: 'FEATURE_MULTI_TENANT',
  },
  audit_logs: {
    name: 'audit_logs',
    enabled: true,
    description: 'Detailed audit logging',
    planRequired: 'pro',
    envKey: 'FEATURE_AUDIT_LOGS',
  },
};

// ============================================
// Feature Flag Store
// ============================================

// In-memory feature flag overrides
const featureFlagOverrides = new Map<FeatureName, Partial<FeatureFlag>>();

/**
 * Get all feature flags with overrides applied
 */
export function getFeatureFlags(): Record<FeatureName, FeatureFlag> {
  const flags = { ...DEFAULT_FEATURE_FLAGS };

  // Apply environment variable overrides
  for (const [name, flag] of Object.entries(flags)) {
    const featureName = name as FeatureName;

    // Check environment variable
    if (flag.envKey && process.env[flag.envKey] !== undefined) {
      const envValue = process.env[flag.envKey]?.toLowerCase();
      flags[featureName] = {
        ...flag,
        enabled: envValue === 'true' || envValue === '1',
      };
    }

    // Apply in-memory overrides
    const override = featureFlagOverrides.get(featureName);
    if (override) {
      flags[featureName] = { ...flags[featureName], ...override };
    }
  }

  return flags;
}

/**
 * Get a single feature flag
 */
export function getFeatureFlag(name: FeatureName): FeatureFlag {
  const flags = getFeatureFlags();
  return flags[name];
}

/**
 * Check if a feature is enabled for a user's plan
 */
export function isFeatureEnabled(
  featureName: FeatureName,
  userPlan: string = 'free',
  userId?: string
): boolean {
  const flag = getFeatureFlag(featureName);

  // Check if globally disabled
  if (!flag.enabled) {
    return false;
  }

  // Check rollout percentage (gradual rollout)
  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
    if (!userId) {
      return false; // Can't do rollout without user ID
    }
    const hash = simpleHash(userId + featureName);
    if (hash % 100 >= flag.rolloutPercentage) {
      return false;
    }
  }

  // Check plan requirement
  if (flag.planRequired) {
    const planOrder = ['free', 'starter', 'plus', 'pro', 'enterprise'];
    const requiredIndex = planOrder.indexOf(flag.planRequired);
    const userIndex = planOrder.indexOf(userPlan);

    if (userIndex < requiredIndex) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a feature is enabled based on plan config (for backward compatibility)
 */
export function isFeatureEnabledByPlan(
  featureName: keyof PlanConfig['features'],
  userPlan: string = 'free'
): boolean {
  const plan = getPlan(userPlan);
  return plan.features[featureName] ?? false;
}

/**
 * Set a feature flag override (useful for testing or admin control)
 */
export function setFeatureFlagOverride(
  name: FeatureName,
  override: Partial<FeatureFlag>
): void {
  featureFlagOverrides.set(name, override);
}

/**
 * Clear a feature flag override
 */
export function clearFeatureFlagOverride(name: FeatureName): void {
  featureFlagOverrides.delete(name);
}

/**
 * Clear all feature flag overrides
 */
export function clearAllFeatureFlagOverrides(): void {
  featureFlagOverrides.clear();
}

/**
 * Get features that require upgrade for a given plan
 */
export function getUpgradeRequiredFeatures(
  userPlan: string
): { name: FeatureName; flag: FeatureFlag; upgradeTo: string }[] {
  const flags = getFeatureFlags();
  const planOrder = ['free', 'starter', 'plus', 'pro', 'enterprise'];
  const userIndex = planOrder.indexOf(userPlan);

  const upgradeRequired: { name: FeatureName; flag: FeatureFlag; upgradeTo: string }[] = [];

  for (const [name, flag] of Object.entries(flags) as [FeatureName, FeatureFlag][]) {
    if (flag.planRequired) {
      const requiredIndex = planOrder.indexOf(flag.planRequired);
      if (userIndex < requiredIndex) {
        upgradeRequired.push({
          name,
          flag,
          upgradeTo: flag.planRequired,
        });
      }
    }
  }

  return upgradeRequired;
}

/**
 * Get all enabled features for a plan
 */
export function getEnabledFeatures(userPlan: string, userId?: string): FeatureName[] {
  const flags = getFeatureFlags();
  const enabled: FeatureName[] = [];

  for (const name of Object.keys(flags) as FeatureName[]) {
    if (isFeatureEnabled(name, userPlan, userId)) {
      enabled.push(name);
    }
  }

  return enabled;
}

// ============================================
// Helpers
// ============================================

/**
 * Simple hash function for consistent rollout assignment
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
