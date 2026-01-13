/**
 * Seizn Policy Simulator - Types
 *
 * Type definitions for policy-as-code simulation system.
 * Supports testing policy changes against historical queries before production deployment.
 */

// ============================================
// Policy Types
// ============================================

/** Supported policy types */
export type PolicyType =
  | 'pii_masking'
  | 'access_control'
  | 'ttl'
  | 'scope'
  | 'content_filter';

/** Actions a policy rule can take */
export type PolicyAction = 'allow' | 'block' | 'mask' | 'redact';

/** Comparison operators for conditions */
export type ConditionOperator =
  | 'contains'
  | 'not_contains'
  | 'matches'
  | 'not_matches'
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'is_null'
  | 'is_not_null';

/** Flags for condition evaluation */
export type ConditionFlag =
  | 'case_insensitive'
  | 'trim_whitespace'
  | 'normalize_unicode';

// ============================================
// Policy Condition
// ============================================

/** A single condition in a policy rule */
export interface PolicyCondition {
  /** Field path to evaluate (e.g., 'content', 'metadata.type', 'chunk.source') */
  field: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value(s) to compare against */
  value: string | number | boolean | string[] | number[];
  /** Optional flags for evaluation */
  flags?: ConditionFlag[];
}

/** Logical grouping of conditions */
export interface ConditionGroup {
  /** Logical operator: all conditions must match (AND) or any (OR) */
  logic: 'and' | 'or';
  /** Conditions in this group */
  conditions: (PolicyCondition | ConditionGroup)[];
}

// ============================================
// Policy Rule
// ============================================

/** A single policy rule */
export interface PolicyRule {
  /** Unique identifier for the rule */
  id?: string;
  /** Human-readable name */
  name?: string;
  /** Description of what this rule does */
  description?: string;
  /** Policy type this rule belongs to */
  type: PolicyType;
  /** Conditions that trigger this rule (AND logic by default) */
  conditions: PolicyCondition[];
  /** Optional nested condition groups for complex logic */
  conditionGroups?: ConditionGroup[];
  /** Action to take when conditions match */
  action: PolicyAction;
  /** Priority for rule ordering (higher = evaluated first) */
  priority: number;
  /** Whether this rule is enabled */
  enabled?: boolean;
  /** Masking configuration (for mask/redact actions) */
  maskConfig?: MaskConfig;
}

/** Configuration for masking operations */
export interface MaskConfig {
  /** Type of masking to apply */
  maskType: 'partial' | 'full' | 'hash' | 'tokenize';
  /** Characters to show at start (for partial) */
  showStart?: number;
  /** Characters to show at end (for partial) */
  showEnd?: number;
  /** Replacement character for full masking */
  replacement?: string;
  /** Preserve format (e.g., email structure) */
  preserveFormat?: boolean;
}

// ============================================
// Policy Definition
// ============================================

/** Complete policy definition stored in database */
export interface PolicyDefinition {
  id: string;
  userId: string;
  name: string;
  description?: string;
  /** Original YAML source */
  policyYaml?: string;
  /** Parsed JSON rules */
  policyJson: {
    version?: string;
    rules: PolicyRule[];
    defaults?: {
      action?: PolicyAction;
      priority?: number;
    };
  };
  policyType: PolicyType;
  version: number;
  isActive: boolean;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new policy */
export interface CreatePolicyInput {
  name: string;
  description?: string;
  policyYaml?: string;
  policyJson: PolicyDefinition['policyJson'];
  policyType: PolicyType;
}

/** Input for updating a policy */
export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  policyYaml?: string;
  policyJson?: PolicyDefinition['policyJson'];
  isActive?: boolean;
  isDraft?: boolean;
}

// ============================================
// Chunk Reference
// ============================================

/** Reference to a chunk for simulation */
export interface ChunkRef {
  id: string;
  documentId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  score?: number;
  source?: string;
}

/** Extended chunk with evaluation context */
export interface EvaluatedChunk extends ChunkRef {
  /** Original content before any masking */
  originalContent?: string;
  /** Rules that matched this chunk */
  matchedRules: string[];
  /** Why the action was taken */
  reason?: string;
}

// ============================================
// Evaluation Results
// ============================================

/** Result of evaluating a single chunk against policy */
export interface EvaluationResult {
  chunkId: string;
  /** Final action after all rules evaluated */
  action: PolicyAction;
  /** Rules that matched (in order of evaluation) */
  matchedRules: string[];
  /** Content after masking (if action is mask/redact) */
  maskedContent?: string;
  /** Fields that were masked */
  maskedFields?: string[];
  /** Confidence in the decision */
  confidence?: number;
  /** Explanation for the decision */
  explanation?: string;
}

/** Batch evaluation result */
export interface BatchEvaluationResult {
  results: EvaluationResult[];
  summary: {
    total: number;
    allowed: number;
    blocked: number;
    masked: number;
    redacted: number;
  };
  processingTimeMs: number;
}

// ============================================
// Simulation Types
// ============================================

/** Status of a simulation run */
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Configuration for running a simulation */
export interface SimulationConfig {
  /** Base policy ID (current production policy) */
  basePolicyId?: string;
  /** Test policy ID (proposed changes) */
  testPolicyId?: string;
  /** Or provide inline test rules */
  testPolicyRules?: PolicyRule[];
  /** Specific query IDs to test */
  queryIds?: string[];
  /** Use queries from a regression test set */
  regressionSetId?: string;
  /** Inline queries to test */
  inlineQueries?: string[];
  /** Maximum queries to process */
  maxQueries?: number;
  /** Include chunk content in results */
  includeContent?: boolean;
  /** Calculate detailed impact metrics */
  calculateMetrics?: boolean;
}

/** Summary of simulation results */
export interface SimulationSummary {
  simulationId: string;
  status: SimulationStatus;
  totalQueries: number;
  affectedQueries: number;
  blockedChunksCount: number;
  unblockedChunksCount: number;
  maskingChangedCount: number;
  overallImpactScore: number;
  executionTimeMs: number;
  error?: string;
}

/** Detailed simulation record from database */
export interface PolicySimulation {
  id: string;
  userId: string;
  basePolicyId?: string;
  testPolicyId?: string;
  testQueries?: {
    queryIds?: string[];
    inlineQueries?: string[];
  };
  regressionSetId?: string;
  status: SimulationStatus;
  totalQueries: number;
  affectedQueries: number;
  blockedChunksCount: number;
  unblockedChunksCount: number;
  results?: SimulationResultsSummary;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

/** Summary results stored in simulation record */
export interface SimulationResultsSummary {
  impactByType: {
    pii_masking?: number;
    access_control?: number;
    content_filter?: number;
    ttl?: number;
    scope?: number;
  };
  topAffectedQueries: {
    queryId: string;
    queryText: string;
    impactScore: number;
  }[];
  ruleActivationCounts: Record<string, number>;
}

// ============================================
// Simulation Result Details
// ============================================

/** Detailed result for a single query in simulation */
export interface SimulationResult {
  id: string;
  simulationId: string;
  queryId?: string;
  queryText: string;
  /** Chunks returned with base policy */
  baseChunks: EvaluatedChunk[];
  /** Chunks blocked by base policy */
  baseBlocked: EvaluatedChunk[];
  /** Chunks returned with test policy */
  testChunks: EvaluatedChunk[];
  /** Chunks blocked by test policy */
  testBlocked: EvaluatedChunk[];
  /** Chunks newly blocked by test policy */
  newlyBlocked: EvaluatedChunk[];
  /** Chunks newly allowed by test policy */
  newlyAllowed: EvaluatedChunk[];
  /** Chunks with changed masking */
  maskingChanged: EvaluatedChunk[];
  /** Impact score for this query (0-1) */
  impactScore: number;
  createdAt: string;
}

// ============================================
// Diff Types
// ============================================

/** Diff between base and test policy results */
export interface PolicyDiff {
  /** Chunks blocked by test but not base */
  newlyBlocked: ChunkRef[];
  /** Chunks allowed by test but blocked by base */
  newlyAllowed: ChunkRef[];
  /** Chunks with different masking */
  maskingChanged: {
    chunk: ChunkRef;
    baseMasked: string;
    testMasked: string;
  }[];
  /** Overall impact score (0-1) */
  impactScore: number;
  /** Impact breakdown */
  impactBreakdown: {
    blockedImpact: number;
    allowedImpact: number;
    maskingImpact: number;
  };
}

// ============================================
// Validation Types
// ============================================

/** Result of validating a policy */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/** A validation error */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/** A validation warning */
export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

// ============================================
// API Request/Response Types
// ============================================

/** Request to create a simulation */
export interface CreateSimulationRequest {
  basePolicyId?: string;
  testPolicyId?: string;
  testPolicyYaml?: string;
  queryIds?: string[];
  regressionSetId?: string;
  inlineQueries?: string[];
  maxQueries?: number;
}

/** Response from simulation creation */
export interface CreateSimulationResponse {
  success: boolean;
  simulationId: string;
  status: SimulationStatus;
  estimatedTimeSeconds?: number;
}

/** Request to get simulation results */
export interface GetSimulationResultsRequest {
  simulationId: string;
  includeDetails?: boolean;
  limit?: number;
  offset?: number;
}

/** Response with simulation results */
export interface GetSimulationResultsResponse {
  simulation: PolicySimulation;
  summary: SimulationSummary;
  results?: SimulationResult[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
