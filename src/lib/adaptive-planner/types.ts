/**
 * Seizn Adaptive Planner - Type Definitions
 *
 * Dynamic query planning based on query characteristics,
 * collection properties, and historical performance.
 */

// ============================================
// Query Intent Types
// ============================================

/**
 * Query intent classification
 * - factual: Looking for specific facts or data
 * - exploratory: Open-ended research or discovery
 * - comparison: Comparing multiple items or concepts
 * - procedural: How-to or step-by-step instructions
 * - opinion: Seeking opinions or perspectives
 */
export type QueryIntent =
  | 'factual'
  | 'exploratory'
  | 'comparison'
  | 'procedural'
  | 'opinion';

/**
 * Query complexity classification
 */
export type QueryComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Retrieval mode for the plan
 */
export type RetrievalMode = 'vector' | 'keyword' | 'hybrid';

// ============================================
// Query Features
// ============================================

/**
 * Extracted features from a query for plan matching
 */
export interface QueryFeatures {
  /** Total character length */
  length: number;
  /** Word count */
  wordCount: number;
  /** Whether named entities were detected */
  hasEntities: boolean;
  /** List of detected entities */
  entities: string[];
  /** Detected query intent */
  intent: QueryIntent;
  /** Assessed complexity level */
  complexity: QueryComplexity;
  /** Contains temporal references (dates, times, etc.) */
  temporalRefs: boolean;
  /** Contains quantitative references (numbers, percentages, etc.) */
  quantitativeRefs: boolean;
  /** Extracted keywords */
  keywords: string[];
  /** Question type if detected */
  questionType?: 'what' | 'how' | 'why' | 'when' | 'where' | 'who' | 'which' | 'other';
  /** Whether query seems to be a follow-up */
  isFollowUp: boolean;
  /** Language code if detected */
  language?: string;
}

// ============================================
// Plan Configuration
// ============================================

/**
 * Configuration for a query plan's retrieval behavior
 */
export interface PlanConfig {
  /** Number of results to retrieve */
  topK: number;
  /** Whether reranking is enabled */
  rerankEnabled: boolean;
  /** Number of results to rerank */
  rerankTopN: number;
  /** Alpha value for hybrid search (0=keyword, 1=vector) */
  hybridAlpha: number;
  /** Similarity threshold for filtering results */
  threshold: number;
  /** Retrieval mode */
  mode: RetrievalMode;
  /** Optional metadata filters */
  filters?: Record<string, unknown>;
  /** Maximum context window (tokens) */
  maxContextTokens?: number;
  /** Whether to enable compression */
  compressionEnabled?: boolean;
  /** Compression ratio target */
  compressionRatio?: number;
}

// ============================================
// Query Plan
// ============================================

/**
 * A query plan defining retrieval strategy
 */
export interface QueryPlan {
  id: string;
  userId: string;
  collectionId?: string;

  // Plan configuration
  planName: string;
  planConfig: PlanConfig;

  // Matching criteria
  queryPatterns: string[];
  queryIntents: QueryIntent[];
  minQueryLength?: number;
  maxQueryLength?: number;

  // Performance metrics
  avgLatencyMs: number;
  avgRelevanceScore: number;
  successRate: number;
  usageCount: number;

  // Learning
  isLearned: boolean;
  learnedFromTraces: string[];

  // Priority and status
  priority: number;
  isActive: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Default query plan (system-wide)
 */
export interface DefaultQueryPlan {
  id: string;
  planName: string;
  description?: string;
  planConfig: PlanConfig;
  queryIntents?: QueryIntent[];
  minQueryLength?: number;
  maxQueryLength?: number;
  complexity?: QueryComplexity;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

// ============================================
// Plan Selection
// ============================================

/**
 * Record of a plan selection and its outcome
 */
export interface PlanSelection {
  id: string;
  traceId?: string;
  planId?: string;

  // Selection context
  queryText: string;
  detectedIntent?: QueryIntent;
  queryFeatures?: QueryFeatures;

  // Outcome
  latencyMs?: number;
  relevanceScore?: number;
  userSatisfied?: boolean;

  createdAt: string;
}

/**
 * Result of plan matching
 */
export interface PlanMatch {
  /** Matched plan */
  plan: QueryPlan | DefaultQueryPlan;
  /** Match confidence score (0-1) */
  matchScore: number;
  /** Reasons for the match */
  matchReasons: string[];
  /** Whether this is a default plan */
  isDefault: boolean;
}

// ============================================
// Plan Performance
// ============================================

/**
 * Performance summary for a plan
 */
export interface PlanPerformanceSummary {
  planId: string;
  planName: string;
  totalUses: number;
  avgLatencyMs: number;
  avgRelevance: number;
  successRate: number;
  intentDistribution: Record<QueryIntent, number>;
}

/**
 * Outcome of a plan selection to be recorded
 */
export interface PlanOutcome {
  planId?: string;
  traceId?: string;
  queryText: string;
  detectedIntent?: QueryIntent;
  queryFeatures?: QueryFeatures;
  latencyMs?: number;
  relevanceScore?: number;
  userSatisfied?: boolean;
}

// ============================================
// Optimization
// ============================================

/**
 * Result of plan optimization
 */
export interface OptimizationResult {
  success: boolean;
  /** Number of new plans created */
  plansCreated: number;
  /** Number of plans updated */
  plansUpdated: number;
  /** Number of plans deactivated */
  plansDeactivated: number;
  /** New plans that were learned */
  newPlans: QueryPlan[];
  /** Recommendations for manual review */
  recommendations: OptimizationRecommendation[];
}

/**
 * A recommendation from optimization analysis
 */
export interface OptimizationRecommendation {
  type: 'create' | 'update' | 'deactivate' | 'merge';
  priority: 'high' | 'medium' | 'low';
  description: string;
  affectedPlanIds?: string[];
  suggestedConfig?: Partial<PlanConfig>;
  reason: string;
  expectedImprovement?: string;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Request to create a new plan
 */
export interface CreatePlanRequest {
  planName: string;
  collectionId?: string;
  planConfig: PlanConfig;
  queryPatterns?: string[];
  queryIntents?: QueryIntent[];
  minQueryLength?: number;
  maxQueryLength?: number;
  priority?: number;
}

/**
 * Request to update an existing plan
 */
export interface UpdatePlanRequest {
  planName?: string;
  planConfig?: Partial<PlanConfig>;
  queryPatterns?: string[];
  queryIntents?: QueryIntent[];
  minQueryLength?: number;
  maxQueryLength?: number;
  priority?: number;
  isActive?: boolean;
}

/**
 * Request to select a plan for a query
 */
export interface SelectPlanRequest {
  query: string;
  collectionId?: string;
  /** Skip user plans and use defaults only */
  defaultsOnly?: boolean;
}

/**
 * Response from plan selection
 */
export interface SelectPlanResponse {
  success: boolean;
  plan: QueryPlan | DefaultQueryPlan;
  matchScore: number;
  matchReasons: string[];
  isDefault: boolean;
  queryFeatures: QueryFeatures;
}

/**
 * Request to run optimization
 */
export interface OptimizePlanRequest {
  collectionId?: string;
  /** Minimum samples required for optimization */
  minSamples?: number;
  /** Minimum success rate to consider for learning */
  minSuccessRate?: number;
  /** Whether to auto-apply recommendations */
  autoApply?: boolean;
}

/**
 * Response from plan listing
 */
export interface ListPlansResponse {
  success: boolean;
  plans: QueryPlan[];
  defaults?: DefaultQueryPlan[];
  total: number;
}

/**
 * Response from plan performance endpoint
 */
export interface PlanPerformanceResponse {
  success: boolean;
  summaries: PlanPerformanceSummary[];
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

// ============================================
// Database Types (for Supabase)
// ============================================

/**
 * Database row type for query_plans table
 */
export interface QueryPlanRow {
  id: string;
  user_id: string;
  collection_id: string | null;
  plan_name: string;
  plan_config: PlanConfig;
  query_patterns: string[] | null;
  query_intents: string[] | null;
  min_query_length: number | null;
  max_query_length: number | null;
  avg_latency_ms: number;
  avg_relevance_score: number;
  success_rate: number;
  usage_count: number;
  is_learned: boolean;
  learned_from_traces: string[] | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for plan_selections table
 */
export interface PlanSelectionRow {
  id: string;
  trace_id: string | null;
  plan_id: string | null;
  query_text: string;
  detected_intent: string | null;
  query_features: QueryFeatures | null;
  latency_ms: number | null;
  relevance_score: number | null;
  user_satisfied: boolean | null;
  created_at: string;
}

/**
 * Database row type for default_query_plans table
 */
export interface DefaultQueryPlanRow {
  id: string;
  plan_name: string;
  description: string | null;
  plan_config: PlanConfig;
  query_intents: string[] | null;
  min_query_length: number | null;
  max_query_length: number | null;
  complexity: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

// ============================================
// Utility Types
// ============================================

/**
 * Convert database row to domain type
 */
export function rowToQueryPlan(row: QueryPlanRow): QueryPlan {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id ?? undefined,
    planName: row.plan_name,
    planConfig: row.plan_config,
    queryPatterns: row.query_patterns ?? [],
    queryIntents: (row.query_intents ?? []) as QueryIntent[],
    minQueryLength: row.min_query_length ?? undefined,
    maxQueryLength: row.max_query_length ?? undefined,
    avgLatencyMs: row.avg_latency_ms,
    avgRelevanceScore: row.avg_relevance_score,
    successRate: row.success_rate,
    usageCount: row.usage_count,
    isLearned: row.is_learned,
    learnedFromTraces: row.learned_from_traces ?? [],
    priority: row.priority,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to default plan type
 */
export function rowToDefaultPlan(row: DefaultQueryPlanRow): DefaultQueryPlan {
  return {
    id: row.id,
    planName: row.plan_name,
    description: row.description ?? undefined,
    planConfig: row.plan_config,
    queryIntents: (row.query_intents ?? []) as QueryIntent[],
    minQueryLength: row.min_query_length ?? undefined,
    maxQueryLength: row.max_query_length ?? undefined,
    complexity: row.complexity as QueryComplexity | undefined,
    priority: row.priority,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
