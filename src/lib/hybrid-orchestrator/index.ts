/**
 * Hybrid Orchestrator - Multi-Strategy Retrieval
 *
 * Combines vector, keyword, and multi-query strategies with intelligent fusion.
 *
 * @example
 * ```typescript
 * import { hybridRetrieve, getActiveConfig } from '@/lib/hybrid-orchestrator';
 *
 * // Get user's active config
 * const config = await getActiveConfig(userId, collectionId);
 *
 * // Execute hybrid retrieval
 * const result = await hybridRetrieve(
 *   { userId, collectionId, query: "How do I reset my password?" },
 *   config,
 *   { topK: 10, includeStrategyResults: true }
 * );
 *
 * console.log(result.results); // Fused results
 * console.log(result.metrics); // Performance metrics
 * ```
 */

// Main orchestrator
export {
  hybridRetrieve,
  getHybridConfig,
  getActiveConfig,
  createHybridConfig,
  updateHybridConfig,
  deleteHybridConfig,
  listHybridConfigs,
  compareStrategies,
} from './orchestrator';

// Types
export type {
  // Strategy types
  StrategyType,
  StrategyConfig,
  BaseStrategyConfig,
  VectorStrategyConfig,
  KeywordStrategyConfig,
  MultiQueryStrategyConfig,
  VectorStrategyParams,
  KeywordStrategyParams,
  MultiQueryStrategyParams,

  // Fusion types
  FusionMethod,
  StrategyResult,
  FusedResult,
  StrategyExecutionResult,

  // Config types
  HybridConfig,
  HybridConfigRow,
  CreateHybridConfigInput,
  UpdateHybridConfigInput,

  // Execution types
  HybridRetrievalInput,
  HybridRetrievalOptions,
  HybridRetrievalResult,

  // Other types
  HybridFeedback,
  QueryExpansionCache,
  StrategyStats,
} from './types';

// Type guards and utilities
export {
  isVectorStrategy,
  isKeywordStrategy,
  isMultiQueryStrategy,
  rowToHybridConfig,
  DEFAULT_HYBRID_CONFIG,
} from './types';

// Strategy implementations
export {
  vectorSearch,
  keywordSearch,
  multiQuerySearch,
  validateVectorParams,
  validateKeywordParams,
  validateMultiQueryParams,
  suggestBoostTermsForDomain,
  DEFAULT_VECTOR_PARAMS,
  DEFAULT_KEYWORD_PARAMS,
  DEFAULT_MULTI_QUERY_PARAMS,
} from './strategies';

// Fusion implementations
export {
  reciprocalRankFusion,
  weightedReciprocalRankFusion,
  weightedFusion,
  zScoreFusion,
  bordaCountFusion,
  cascadeFusion,
  lazyCascadeFusion,
  conditionalCascadeFusion,
  fallbackCascadeFusion,
  optimizeCascadeOrder,
  maxRRFScore,
  normalizeRRFScores,
  DEFAULT_RRF_K,
  DEFAULT_CASCADE_THRESHOLD,
} from './fusion';
