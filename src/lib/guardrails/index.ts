/**
 * Guardrails Module for Seizn
 *
 * Centralized exports for feature flags, kill switches, and cost limiting.
 * Use these to control feature availability and protect system resources.
 *
 * @example
 * ```typescript
 * import {
 *   isFeatureEnabled,
 *   isKilled,
 *   checkCostLimit,
 *   checkGuardrails
 * } from '@/lib/guardrails';
 *
 * // Quick check before expensive operation
 * const guard = checkGuardrails('reranking', userId, userPlan);
 * if (!guard.allowed) {
 *   return { error: guard.reason };
 * }
 * ```
 */

// Feature Flags
export {
  type FeatureFlag,
  type FeatureName,
  DEFAULT_FEATURE_FLAGS,
  getFeatureFlags,
  getFeatureFlag,
  isFeatureEnabled,
  isFeatureEnabledByPlan,
  setFeatureFlagOverride,
  clearFeatureFlagOverride,
  clearAllFeatureFlagOverrides,
  getUpgradeRequiredFeatures,
  getEnabledFeatures,
} from './feature-flags';

// Kill Switches
export {
  type KillSwitch,
  type KillSwitchFeature,
  getKillSwitchFeatures,
  getKillSwitches,
  getKillSwitch,
  isKilled,
  checkKillSwitch,
  activateKillSwitch,
  deactivateKillSwitch,
  deactivateAllKillSwitches,
  activateTemporaryKillSwitch,
  activateCostControlMode,
  activateMaintenanceMode,
  activateEmergencyStop,
  getActiveKillSwitchCount,
  exportKillSwitchState,
  importKillSwitchState,
} from './kill-switch';

// Cost Limiter
export {
  type CostLimitConfig,
  type DegradationLevel,
  type CostCheckResult,
  type CostEntry,
  COST_LIMITS,
  getCostLimitConfig,
  getDailyCost,
  addCost,
  checkCostLimit,
  isFeatureAllowedByCost,
  estimateCost,
  wouldExceedLimit,
  getCostBreakdown,
  resetDailyCosts,
  cleanupOldEntries,
  getDegradedSettings,
  getRemainingBudget,
  shouldWarnUser,
} from './cost-limiter';

// ============================================
// Unified Guardrail Check
// ============================================

import { isFeatureEnabled, type FeatureName } from './feature-flags';
import { isKilled, checkKillSwitch, type KillSwitchFeature } from './kill-switch';
import { checkCostLimit, isFeatureAllowedByCost, type DegradationLevel } from './cost-limiter';

export interface GuardrailCheckResult {
  /** Whether the feature/operation is allowed */
  allowed: boolean;
  /** Human-readable reason if not allowed */
  reason: string | null;
  /** Degradation level from cost limiter */
  degradationLevel: DegradationLevel;
  /** Which check failed: 'feature', 'killswitch', 'cost', or null */
  failedCheck: 'feature' | 'killswitch' | 'cost' | null;
  /** Retry-After date if temporarily blocked */
  retryAfter: Date | null;
}

/**
 * Unified guardrail check for any feature
 *
 * Checks in order:
 * 1. Kill switch - is the feature emergency-disabled?
 * 2. Feature flag - is the feature enabled for this plan?
 * 3. Cost limit - is the user within their budget?
 *
 * @example
 * ```typescript
 * const result = checkGuardrails('reranking', userId, 'starter');
 * if (!result.allowed) {
 *   console.log('Blocked:', result.reason);
 *   console.log('Failed check:', result.failedCheck);
 * }
 * ```
 */
export function checkGuardrails(
  featureName: FeatureName | KillSwitchFeature,
  userId: string,
  userPlan: string = 'free'
): GuardrailCheckResult {
  // 1. Check kill switch first (highest priority)
  const killCheck = checkKillSwitch(featureName as KillSwitchFeature);
  if (killCheck.killed) {
    return {
      allowed: false,
      reason: killCheck.reason,
      degradationLevel: 'blocked',
      failedCheck: 'killswitch',
      retryAfter: killCheck.retryAfter,
    };
  }

  // 2. Check feature flag (plan-based access)
  if (!isFeatureEnabled(featureName as FeatureName, userPlan, userId)) {
    return {
      allowed: false,
      reason: `Feature "${featureName}" is not available on your ${userPlan} plan. Please upgrade to access this feature.`,
      degradationLevel: 'full',
      failedCheck: 'feature',
      retryAfter: null,
    };
  }

  // 3. Check cost limit
  const costCheck = isFeatureAllowedByCost(userId, userPlan, featureName);
  if (!costCheck.allowed) {
    const fullCostCheck = checkCostLimit(userId, userPlan);
    return {
      allowed: false,
      reason: costCheck.reason || 'Cost limit exceeded',
      degradationLevel: fullCostCheck.level,
      failedCheck: 'cost',
      retryAfter: fullCostCheck.resetsAt,
    };
  }

  // All checks passed
  const costStatus = checkCostLimit(userId, userPlan);
  return {
    allowed: true,
    reason: null,
    degradationLevel: costStatus.level,
    failedCheck: null,
    retryAfter: null,
  };
}

/**
 * Quick check if a feature is available (without cost check)
 * Useful for UI feature visibility
 */
export function isFeatureAvailable(
  featureName: FeatureName | KillSwitchFeature,
  userPlan: string = 'free',
  userId?: string
): boolean {
  // Check kill switch
  if (isKilled(featureName as KillSwitchFeature)) {
    return false;
  }

  // Check feature flag
  return isFeatureEnabled(featureName as FeatureName, userPlan, userId);
}

/**
 * Get operation settings based on guardrails
 * Returns degraded settings if user is near cost limit
 */
export function getOperationSettings(
  userId: string,
  userPlan: string = 'free'
): {
  useReranking: boolean;
  usePiiDetection: boolean;
  useAnswerContract: boolean;
  useAutopilot: boolean;
  maxResults: number;
  maxTokens: number;
  degraded: boolean;
} {
  const costCheck = checkCostLimit(userId, userPlan);

  // Base settings from feature flags
  const canRerank = isFeatureAvailable('reranking', userPlan, userId);
  const canPii = isFeatureAvailable('pii_detection', userPlan, userId);
  const canContract = isFeatureAvailable('answer_contract', userPlan, userId);
  const canAutopilot = isFeatureAvailable('autopilot', userPlan, userId);

  // Apply degradation if near cost limit
  if (costCheck.level === 'blocked') {
    return {
      useReranking: false,
      usePiiDetection: false,
      useAnswerContract: false,
      useAutopilot: false,
      maxResults: 0,
      maxTokens: 0,
      degraded: true,
    };
  }

  if (costCheck.level === 'degraded') {
    return {
      useReranking: false,
      usePiiDetection: false,
      useAnswerContract: false,
      useAutopilot: false,
      maxResults: 5,
      maxTokens: 2000,
      degraded: true,
    };
  }

  // Full mode
  return {
    useReranking: canRerank,
    usePiiDetection: canPii,
    useAnswerContract: canContract,
    useAutopilot: canAutopilot,
    maxResults: 10,
    maxTokens: 8000,
    degraded: false,
  };
}
