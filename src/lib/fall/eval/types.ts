/**
 * Seizn Eval Pipeline - Type Definitions
 * Comprehensive types for search quality evaluation
 */

// ============================================
// Core Metric Types
// ============================================

/**
 * All supported evaluation metrics
 */
export type MetricType =
  | 'mrr' // Mean Reciprocal Rank
  | 'recall_at_k' // Recall@K
  | 'precision_at_k' // Precision@K
  | 'ndcg' // Normalized Discounted Cumulative Gain
  | 'hit_rate' // Hit Rate (at least one relevant result)
  | 'context_precision' // Context Precision
  | 'context_recall' // Context Recall
  | 'faithfulness'; // LLM-as-judge faithfulness score

/**
 * K values supported for @K metrics
 */
export type KValue = 1 | 3 | 5 | 10 | 20 | 50 | 100;

/**
 * Metric result with value and optional details
 */
export interface MetricResult {
  value: number;
  /** K value if applicable (for @K metrics) */
  k?: KValue;
  /** Additional details about the computation */
  details?: Record<string, unknown>;
}

/**
 * Complete metrics result for a single evaluation case
 */
export interface EvalCaseMetrics {
  /** Mean Reciprocal Rank */
  mrr?: number;
  /** Recall at various K values */
  recall_at_5?: number;
  recall_at_10?: number;
  recall_at_20?: number;
  /** Precision at various K values */
  precision_at_5?: number;
  precision_at_10?: number;
  precision_at_20?: number;
  /** NDCG at various K values */
  ndcg?: number;
  ndcg_at_5?: number;
  ndcg_at_10?: number;
  ndcg_at_20?: number;
  /** Hit rate (binary: 0 or 1) */
  hit_rate?: number;
  /** Context precision */
  context_precision?: number;
  /** Context recall */
  context_recall?: number;
  /** Faithfulness score (LLM judge) */
  faithfulness?: number;
  faithfulness_explanation?: string;
  /** Custom metrics */
  [key: string]: unknown;
}

/**
 * Aggregated metrics for an evaluation run
 */
export interface EvalRunMetrics {
  /** Total number of cases evaluated */
  total_cases: number;
  /** Number of cases with expected IDs */
  cases_with_labels: number;
  /** Average MRR */
  avg_mrr?: number;
  /** Average Recall@K */
  avg_recall_at_5?: number;
  avg_recall_at_10?: number;
  avg_recall_at_20?: number;
  /** Average Precision@K */
  avg_precision_at_5?: number;
  avg_precision_at_10?: number;
  avg_precision_at_20?: number;
  /** Average NDCG */
  avg_ndcg?: number;
  avg_ndcg_at_5?: number;
  avg_ndcg_at_10?: number;
  avg_ndcg_at_20?: number;
  /** Hit rate */
  avg_hit_rate?: number;
  /** Context metrics */
  avg_context_precision?: number;
  avg_context_recall?: number;
  /** Faithfulness */
  avg_faithfulness?: number;
  /** Percentile metrics for distribution analysis */
  p50_mrr?: number;
  p90_mrr?: number;
  p99_mrr?: number;
  /** Standard deviations */
  std_mrr?: number;
  std_ndcg?: number;
}

// ============================================
// Dataset Types
// ============================================

/**
 * Evaluation dataset
 */
export interface EvalDataset {
  id: string;
  userId: string;
  name: string;
  description?: string;
  /** Source of the dataset */
  source?: 'manual' | 'traffic_conversion' | 'import' | 'generated';
  /** Number of cases in the dataset */
  caseCount?: number;
  /** Dataset metadata */
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Single evaluation case (query with expected results)
 */
export interface EvalCase {
  id: string;
  datasetId: string;
  userId: string;
  /** The search query */
  queryText: string;
  /** Expected document/chunk IDs in order of relevance */
  expectedIds?: string[];
  /** Graded relevance scores (0-3 or 0-1) for each expected ID */
  relevanceScores?: number[];
  /** Expected answer text (for answer evaluation) */
  expectedAnswer?: string;
  /** Additional metadata */
  metadata?: {
    /** Source trace ID if from traffic conversion */
    sourceTraceId?: string;
    /** Collection ID for targeted evaluation */
    collectionId?: string;
    /** Custom tags */
    tags?: string[];
    [key: string]: unknown;
  };
  createdAt: string;
}

/**
 * Input for creating a new evaluation case
 */
export interface EvalCaseInput {
  /** The search query */
  query: string;
  /** Expected document/chunk IDs in order of relevance */
  expected_ids?: string[];
  /** Graded relevance scores for each expected ID */
  relevance_scores?: number[];
  /** Expected answer text */
  expected_answer?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new dataset with cases
 */
export interface CreateDatasetInput {
  name: string;
  description?: string;
  /** Evaluation cases to include */
  cases?: EvalCaseInput[];
  /** Source of the dataset */
  source?: 'manual' | 'import' | 'generated';
  metadata?: Record<string, unknown>;
}

// ============================================
// Run Types
// ============================================

/**
 * Evaluation run status
 */
export type EvalRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

/**
 * Configuration for an evaluation run
 */
export interface EvalRunConfig {
  /** Plan to use for retrieval */
  plan: string;
  /** Collection ID to search */
  collectionId: string;
  /** Enable autopilot mode */
  autopilot?: boolean;
  /** Override retrieval config */
  override?: Record<string, unknown>;
  /** Metrics to compute */
  metrics?: MetricType[];
  /** K values for @K metrics */
  kValues?: KValue[];
  /** Enable faithfulness scoring (LLM judge) */
  enableFaithfulness?: boolean;
  /** Model for faithfulness scoring */
  faithfulnessModel?: 'haiku' | 'sonnet';
  /** Maximum cases to evaluate */
  limitCases?: number;
  /** Custom answer generator for faithfulness */
  answerGeneratorEndpoint?: string;
}

/**
 * Evaluation run
 */
export interface EvalRun {
  id: string;
  userId: string;
  datasetId: string;
  status: EvalRunStatus;
  config: EvalRunConfig;
  startedAt: string;
  finishedAt?: string;
  /** Summary metrics for the run */
  summaryMetrics?: EvalRunMetrics;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Result for a single case in a run
 */
export interface EvalCaseResult {
  id: string;
  runId: string;
  caseId: string;
  /** Retrieved chunk IDs in order */
  retrievedIds: string[];
  /** Computed metrics for this case */
  metrics: EvalCaseMetrics;
  /** Debug information */
  debug?: {
    /** Retrieval config used */
    config?: Record<string, unknown>;
    /** Trace information */
    trace?: Record<string, unknown>;
    /** Latency in milliseconds */
    latencyMs?: number;
  };
  createdAt: string;
}

// ============================================
// Report Types
// ============================================

/**
 * Report format options
 */
export type ReportFormat = 'json' | 'csv' | 'markdown' | 'html';

/**
 * Report configuration
 */
export interface ReportConfig {
  /** Report format */
  format: ReportFormat;
  /** Include individual case results */
  includeCases?: boolean;
  /** Include debug information */
  includeDebug?: boolean;
  /** Include percentile analysis */
  includePercentiles?: boolean;
  /** Include comparison with baseline run */
  baselineRunId?: string;
  /** Custom title for the report */
  title?: string;
}

/**
 * Generated report
 */
export interface EvalReport {
  /** Report ID */
  id: string;
  /** Run ID */
  runId: string;
  /** Report format */
  format: ReportFormat;
  /** Report content (string or object based on format) */
  content: string | Record<string, unknown>;
  /** Generated at timestamp */
  generatedAt: string;
  /** Comparison delta if baseline provided */
  delta?: {
    baselineRunId: string;
    metrics: Record<string, number>;
  };
}

/**
 * Metric comparison result
 */
export interface MetricComparison {
  metricKey: string;
  baselineValue: number;
  candidateValue: number;
  delta: number;
  deltaPercent: number;
  isImprovement: boolean;
  isRegression: boolean;
}

// ============================================
// API Response Types
// ============================================

/**
 * Dataset list response
 */
export interface DatasetListResponse {
  success: boolean;
  datasets: EvalDataset[];
  total?: number;
}

/**
 * Dataset create response
 */
export interface DatasetCreateResponse {
  success: boolean;
  dataset: EvalDataset;
  casesCreated?: number;
}

/**
 * Run list response
 */
export interface RunListResponse {
  success: boolean;
  runs: EvalRun[];
  total?: number;
}

/**
 * Run start response
 */
export interface RunStartResponse {
  success: boolean;
  runId: string;
  status: EvalRunStatus;
}

/**
 * Run result response
 */
export interface RunResultResponse {
  success: boolean;
  run: EvalRun;
  results?: EvalCaseResult[];
  report?: EvalReport;
}

// ============================================
// Utility Types
// ============================================

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Sort options
 */
export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Filter options for datasets
 */
export interface DatasetFilterOptions {
  source?: string;
  search?: string;
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Filter options for runs
 */
export interface RunFilterOptions {
  datasetId?: string;
  status?: EvalRunStatus;
  startedAfter?: string;
  startedBefore?: string;
}
