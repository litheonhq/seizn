/**
 * Hybrid Orchestrator Types
 *
 * Types for multi-strategy retrieval with intelligent result fusion.
 */

import type { VectorSearchResult } from '@/lib/summer/types';

// ============================================
// Strategy Types
// ============================================

/**
 * Available retrieval strategy types
 */
export type StrategyType = 'vector' | 'keyword' | 'multi_query';

/**
 * Base strategy configuration
 */
export interface BaseStrategyConfig {
  type: StrategyType;
  /** Relative weight for fusion (0.0 to 1.0) */
  weight: number;
  /** Strategy-specific parameters */
  params: Record<string, unknown>;
}

/**
 * Vector search strategy parameters
 */
export interface VectorStrategyParams {
  [key: string]: unknown;
  /** Number of results to retrieve */
  top_k: number;
  /** Minimum similarity threshold (0.0 to 1.0) */
  threshold?: number;
  /** HNSW search ef parameter */
  search_ef?: number;
}

/**
 * Keyword search strategy parameters (BM25)
 */
export interface KeywordStrategyParams {
  [key: string]: unknown;
  /** Number of results to retrieve */
  top_k: number;
  /** Boost terms with multipliers */
  boost_terms?: Record<string, number>;
}

/**
 * Multi-query expansion strategy parameters
 */
export interface MultiQueryStrategyParams {
  [key: string]: unknown;
  /** Number of results per expanded query */
  top_k: number;
  /** Number of query variations to generate */
  num_expansions: number;
  /** Expansion method */
  expansion_method: 'llm' | 'synonyms' | 'embedding_nn';
  /** Use cached expansions if available */
  use_cache?: boolean;
}

/**
 * Strategy configuration with typed params
 */
export interface VectorStrategyConfig extends BaseStrategyConfig {
  type: 'vector';
  params: VectorStrategyParams;
}

export interface KeywordStrategyConfig extends BaseStrategyConfig {
  type: 'keyword';
  params: KeywordStrategyParams;
}

export interface MultiQueryStrategyConfig extends BaseStrategyConfig {
  type: 'multi_query';
  params: MultiQueryStrategyParams;
}

export type StrategyConfig =
  | VectorStrategyConfig
  | KeywordStrategyConfig
  | MultiQueryStrategyConfig;

// ============================================
// Fusion Types
// ============================================

/**
 * Available fusion methods
 */
export type FusionMethod = 'rrf' | 'weighted_sum' | 'learned' | 'cascade';

/**
 * Result from a single strategy execution
 */
export interface StrategyResult {
  /** Chunk/document ID */
  id: string;
  /** Strategy-specific score */
  score: number;
  /** Rank within this strategy's results (1-indexed) */
  rank: number;
  /** Original search result data */
  data?: VectorSearchResult;
}

/**
 * Result after fusion across strategies
 */
export interface FusedResult {
  /** Chunk/document ID */
  id: string;
  /** Final fused score */
  finalScore: number;
  /** Rank in final results (1-indexed) */
  rank: number;
  /** Which strategies contributed to this result */
  sourceStrategies: StrategyType[];
  /** Per-strategy scores for explainability */
  strategyScores: Record<StrategyType, number>;
  /** Original search result data */
  data?: VectorSearchResult;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Hybrid retrieval configuration
 */
export interface HybridConfig {
  id: string;
  userId: string;
  collectionId?: string;
  name: string;

  /** Strategy configurations */
  strategies: StrategyConfig[];

  /** Fusion method */
  fusionMethod: FusionMethod;

  /** RRF k parameter (for RRF fusion) */
  rrfK: number;

  /** Cascade threshold (for cascade fusion) */
  cascadeThreshold: number;

  /** Learned weights from feedback */
  learnedWeights?: Record<string, number>;

  /** Whether this config is active */
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row format for hybrid_configs
 */
export interface HybridConfigRow {
  id: string;
  user_id: string;
  collection_id: string | null;
  name: string;
  strategies: StrategyConfig[];
  fusion_method: FusionMethod;
  rrf_k: number;
  cascade_threshold: number;
  learned_weights: Record<string, number> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Execution Types
// ============================================

/**
 * Options for hybrid retrieval
 */
export interface HybridRetrievalOptions {
  /** Override strategies from config */
  strategies?: StrategyConfig[];
  /** Override fusion method */
  fusionMethod?: FusionMethod;
  /** Maximum results to return after fusion */
  topK?: number;
  /** Include per-strategy results in response */
  includeStrategyResults?: boolean;
  /** Trace ID for logging */
  traceId?: string;
}

/**
 * Input for hybrid retrieval
 */
export interface HybridRetrievalInput {
  /** User ID */
  userId: string;
  /** Collection ID */
  collectionId: string;
  /** Query text */
  query: string;
  /** Pre-computed query embedding (optional, will be computed if not provided) */
  queryEmbedding?: number[];
}

/**
 * Strategy execution result with timing
 */
export interface StrategyExecutionResult {
  strategyType: StrategyType;
  results: StrategyResult[];
  latencyMs: number;
  error?: string;
}

/**
 * Complete hybrid retrieval result
 */
export interface HybridRetrievalResult {
  /** Fused results */
  results: FusedResult[];

  /** Per-strategy results (if requested) */
  strategyResults?: Map<StrategyType, StrategyResult[]>;

  /** Configuration used */
  config: HybridConfig;

  /** Fusion method used */
  fusionMethod: FusionMethod;

  /** Performance metrics */
  metrics: {
    totalLatencyMs: number;
    strategyLatencies: Record<StrategyType, number>;
    fusionLatencyMs: number;
  };

  /** Trace ID for debugging */
  traceId?: string;
}

// ============================================
// Feedback Types
// ============================================

/**
 * User feedback for learning
 */
export interface HybridFeedback {
  /** Result ID from hybrid_results table */
  resultId: string;
  /** User satisfaction score (1-5) */
  score?: number;
  /** IDs of results that were clicked */
  clickedResultIds?: string[];
}

// ============================================
// Multi-Query Cache Types
// ============================================

/**
 * Cached query expansion
 */
export interface QueryExpansionCache {
  originalQuery: string;
  expandedQueries: string[];
  expansionMethod: 'llm' | 'synonyms' | 'embedding_nn';
  hitCount: number;
  expiresAt: Date;
}

// ============================================
// Strategy Stats Types
// ============================================

/**
 * Aggregated strategy performance stats
 */
export interface StrategyStats {
  strategyType: StrategyType;
  collectionId?: string;
  totalQueries: number;
  avgLatencyMs: number;
  avgResultCount: number;
  avgFeedbackScore?: number;
  avgClickPosition?: number;
  periodStart: Date;
  periodEnd: Date;
}

// ============================================
// Utility Types
// ============================================

/**
 * Create hybrid config input
 */
export interface CreateHybridConfigInput {
  userId: string;
  collectionId?: string;
  name: string;
  strategies: StrategyConfig[];
  fusionMethod?: FusionMethod;
  rrfK?: number;
  cascadeThreshold?: number;
}

/**
 * Update hybrid config input
 */
export interface UpdateHybridConfigInput {
  id: string;
  userId: string;
  name?: string;
  strategies?: StrategyConfig[];
  fusionMethod?: FusionMethod;
  rrfK?: number;
  cascadeThreshold?: number;
  isActive?: boolean;
}

/**
 * Type guard for vector strategy
 */
export function isVectorStrategy(
  config: StrategyConfig
): config is VectorStrategyConfig {
  return config.type === 'vector';
}

/**
 * Type guard for keyword strategy
 */
export function isKeywordStrategy(
  config: StrategyConfig
): config is KeywordStrategyConfig {
  return config.type === 'keyword';
}

/**
 * Type guard for multi-query strategy
 */
export function isMultiQueryStrategy(
  config: StrategyConfig
): config is MultiQueryStrategyConfig {
  return config.type === 'multi_query';
}

/**
 * Convert DB row to HybridConfig
 */
export function rowToHybridConfig(row: HybridConfigRow): HybridConfig {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id ?? undefined,
    name: row.name,
    strategies: row.strategies,
    fusionMethod: row.fusion_method,
    rrfK: row.rrf_k,
    cascadeThreshold: row.cascade_threshold,
    learnedWeights: row.learned_weights ?? undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_HYBRID_CONFIG = {
  fusionMethod: 'rrf' as FusionMethod,
  rrfK: 60,
  cascadeThreshold: 0.8,
  strategies: [
    {
      type: 'vector' as const,
      weight: 0.7,
      params: { top_k: 20, threshold: 0.5 },
    },
    {
      type: 'keyword' as const,
      weight: 0.3,
      params: { top_k: 20 },
    },
  ],
};
