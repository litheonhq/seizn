/**
 * Hybrid Orchestrator
 *
 * Main orchestration logic for multi-strategy retrieval.
 * Combines vector, keyword, and multi-query strategies with intelligent fusion.
 */

import { createServerClient } from '@/lib/supabase';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import { getRerankerService, type RerankerModel } from '@/lib/reranker';
import { v4 as uuidv4 } from 'uuid';

import type {
  HybridConfig,
  HybridConfigRow,
  HybridRetrievalInput,
  HybridRetrievalOptions,
  HybridRetrievalResult,
  StrategyConfig,
  StrategyType,
  StrategyResult,
  StrategyExecutionResult,
  FusedResult,
  FusionMethod,
  CreateHybridConfigInput,
  UpdateHybridConfigInput,
} from './types';

import {
  rowToHybridConfig,
  DEFAULT_HYBRID_CONFIG,
  isVectorStrategy,
  isKeywordStrategy,
  isMultiQueryStrategy,
} from './types';

import {
  vectorSearch,
  keywordSearch,
  multiQuerySearch,
} from './strategies';

import {
  reciprocalRankFusion,
  weightedFusion,
  cascadeFusion,
  DEFAULT_RRF_K,
  DEFAULT_CASCADE_THRESHOLD,
} from './fusion';

// ============================================
// Main Orchestration
// ============================================

/**
 * Execute hybrid retrieval with multiple strategies
 *
 * @param input - Query input
 * @param config - Hybrid configuration
 * @param options - Optional overrides
 * @returns Hybrid retrieval result with fused results
 */
export async function hybridRetrieve(
  input: HybridRetrievalInput,
  config: HybridConfig,
  options?: HybridRetrievalOptions
): Promise<HybridRetrievalResult> {
  const startTime = performance.now();
  const traceId = options?.traceId ?? uuidv4();

  // Merge config with options
  const strategies = options?.strategies ?? config.strategies;
  const fusionMethod = options?.fusionMethod ?? config.fusionMethod;
  const topK = options?.topK ?? 20;

  // Ensure query embedding is available
  let queryEmbedding = input.queryEmbedding;
  if (!queryEmbedding) {
    const embeddingProvider = getEmbeddingProvider();
    const embeddings = await embeddingProvider.embed([input.query], 'query');
    queryEmbedding = embeddings[0];
  }

  // Execute strategies in parallel
  const strategyPromises = strategies.map((strategy) =>
    executeStrategy(
      strategy,
      input.query,
      queryEmbedding!,
      input.collectionId,
      input.userId
    )
  );

  const strategyExecutions = await Promise.all(strategyPromises);

  // Collect results and latencies
  const strategyResults = new Map<StrategyType, StrategyResult[]>();
  const strategyLatencies: Record<StrategyType, number> = {} as Record<StrategyType, number>;

  for (const execution of strategyExecutions) {
    strategyResults.set(execution.strategyType, execution.results);
    strategyLatencies[execution.strategyType] = execution.latencyMs;

    if (execution.error) {
      console.warn(
        `Strategy ${execution.strategyType} failed: ${execution.error}`
      );
    }
  }

  // Apply fusion
  const fusionStartTime = performance.now();
  const fusedResults = applyFusion(
    strategyResults,
    strategies,
    fusionMethod,
    config,
    topK
  );
  const fusionLatencyMs = performance.now() - fusionStartTime;

  // Optional second-pass reranking over fused candidates
  const rerankStartTime = performance.now();
  const reranked = await rerankFusedResults(input.query, fusedResults, options);
  const rerankLatencyMs = reranked.applied
    ? performance.now() - rerankStartTime
    : undefined;
  const finalResults = reranked.results;

  const totalLatencyMs = performance.now() - startTime;

  // Record result for analytics
  await recordHybridResult(
    config,
    input,
    strategyResults,
    finalResults,
    fusionMethod,
    totalLatencyMs,
    strategyLatencies,
    traceId
  );

  return {
    results: finalResults,
    strategyResults: options?.includeStrategyResults
      ? strategyResults
      : undefined,
    config,
    fusionMethod,
    metrics: {
      totalLatencyMs,
      strategyLatencies,
      fusionLatencyMs,
      rerankLatencyMs,
    },
    traceId,
  };
}

export async function rerankFusedResults(
  query: string,
  fusedResults: FusedResult[],
  options?: HybridRetrievalOptions
): Promise<{ results: FusedResult[]; applied: boolean }> {
  if (!options?.rerank || fusedResults.length < 2) {
    return { results: fusedResults, applied: false };
  }

  const rerankTopN = Math.min(Math.max(options.rerankTopN ?? 30, 2), fusedResults.length);
  const candidates = fusedResults.slice(0, rerankTopN);

  const documents = candidates.map((candidate) => ({
    id: candidate.id,
    content: candidate.data?.text || '',
    originalScore: candidate.finalScore,
  }));

  if (documents.every((document) => document.content.trim().length === 0)) {
    return { results: fusedResults, applied: false };
  }

  try {
    const reranker = getRerankerService(
      options.rerankModel
        ? {
            model: options.rerankModel as RerankerModel,
          }
        : undefined
    );

    const rerankResult = await reranker.rerank({
      query,
      documents,
      config: {
        maxCandidates: rerankTopN,
        threshold: options.rerankThreshold ?? 0.2,
      },
    });

    if (rerankResult.documents.length === 0) {
      return { results: fusedResults, applied: false };
    }

    const rerankScoreById = new Map(
      rerankResult.documents.map((document) => [document.id, document.rerankScore])
    );

    const rerankedTop = candidates
      .map((candidate) => {
        const rerankScore = rerankScoreById.get(candidate.id);
        if (rerankScore === undefined) {
          return candidate;
        }

        return {
          ...candidate,
          finalScore: candidate.finalScore * 0.45 + rerankScore * 0.55,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    const tail = fusedResults.slice(rerankTopN).map((item, index) => ({
      ...item,
      rank: rerankedTop.length + index + 1,
    }));

    return {
      results: [...rerankedTop, ...tail],
      applied: true,
    };
  } catch (error) {
    console.warn('Hybrid rerank step failed; using fused results only', error);
    return { results: fusedResults, applied: false };
  }
}

/**
 * Execute a single strategy
 */
async function executeStrategy(
  strategy: StrategyConfig,
  query: string,
  queryEmbedding: number[],
  collectionId: string,
  userId: string
): Promise<StrategyExecutionResult> {
  if (isVectorStrategy(strategy)) {
    return vectorSearch(
      query,
      queryEmbedding,
      collectionId,
      userId,
      strategy.params
    );
  }

  if (isKeywordStrategy(strategy)) {
    return keywordSearch(query, collectionId, userId, strategy.params);
  }

  if (isMultiQueryStrategy(strategy)) {
    return multiQuerySearch(
      query,
      queryEmbedding,
      collectionId,
      userId,
      strategy.params
    );
  }

  // Unknown strategy type (should never reach here)
  const unknownStrategy = strategy as StrategyConfig;
  return {
    strategyType: unknownStrategy.type,
    results: [],
    latencyMs: 0,
    error: `Unknown strategy type: ${unknownStrategy.type}`,
  };
}

/**
 * Apply fusion method to strategy results
 */
function applyFusion(
  strategyResults: Map<StrategyType, StrategyResult[]>,
  strategies: StrategyConfig[],
  fusionMethod: FusionMethod,
  config: HybridConfig,
  topK: number
): FusedResult[] {
  // Build weights map
  const weights: Record<StrategyType, number> = {} as Record<StrategyType, number>;
  for (const strategy of strategies) {
    weights[strategy.type] = strategy.weight;
  }

  switch (fusionMethod) {
    case 'rrf':
      return reciprocalRankFusion(
        strategyResults,
        config.rrfK ?? DEFAULT_RRF_K,
        topK
      );

    case 'weighted_sum':
      return weightedFusion(strategyResults, weights, topK);

    case 'learned':
      // Use learned weights if available, fallback to configured weights
      const learnedWeights = config.learnedWeights ?? weights;
      return weightedFusion(
        strategyResults,
        learnedWeights as Record<StrategyType, number>,
        topK
      );

    case 'cascade':
      const strategyOrder = strategies.map((s) => s.type);
      return cascadeFusion(
        strategyResults,
        strategyOrder,
        config.cascadeThreshold ?? DEFAULT_CASCADE_THRESHOLD,
        topK
      );

    default:
      // Default to RRF
      return reciprocalRankFusion(strategyResults, DEFAULT_RRF_K, topK);
  }
}

/**
 * Record hybrid result for analytics and learning
 */
async function recordHybridResult(
  config: HybridConfig,
  input: HybridRetrievalInput,
  strategyResults: Map<StrategyType, StrategyResult[]>,
  fusedResults: FusedResult[],
  fusionMethod: FusionMethod,
  totalLatencyMs: number,
  strategyLatencies: Record<StrategyType, number>,
  traceId: string
): Promise<void> {
  try {
    const supabase = createServerClient();

    // Convert Map to plain object for JSONB storage
    const strategyResultsObj: Record<string, StrategyResult[]> = {};
    for (const [key, value] of strategyResults) {
      strategyResultsObj[key] = value.map((r) => ({
        id: r.id,
        score: r.score,
        rank: r.rank,
        // Don't store full data to keep storage small
      }));
    }

    // Store simplified fused results
    const fusedResultsObj = fusedResults.slice(0, 50).map((r) => ({
      id: r.id,
      final_score: r.finalScore,
      rank: r.rank,
      source_strategies: r.sourceStrategies,
    }));

    // Hash query for deduplication
    const queryHash = hashQuery(input.query);

    await supabase.from('hybrid_results').insert({
      config_id: config.id,
      user_id: input.userId,
      trace_id: traceId,
      query_hash: queryHash,
      collection_id: input.collectionId,
      strategy_results: strategyResultsObj,
      fused_results: fusedResultsObj,
      fusion_method: fusionMethod,
      total_latency_ms: totalLatencyMs,
      strategy_latencies: strategyLatencies,
    });
  } catch (error) {
    // Don't fail the main request on analytics error
    console.error('Failed to record hybrid result:', error);
  }
}

// ============================================
// Configuration Management
// ============================================

/**
 * Get hybrid config by ID
 */
export async function getHybridConfig(
  configId: string,
  userId: string
): Promise<HybridConfig | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('hybrid_configs')
    .select('*')
    .eq('id', configId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToHybridConfig(data as HybridConfigRow);
}

/**
 * Get active config for a collection (or default)
 */
export async function getActiveConfig(
  userId: string,
  collectionId?: string
): Promise<HybridConfig> {
  const supabase = createServerClient();

  // Try collection-specific config first
  if (collectionId) {
    const { data } = await supabase
      .from('hybrid_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('collection_id', collectionId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      return rowToHybridConfig(data as HybridConfigRow);
    }
  }

  // Try user's default config
  const { data } = await supabase
    .from('hybrid_configs')
    .select('*')
    .eq('user_id', userId)
    .is('collection_id', null)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (data) {
    return rowToHybridConfig(data as HybridConfigRow);
  }

  // Create default config
  return createDefaultConfig(userId);
}

/**
 * Create a new hybrid config
 */
export async function createHybridConfig(
  input: CreateHybridConfigInput
): Promise<HybridConfig> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('hybrid_configs')
    .insert({
      user_id: input.userId,
      collection_id: input.collectionId ?? null,
      name: input.name,
      strategies: input.strategies,
      fusion_method: input.fusionMethod ?? DEFAULT_HYBRID_CONFIG.fusionMethod,
      rrf_k: input.rrfK ?? DEFAULT_HYBRID_CONFIG.rrfK,
      cascade_threshold:
        input.cascadeThreshold ?? DEFAULT_HYBRID_CONFIG.cascadeThreshold,
      is_active: true,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create hybrid config: ${error?.message}`);
  }

  return rowToHybridConfig(data as HybridConfigRow);
}

/**
 * Update an existing hybrid config
 */
export async function updateHybridConfig(
  input: UpdateHybridConfigInput
): Promise<HybridConfig> {
  const supabase = createServerClient();

  const updates: Partial<HybridConfigRow> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.strategies !== undefined) updates.strategies = input.strategies;
  if (input.fusionMethod !== undefined) updates.fusion_method = input.fusionMethod;
  if (input.rrfK !== undefined) updates.rrf_k = input.rrfK;
  if (input.cascadeThreshold !== undefined)
    updates.cascade_threshold = input.cascadeThreshold;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const { data, error } = await supabase
    .from('hybrid_configs')
    .update(updates)
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update hybrid config: ${error?.message}`);
  }

  return rowToHybridConfig(data as HybridConfigRow);
}

/**
 * Delete a hybrid config
 */
export async function deleteHybridConfig(
  configId: string,
  userId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('hybrid_configs')
    .delete()
    .eq('id', configId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete hybrid config: ${error.message}`);
  }
}

/**
 * List all hybrid configs for a user
 */
export async function listHybridConfigs(
  userId: string,
  collectionId?: string
): Promise<HybridConfig[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('hybrid_configs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (collectionId !== undefined) {
    query = query.eq('collection_id', collectionId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list hybrid configs: ${error.message}`);
  }

  return (data ?? []).map((row) => rowToHybridConfig(row as HybridConfigRow));
}

/**
 * Create default config for a user
 */
async function createDefaultConfig(userId: string): Promise<HybridConfig> {
  return createHybridConfig({
    userId,
    name: 'default',
    strategies: DEFAULT_HYBRID_CONFIG.strategies,
    fusionMethod: DEFAULT_HYBRID_CONFIG.fusionMethod,
    rrfK: DEFAULT_HYBRID_CONFIG.rrfK,
    cascadeThreshold: DEFAULT_HYBRID_CONFIG.cascadeThreshold,
  });
}

// ============================================
// Strategy Comparison
// ============================================

/**
 * Compare strategies side-by-side
 *
 * Useful for A/B testing and strategy tuning.
 */
export async function compareStrategies(
  input: HybridRetrievalInput,
  strategies: StrategyConfig[]
): Promise<{
  strategyResults: Map<StrategyType, StrategyResult[]>;
  strategyLatencies: Record<StrategyType, number>;
  overlapAnalysis: {
    totalUnique: number;
    overlapping: number;
    overlapMatrix: Record<StrategyType, Record<StrategyType, number>>;
  };
}> {
  // Ensure embedding
  let queryEmbedding = input.queryEmbedding;
  if (!queryEmbedding) {
    const embeddingProvider = getEmbeddingProvider();
    const embeddings = await embeddingProvider.embed([input.query], 'query');
    queryEmbedding = embeddings[0];
  }

  // Execute strategies
  const strategyPromises = strategies.map((strategy) =>
    executeStrategy(
      strategy,
      input.query,
      queryEmbedding!,
      input.collectionId,
      input.userId
    )
  );

  const strategyExecutions = await Promise.all(strategyPromises);

  const strategyResults = new Map<StrategyType, StrategyResult[]>();
  const strategyLatencies: Record<StrategyType, number> = {} as Record<StrategyType, number>;

  for (const execution of strategyExecutions) {
    strategyResults.set(execution.strategyType, execution.results);
    strategyLatencies[execution.strategyType] = execution.latencyMs;
  }

  // Analyze overlap
  const allIds = new Set<string>();
  const strategyIds = new Map<StrategyType, Set<string>>();

  for (const [type, results] of strategyResults) {
    const ids = new Set(results.map((r) => r.id));
    strategyIds.set(type, ids);
    for (const id of ids) {
      allIds.add(id);
    }
  }

  // Count overlap
  let overlapping = 0;
  for (const id of allIds) {
    const inCount = Array.from(strategyIds.values()).filter((ids) =>
      ids.has(id)
    ).length;
    if (inCount > 1) overlapping++;
  }

  // Build overlap matrix
  const strategyTypes = Array.from(strategyResults.keys());
  const overlapMatrix: Record<StrategyType, Record<StrategyType, number>> = {} as Record<StrategyType, Record<StrategyType, number>>;

  for (const type1 of strategyTypes) {
    overlapMatrix[type1] = {} as Record<StrategyType, number>;
    const ids1 = strategyIds.get(type1)!;

    for (const type2 of strategyTypes) {
      const ids2 = strategyIds.get(type2)!;
      let overlap = 0;
      for (const id of ids1) {
        if (ids2.has(id)) overlap++;
      }
      overlapMatrix[type1][type2] = overlap;
    }
  }

  return {
    strategyResults,
    strategyLatencies,
    overlapAnalysis: {
      totalUnique: allIds.size,
      overlapping,
      overlapMatrix,
    },
  };
}

// ============================================
// Utilities
// ============================================

/**
 * Simple hash for query deduplication
 */
function hashQuery(query: string): string {
  let hash = 0;
  const normalized = query.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
