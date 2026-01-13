/**
 * Auto-Healer
 *
 * Automatically analyzes validation failures and applies healing strategies
 * to fix AI responses that don't meet contract requirements.
 */

import { randomUUID } from 'crypto';
import type { ValidationResult, AssertionResult } from '../contracts/types';
import type {
  HealingAction,
  HealingResult,
  HealingPlan,
  HealingExecution,
  HealingRule,
  HealingRuleMatch,
  AutoHealingConfig,
  HealingStrategy,
} from './types';
import { DEFAULT_AUTO_HEALING_CONFIG } from './types';
import { executeStrategy, StrategyContext, deepClone } from './strategies';

// ============================================
// Healing Plan Generation
// ============================================

/**
 * Analyze validation result and generate a healing plan
 */
export function analyzeFailures(
  validationResult: ValidationResult,
  rules: HealingRule[] = [],
  config: Partial<AutoHealingConfig> = {}
): HealingPlan {
  const mergedConfig = { ...DEFAULT_AUTO_HEALING_CONFIG, ...config };
  const failedAssertions = validationResult.results.filter(r => r.status === 'fail');
  const warningAssertions = validationResult.results.filter(r => r.status === 'warning');

  const actions: HealingAction[] = [];
  let actionIndex = 0;

  // Generate actions for failed assertions
  for (const assertion of failedAssertions) {
    const matchedRules = matchRules(assertion, rules);
    const action = createHealingAction(assertion, matchedRules, mergedConfig, actionIndex++);
    if (action) {
      actions.push(action);
    }
  }

  // Optionally handle warnings
  for (const assertion of warningAssertions) {
    const matchedRules = matchRules(assertion, rules);
    const action = createHealingAction(assertion, matchedRules, mergedConfig, actionIndex++);
    if (action) {
      action.priority += 100; // Lower priority for warnings
      actions.push(action);
    }
  }

  // Sort by priority
  actions.sort((a, b) => a.priority - b.priority);

  // Limit actions if configured
  const limitedActions = actions.slice(0, mergedConfig.maxActionsPerExecution);

  // Estimate success rate based on strategy types
  const estimatedSuccessRate = estimateSuccessRate(limitedActions);

  return {
    id: randomUUID(),
    validationResult,
    actions: limitedActions,
    estimatedSuccessRate,
    totalActions: limitedActions.length,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Match healing rules to an assertion result
 */
function matchRules(
  assertion: AssertionResult,
  rules: HealingRule[]
): HealingRuleMatch[] {
  const matches: HealingRuleMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    let confidence = 0;

    // Match by assertion type
    if (rule.assertionType && rule.assertionType === assertion.assertionType) {
      confidence += 0.5;
    }

    // Match by error pattern
    if (rule.errorPattern) {
      const regex = new RegExp(rule.errorPattern, 'i');
      if (regex.test(assertion.message)) {
        confidence += 0.5;
      }
    }

    // If no specific matching criteria, give low confidence
    if (!rule.assertionType && !rule.errorPattern) {
      confidence = 0.1;
    }

    if (confidence > 0) {
      matches.push({ rule, assertionResult: assertion, confidence });
    }
  }

  // Sort by confidence (highest first) then priority
  return matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.rule.priority - b.rule.priority;
  });
}

/**
 * Create a healing action from an assertion result
 */
function createHealingAction(
  assertion: AssertionResult,
  matchedRules: HealingRuleMatch[],
  config: AutoHealingConfig,
  index: number
): HealingAction | null {
  let strategy: HealingStrategy;
  let params: Record<string, unknown> = {};
  let priority = index;

  if (matchedRules.length > 0) {
    // Use the best matching rule
    const bestMatch = matchedRules[0];
    strategy = bestMatch.rule.strategy;
    params = bestMatch.rule.config as Record<string, unknown>;
    priority = bestMatch.rule.priority;
  } else {
    // Use default strategy for this assertion type
    const defaultStrategy = config.defaultStrategies[assertion.assertionType];
    if (!defaultStrategy) {
      return null; // No strategy available
    }
    strategy = defaultStrategy;
  }

  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    strategy,
    assertionId: assertion.assertionId,
    field: assertion.field,
    params,
    priority,
    maxAttempts: config.globalMaxRetries,
    currentAttempt: 0,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Estimate success rate based on strategies
 */
function estimateSuccessRate(actions: HealingAction[]): number {
  if (actions.length === 0) return 1;

  // Success rate estimates by strategy type
  const strategySuccessRates: Record<HealingStrategy, number> = {
    default_value: 0.95,
    fallback: 0.9,
    transform: 0.85,
    coerce: 0.8,
    truncate: 0.9,
    skip: 1.0,
    retry: 0.7,
    retry_modified: 0.6,
    escalate: 0, // Escalation is not a fix
  };

  const totalRate = actions.reduce((sum, action) => {
    return sum + (strategySuccessRates[action.strategy] || 0.5);
  }, 0);

  return totalRate / actions.length;
}

// ============================================
// Healing Execution
// ============================================

/**
 * Execute a healing plan
 */
export async function executeHealingPlan(
  plan: HealingPlan,
  data: unknown,
  context: Partial<StrategyContext> = {}
): Promise<HealingExecution> {
  const startTime = new Date().toISOString();
  const results: HealingResult[] = [];
  let healedData = deepClone(data);
  let successfulActions = 0;
  let failedActions = 0;
  let skippedActions = 0;

  for (const action of plan.actions) {
    if (action.status === 'skipped') {
      skippedActions++;
      continue;
    }

    action.status = 'in_progress';
    action.currentAttempt++;
    action.updatedAt = new Date().toISOString();

    const actionStartTime = Date.now();

    // Find the corresponding assertion result
    const assertionResult = plan.validationResult.results.find(
      r => r.assertionId === action.assertionId
    );

    const strategyContext: StrategyContext = {
      ...context,
      assertionResult,
    };

    const executionResult = await executeStrategy(
      action.strategy,
      healedData,
      action,
      strategyContext
    );

    const durationMs = Date.now() - actionStartTime;

    const healingResult: HealingResult = {
      actionId: action.id,
      strategy: action.strategy,
      status: executionResult.success ? 'success' : 'failed',
      originalValue: assertionResult?.actual,
      healedValue: executionResult.healedData !== undefined
        ? (action.field ? getFieldValue(executionResult.healedData, action.field) : executionResult.healedData)
        : undefined,
      message: executionResult.message,
      durationMs,
      metadata: executionResult.metadata,
    };

    results.push(healingResult);

    if (executionResult.success) {
      action.status = 'success';
      successfulActions++;
      if (executionResult.healedData !== undefined) {
        healedData = executionResult.healedData;
      }
    } else {
      action.status = 'failed';
      failedActions++;
    }

    action.updatedAt = new Date().toISOString();
  }

  const endTime = new Date().toISOString();
  const totalDurationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

  return {
    planId: plan.id,
    status: failedActions === 0 ? 'success' : successfulActions > 0 ? 'in_progress' : 'failed',
    results,
    originalData: data,
    healedData,
    startTime,
    endTime,
    totalDurationMs,
    successfulActions,
    failedActions,
    skippedActions,
  };
}

/**
 * Get field value from data (helper)
 */
function getFieldValue(data: unknown, path: string): unknown {
  if (!path || !data) return data;

  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================
// Auto-Healer Class
// ============================================

export class AutoHealer {
  private config: AutoHealingConfig;
  private rules: HealingRule[];

  constructor(config: Partial<AutoHealingConfig> = {}) {
    this.config = { ...DEFAULT_AUTO_HEALING_CONFIG, ...config };
    this.rules = this.config.rules || [];
  }

  /**
   * Add a healing rule
   */
  addRule(rule: HealingRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a healing rule
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoHealingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Analyze a validation result and create a healing plan
   */
  analyze(validationResult: ValidationResult): HealingPlan {
    return analyzeFailures(validationResult, this.rules, this.config);
  }

  /**
   * Execute healing on data using a plan
   */
  async heal(
    plan: HealingPlan,
    data: unknown,
    context: Partial<StrategyContext> = {}
  ): Promise<HealingExecution> {
    if (!this.config.enabled) {
      return {
        planId: plan.id,
        status: 'skipped',
        results: [],
        originalData: data,
        healedData: data,
        startTime: new Date().toISOString(),
        successfulActions: 0,
        failedActions: 0,
        skippedActions: plan.actions.length,
      };
    }

    const fullContext: StrategyContext = {
      ...context,
      config: this.config as unknown as Record<string, unknown>,
    };

    return executeHealingPlan(plan, data, fullContext);
  }

  /**
   * Analyze and heal in one step
   */
  async autoFix(
    validationResult: ValidationResult,
    data: unknown,
    context: Partial<StrategyContext> = {}
  ): Promise<{ plan: HealingPlan; execution: HealingExecution }> {
    const plan = this.analyze(validationResult);
    const execution = await this.heal(plan, data, context);
    return { plan, execution };
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoHealingConfig {
    return { ...this.config };
  }

  /**
   * Get all rules
   */
  getRules(): HealingRule[] {
    return [...this.rules];
  }
}

// ============================================
// Export singleton instance
// ============================================

export const defaultAutoHealer = new AutoHealer();

// Re-export DEFAULT_AUTO_HEALING_CONFIG
export { DEFAULT_AUTO_HEALING_CONFIG } from './types';
