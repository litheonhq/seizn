/**
 * Self-Healing Types
 *
 * Defines types for automatic error recovery and self-healing mechanisms.
 */

import type { ValidationResult, AssertionResult } from '../contracts/types';

// ============================================
// Healing Action Types
// ============================================

export type HealingStrategy =
  | 'retry'           // Retry the same request
  | 'retry_modified'  // Retry with modified parameters
  | 'fallback'        // Use a fallback response
  | 'transform'       // Transform the response to match contract
  | 'default_value'   // Use default values for missing fields
  | 'truncate'        // Truncate data that exceeds limits
  | 'coerce'          // Coerce types to expected values
  | 'skip'            // Skip the failed assertion (warning only)
  | 'escalate';       // Escalate to human review

export type HealingStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

export interface HealingAction {
  id: string;
  strategy: HealingStrategy;
  assertionId?: string;
  field?: string;
  params?: Record<string, unknown>;
  priority: number; // Lower = higher priority
  maxAttempts: number;
  currentAttempt: number;
  status: HealingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HealingResult {
  actionId: string;
  strategy: HealingStrategy;
  status: HealingStatus;
  originalValue?: unknown;
  healedValue?: unknown;
  message: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Healing Plan Types
// ============================================

export interface HealingPlan {
  id: string;
  validationResult: ValidationResult;
  actions: HealingAction[];
  estimatedSuccessRate: number;
  totalActions: number;
  createdAt: string;
}

export interface HealingExecution {
  planId: string;
  status: HealingStatus;
  results: HealingResult[];
  originalData: unknown;
  healedData: unknown;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  successfulActions: number;
  failedActions: number;
  skippedActions: number;
}

// ============================================
// Strategy Configuration Types
// ============================================

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export interface FallbackConfig {
  fallbackValue: unknown;
  condition?: string; // JSON path condition
  priority: number;
}

export interface TransformConfig {
  transformations: Array<{
    field: string;
    operation: 'set' | 'delete' | 'rename' | 'map' | 'filter' | 'default';
    params?: Record<string, unknown>;
  }>;
}

export interface CoerceConfig {
  field: string;
  targetType: 'string' | 'number' | 'boolean' | 'array' | 'object';
  strict?: boolean;
}

export interface DefaultValueConfig {
  defaults: Record<string, unknown>;
  applyNested?: boolean;
}

export interface TruncateConfig {
  field: string;
  maxLength: number;
  truncateFrom?: 'start' | 'end';
  ellipsis?: string;
}

// ============================================
// Healing Rule Types
// ============================================

export interface HealingRule {
  id: string;
  name: string;
  description?: string;
  assertionType?: string; // Match specific assertion type
  errorPattern?: string;  // Regex pattern to match error messages
  strategy: HealingStrategy;
  config: RetryConfig | FallbackConfig | TransformConfig | CoerceConfig | DefaultValueConfig | TruncateConfig | Record<string, unknown>;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HealingRuleMatch {
  rule: HealingRule;
  assertionResult: AssertionResult;
  confidence: number; // 0-1, how well the rule matches
}

// ============================================
// Healing History Types
// ============================================

export interface HealingHistoryEntry {
  id: string;
  userId: string;
  contractId?: string;
  validationId?: string;
  execution: HealingExecution;
  createdAt: string;
}

export interface HealingStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDurationMs: number;
  strategyBreakdown: Record<HealingStrategy, {
    attempts: number;
    successes: number;
    failures: number;
  }>;
  commonFailures: Array<{
    assertionType: string;
    field?: string;
    count: number;
  }>;
}

// ============================================
// Auto-Healing Configuration
// ============================================

export interface AutoHealingConfig {
  enabled: boolean;
  maxActionsPerExecution: number;
  globalMaxRetries: number;
  timeoutMs: number;
  rules: HealingRule[];
  defaultStrategies: Record<string, HealingStrategy>;
  escalationWebhook?: string;
  logLevel: 'none' | 'errors' | 'all';
}

export const DEFAULT_AUTO_HEALING_CONFIG: AutoHealingConfig = {
  enabled: true,
  maxActionsPerExecution: 10,
  globalMaxRetries: 3,
  timeoutMs: 30000,
  rules: [],
  defaultStrategies: {
    hasField: 'default_value',
    matchesSchema: 'transform',
    matchesRegex: 'transform',
    inRange: 'coerce',
    oneOf: 'fallback',
    minLength: 'fallback',
    maxLength: 'truncate',
    isType: 'coerce',
    isNonEmpty: 'default_value',
    isArray: 'transform',
    arrayLength: 'transform',
    custom: 'escalate',
  },
  logLevel: 'errors',
};

// ============================================
// Database Types
// ============================================

export interface HealingRuleRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  assertion_type: string | null;
  error_pattern: string | null;
  strategy: HealingStrategy;
  config: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealingHistoryRow {
  id: string;
  user_id: string;
  contract_id: string | null;
  validation_id: string | null;
  status: HealingStatus;
  original_data: Record<string, unknown> | null;
  healed_data: Record<string, unknown> | null;
  actions_count: number;
  successful_actions: number;
  failed_actions: number;
  duration_ms: number;
  results: HealingResult[];
  created_at: string;
}
