/**
 * Seizn Budget-aware Planning - Cost Estimator
 *
 * Estimates the cost of retrieval plans based on configuration
 * and expected usage patterns.
 */

import type {
  CostEstimate,
  CostBreakdown,
  RetrievalPlanConfig,
  QueryType,
} from './types';
import {
  EMBEDDING_PRICING,
  RERANK_PRICING,
  LLM_PRICING,
  STORAGE_PRICING,
  calculateEmbeddingCost,
  calculateRerankCost,
  calculateLLMCost,
} from './pricing';

// ============================================
// Token Estimation
// ============================================

/**
 * Estimate tokens from text length
 * Rule of thumb: ~4 characters per token for English
 */
export function estimateTokens(textLength: number): number {
  return Math.ceil(textLength / 4);
}

/**
 * Estimate tokens for a query
 */
export function estimateQueryTokens(queryLength: number): number {
  // Query text + system prompt overhead
  return estimateTokens(queryLength) + 50;
}

/**
 * Estimate tokens for chunks
 */
export function estimateChunkTokens(
  chunkCount: number,
  avgChunkLength: number = 500
): number {
  return chunkCount * estimateTokens(avgChunkLength);
}

// ============================================
// Cost Estimation
// ============================================

export interface EstimationParams {
  /** Length of query text */
  queryLength: number;
  /** Expected number of chunks to retrieve */
  expectedChunks: number;
  /** Average chunk length in characters */
  avgChunkLength?: number;
  /** Whether RAG response is included */
  includeRag?: boolean;
  /** Expected RAG response length */
  expectedResponseLength?: number;
  /** Query type */
  queryType?: QueryType;
}

/**
 * Estimate cost for a retrieval plan
 */
export function estimatePlanCost(
  plan: RetrievalPlanConfig,
  params: EstimationParams
): CostEstimate {
  const {
    queryLength,
    expectedChunks,
    avgChunkLength = 500,
    includeRag = false,
    expectedResponseLength = 500,
    queryType = 'search',
  } = params;

  // Get model pricing
  const embeddingPricing = EMBEDDING_PRICING[plan.embeddingModel];
  const rerankPricing = plan.rerankEnabled && plan.rerankModel
    ? RERANK_PRICING[plan.rerankModel]
    : null;
  const llmPricing = (includeRag || queryType === 'rag') && plan.llmModel
    ? LLM_PRICING[plan.llmModel]
    : null;

  // Calculate embedding cost
  const queryTokens = estimateQueryTokens(queryLength);
  const embeddingCost = calculateEmbeddingCost(plan.embeddingModel, queryTokens);

  // Calculate rerank cost
  let rerankCost = 0;
  let rerankPairs = 0;
  if (plan.rerankEnabled && rerankPricing) {
    // Reranking happens on topK results
    rerankPairs = Math.min(plan.topK, expectedChunks);
    rerankCost = calculateRerankCost(plan.rerankModel!, 1);
  }

  // Calculate LLM cost
  let llmCost = 0;
  let llmTokensIn = 0;
  let llmTokensOut = 0;
  if (llmPricing && (includeRag || queryType === 'rag')) {
    // Context = query + retrieved chunks
    const chunkTokens = estimateChunkTokens(
      Math.min(plan.topK, expectedChunks),
      avgChunkLength
    );
    llmTokensIn = queryTokens + chunkTokens + 200; // 200 for system prompt
    llmTokensOut = estimateTokens(expectedResponseLength);
    llmCost = calculateLLMCost(plan.llmModel!, llmTokensIn, llmTokensOut);
  }

  // Storage cost is minimal per query (amortized)
  const storageCost = 0; // Per-query storage cost is negligible

  // Build breakdown
  const breakdown: CostBreakdown = {
    embedding: {
      model: plan.embeddingModel,
      tokens: queryTokens,
      pricePerMToken: embeddingPricing?.pricePerMToken ?? 0,
      cost: embeddingCost,
    },
    rerank: {
      model: plan.rerankModel ?? null,
      pairs: rerankPairs,
      pricePerSearch: rerankPricing?.pricePerKSearch
        ? rerankPricing.pricePerKSearch / 1000
        : 0,
      cost: rerankCost,
    },
    llm: {
      model: plan.llmModel ?? null,
      tokensIn: llmTokensIn,
      tokensOut: llmTokensOut,
      pricePerMTokenIn: llmPricing?.pricePerMTokenIn ?? 0,
      pricePerMTokenOut: llmPricing?.pricePerMTokenOut ?? 0,
      cost: llmCost,
    },
    storage: {
      vectors: 0,
      dimensions: embeddingPricing?.dimensions ?? 1536,
      pricePerVector: STORAGE_PRICING.pricePerMVectorsMonth / 1_000_000,
      cost: storageCost,
    },
  };

  const totalCost = embeddingCost + rerankCost + llmCost + storageCost;

  // Confidence based on how well we can estimate
  let confidence = 0.9;
  if (includeRag) confidence -= 0.1; // LLM output is variable
  if (plan.rerankEnabled) confidence -= 0.05;

  return {
    embedding: embeddingCost,
    rerank: rerankCost,
    llm: llmCost,
    storage: storageCost,
    total: totalCost,
    breakdown,
    confidence,
  };
}

/**
 * Estimate monthly cost based on query volume
 */
export function estimateMonthlyCost(
  plan: RetrievalPlanConfig,
  queriesPerMonth: number,
  params: Omit<EstimationParams, 'queryLength'> & {
    avgQueryLength?: number;
  }
): {
  perQuery: CostEstimate;
  monthly: number;
  breakdown: {
    embedding: number;
    rerank: number;
    llm: number;
    storage: number;
  };
} {
  const { avgQueryLength = 100, ...rest } = params;

  const perQuery = estimatePlanCost(plan, {
    queryLength: avgQueryLength,
    ...rest,
  });

  const monthly = perQuery.total * queriesPerMonth;

  return {
    perQuery,
    monthly,
    breakdown: {
      embedding: perQuery.embedding * queriesPerMonth,
      rerank: perQuery.rerank * queriesPerMonth,
      llm: perQuery.llm * queriesPerMonth,
      storage: perQuery.storage * queriesPerMonth,
    },
  };
}

/**
 * Estimate cost range (min/max) for variable inputs
 */
export function estimateCostRange(
  plan: RetrievalPlanConfig,
  params: {
    minQueryLength: number;
    maxQueryLength: number;
    minChunks: number;
    maxChunks: number;
    includeRag?: boolean;
  }
): {
  min: CostEstimate;
  max: CostEstimate;
  avg: CostEstimate;
} {
  const min = estimatePlanCost(plan, {
    queryLength: params.minQueryLength,
    expectedChunks: params.minChunks,
    includeRag: params.includeRag,
  });

  const max = estimatePlanCost(plan, {
    queryLength: params.maxQueryLength,
    expectedChunks: params.maxChunks,
    includeRag: params.includeRag,
  });

  // Average estimate
  const avgQueryLength = (params.minQueryLength + params.maxQueryLength) / 2;
  const avgChunks = (params.minChunks + params.maxChunks) / 2;
  const avg = estimatePlanCost(plan, {
    queryLength: avgQueryLength,
    expectedChunks: avgChunks,
    includeRag: params.includeRag,
  });

  return { min, max, avg };
}

/**
 * Compare cost between two plans
 */
export function comparePlanCosts(
  planA: RetrievalPlanConfig,
  planB: RetrievalPlanConfig,
  params: EstimationParams
): {
  planA: CostEstimate;
  planB: CostEstimate;
  difference: number;
  percentDiff: number;
  cheaperPlan: 'A' | 'B';
} {
  const costA = estimatePlanCost(planA, params);
  const costB = estimatePlanCost(planB, params);

  const difference = costA.total - costB.total;
  const percentDiff = costA.total > 0
    ? (difference / costA.total) * 100
    : 0;

  return {
    planA: costA,
    planB: costB,
    difference: Math.abs(difference),
    percentDiff: Math.abs(percentDiff),
    cheaperPlan: costA.total <= costB.total ? 'A' : 'B',
  };
}

/**
 * Estimate latency for a plan
 */
export function estimateLatency(
  plan: RetrievalPlanConfig,
  params: {
    dbLatencyMs?: number;
    networkLatencyMs?: number;
    includeRag?: boolean;
  } = {}
): number {
  const {
    dbLatencyMs = 50,
    networkLatencyMs = 20,
    includeRag = false,
  } = params;

  let totalLatency = dbLatencyMs + networkLatencyMs;

  // Embedding latency
  const embeddingPricing = EMBEDDING_PRICING[plan.embeddingModel];
  totalLatency += embeddingPricing?.avgLatencyMs ?? 100;

  // Rerank latency
  if (plan.rerankEnabled && plan.rerankModel) {
    const rerankPricing = RERANK_PRICING[plan.rerankModel];
    totalLatency += rerankPricing?.avgLatencyMs ?? 200;
  }

  // LLM latency
  if (includeRag && plan.llmModel) {
    const llmPricing = LLM_PRICING[plan.llmModel];
    totalLatency += llmPricing?.avgLatencyMs ?? 1000;
  }

  // Cache hit reduces latency significantly
  if (plan.useCache) {
    // Assume 30% cache hit rate on average
    totalLatency = totalLatency * 0.7 + 50 * 0.3;
  }

  return Math.round(totalLatency);
}

/**
 * Calculate quality score for a plan
 */
export function calculatePlanQuality(plan: RetrievalPlanConfig): number {
  let quality = 0;

  // Base quality from embedding model
  const embeddingPricing = EMBEDDING_PRICING[plan.embeddingModel];
  quality += (embeddingPricing?.qualityScore ?? 0.7) * 0.4;

  // Reranking boost
  if (plan.rerankEnabled && plan.rerankModel) {
    const rerankPricing = RERANK_PRICING[plan.rerankModel];
    quality += (rerankPricing?.qualityScore ?? 0.85) * 0.25;
  } else {
    quality += 0.6 * 0.25; // No reranking penalty
  }

  // LLM quality (for RAG)
  if (plan.llmModel) {
    const llmPricing = LLM_PRICING[plan.llmModel];
    quality += (llmPricing?.qualityScore ?? 0.8) * 0.2;
  } else {
    quality += 0.7 * 0.2;
  }

  // TopK factor (more results generally better, but diminishing returns)
  const topKScore = Math.min(1, Math.log10(plan.topK + 1) / 2);
  quality += topKScore * 0.1;

  // Search type factor
  if (plan.searchType === 'hybrid') {
    quality += 0.05;
  }

  return Math.min(1, quality);
}

/**
 * Get cost per quality point
 */
export function getCostEfficiency(
  plan: RetrievalPlanConfig,
  params: EstimationParams
): number {
  const cost = estimatePlanCost(plan, params);
  const quality = calculatePlanQuality(plan);

  if (quality === 0) return Infinity;
  return cost.total / quality;
}
