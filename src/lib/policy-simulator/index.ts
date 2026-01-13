/**
 * Seizn Policy Simulator
 *
 * Policy-as-Code simulation system for testing policy changes
 * against historical queries before production deployment.
 *
 * Features:
 * - YAML/JSON policy definition parsing
 * - Policy evaluation against chunks
 * - Simulation of policy changes
 * - Diff computation between policies
 * - Impact analysis and recommendations
 *
 * @example
 * ```typescript
 * import {
 *   parsePolicy,
 *   validatePolicy,
 *   runSimulation,
 *   computeDiff,
 * } from '@/lib/policy-simulator';
 *
 * // Parse YAML policy
 * const rules = parsePolicy(`
 *   version: "1.0"
 *   rules:
 *     - type: pii_masking
 *       action: mask
 *       priority: 10
 *       conditions:
 *         - field: content
 *           operator: matches
 *           value: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
 *       mask_config:
 *         mask_type: partial
 *         show_start: 2
 *         show_end: 4
 * `);
 *
 * // Validate policy
 * const validation = validatePolicy(rules);
 * if (!validation.valid) {
 *   console.error('Policy errors:', validation.errors);
 * }
 *
 * // Run simulation
 * const result = await runSimulation(userId, {
 *   basePolicyId: 'policy-uuid',
 *   testPolicyRules: rules,
 *   maxQueries: 100,
 * });
 *
 * console.log(`Impact score: ${result.overallImpactScore}`);
 * ```
 */

// ============================================
// Type Exports
// ============================================

export type {
  // Policy types
  PolicyType,
  PolicyAction,
  ConditionOperator,
  ConditionFlag,
  PolicyCondition,
  ConditionGroup,
  PolicyRule,
  MaskConfig,
  PolicyDefinition,
  CreatePolicyInput,
  UpdatePolicyInput,

  // Chunk types
  ChunkRef,
  EvaluatedChunk,

  // Evaluation types
  EvaluationResult,
  BatchEvaluationResult,

  // Simulation types
  SimulationStatus,
  SimulationConfig,
  SimulationSummary,
  PolicySimulation,
  SimulationResultsSummary,
  SimulationResult,

  // Diff types
  PolicyDiff,

  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,

  // API types
  CreateSimulationRequest,
  CreateSimulationResponse,
  GetSimulationResultsRequest,
  GetSimulationResultsResponse,
} from './types';

// ============================================
// Parser Exports
// ============================================

export {
  parsePolicy,
  parsePolicyJson,
  validatePolicy,
  serializeToYaml,
  serializeToJson,
  PolicyParseError,
} from './parser';

// ============================================
// Evaluator Exports
// ============================================

export {
  evaluatePolicy,
  evaluatePolicyBatch,
  getEvaluationStats,
  filterChunksByPolicy,
  type EvaluationContext,
} from './evaluator';

// ============================================
// Simulator Exports
// ============================================

export {
  runSimulation,
  getSimulation,
  getSimulationResults,
  listSimulations,
  SimulationError,
} from './simulator';

// ============================================
// Differ Exports
// ============================================

export {
  computeDiff,
  computeAggregateImpact,
  analyzeDetailedDiff,
  getChunkLevelDiff,
  calculateDiffStatistics,
  type DetailedDiffAnalysis,
  type ChunkDiffDetail,
  type DiffStatistics,
} from './differ';

// ============================================
// Re-export commonly used constants
// ============================================

export const POLICY_TYPES: readonly string[] = [
  'pii_masking',
  'access_control',
  'ttl',
  'scope',
  'content_filter',
] as const;

export const POLICY_ACTIONS: readonly string[] = [
  'allow',
  'block',
  'mask',
  'redact',
] as const;

export const CONDITION_OPERATORS: readonly string[] = [
  'contains',
  'not_contains',
  'matches',
  'not_matches',
  'equals',
  'not_equals',
  'in',
  'not_in',
  'starts_with',
  'ends_with',
  'greater_than',
  'less_than',
  'is_null',
  'is_not_null',
] as const;
