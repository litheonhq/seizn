/**
 * Cost Estimation API
 *
 * POST /api/budget/estimate - Estimate cost for a retrieval plan
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import {
  estimatePlanCost,
  estimateMonthlyCost,
  estimateCostRange,
  comparePlanCosts,
  calculatePlanQuality,
  estimateLatency,
  formatCost,
  type RetrievalPlanConfig,
  type EmbeddingModel,
  type RerankModel,
  type LLMModel,
  type ChunkStrategy,
  type SearchType,
  DEFAULT_PLAN_CONFIG,
} from '@/lib/budget-planner';

/**
 * POST /api/budget/estimate
 *
 * Estimate cost for a retrieval plan configuration.
 *
 * Body:
 * {
 *   "plan": {
 *     "embedding_model": "text-embedding-3-small",
 *     "rerank_enabled": true,
 *     "rerank_model": "cohere-rerank-v3",
 *     "llm_model": "gpt-4o-mini",
 *     "top_k": 10,
 *     "use_cache": true,
 *     "chunk_strategy": "balanced",
 *     "search_type": "hybrid"
 *   },
 *   "query_length": 100,
 *   "expected_chunks": 50,
 *   "avg_chunk_length": 500,
 *   "include_rag": true,
 *   "expected_response_length": 500,
 *
 *   // Optional: for monthly estimation
 *   "queries_per_month": 10000,
 *
 *   // Optional: for range estimation
 *   "range": {
 *     "min_query_length": 50,
 *     "max_query_length": 200,
 *     "min_chunks": 10,
 *     "max_chunks": 100
 *   },
 *
 *   // Optional: for comparison
 *   "compare_with": {
 *     "embedding_model": "text-embedding-3-large",
 *     ...
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  try {
    const body = await request.json();

    // Build plan config from input
    const planInput = body.plan || {};
    const plan: RetrievalPlanConfig = {
      embeddingModel: (planInput.embedding_model || DEFAULT_PLAN_CONFIG.embeddingModel) as EmbeddingModel,
      rerankEnabled: planInput.rerank_enabled ?? DEFAULT_PLAN_CONFIG.rerankEnabled,
      rerankModel: planInput.rerank_model as RerankModel | undefined,
      llmModel: (planInput.llm_model || DEFAULT_PLAN_CONFIG.llmModel) as LLMModel,
      topK: planInput.top_k ?? DEFAULT_PLAN_CONFIG.topK,
      useCache: planInput.use_cache ?? DEFAULT_PLAN_CONFIG.useCache,
      chunkStrategy: (planInput.chunk_strategy || DEFAULT_PLAN_CONFIG.chunkStrategy) as ChunkStrategy,
      searchType: (planInput.search_type || DEFAULT_PLAN_CONFIG.searchType) as SearchType,
      qualityTier: planInput.quality_tier || DEFAULT_PLAN_CONFIG.qualityTier,
    };

    // Build estimation params
    const estimationParams = {
      queryLength: body.query_length ?? 100,
      expectedChunks: body.expected_chunks ?? 50,
      avgChunkLength: body.avg_chunk_length ?? 500,
      includeRag: body.include_rag ?? false,
      expectedResponseLength: body.expected_response_length ?? 500,
    };

    // Get base estimate
    const estimate = estimatePlanCost(plan, estimationParams);
    const quality = calculatePlanQuality(plan);
    const latency = estimateLatency(plan, { includeRag: estimationParams.includeRag });

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      estimate: {
        total_cost_usd: estimate.total,
        total_cost_formatted: formatCost(estimate.total),
        breakdown: {
          embedding: {
            model: estimate.breakdown.embedding.model,
            tokens: estimate.breakdown.embedding.tokens,
            price_per_m_token: estimate.breakdown.embedding.pricePerMToken,
            cost_usd: estimate.breakdown.embedding.cost,
          },
          rerank: {
            model: estimate.breakdown.rerank.model,
            pairs: estimate.breakdown.rerank.pairs,
            price_per_search: estimate.breakdown.rerank.pricePerSearch,
            cost_usd: estimate.breakdown.rerank.cost,
          },
          llm: {
            model: estimate.breakdown.llm.model,
            tokens_in: estimate.breakdown.llm.tokensIn,
            tokens_out: estimate.breakdown.llm.tokensOut,
            price_per_m_token_in: estimate.breakdown.llm.pricePerMTokenIn,
            price_per_m_token_out: estimate.breakdown.llm.pricePerMTokenOut,
            cost_usd: estimate.breakdown.llm.cost,
          },
          storage: {
            vectors: estimate.breakdown.storage.vectors,
            dimensions: estimate.breakdown.storage.dimensions,
            cost_usd: estimate.breakdown.storage.cost,
          },
        },
        confidence: estimate.confidence,
      },
      quality_score: quality,
      estimated_latency_ms: latency,
    };

    // Monthly estimation if requested
    if (body.queries_per_month) {
      const monthly = estimateMonthlyCost(plan, body.queries_per_month, {
        expectedChunks: estimationParams.expectedChunks,
        avgChunkLength: estimationParams.avgChunkLength,
        includeRag: estimationParams.includeRag,
        expectedResponseLength: estimationParams.expectedResponseLength,
        avgQueryLength: estimationParams.queryLength,
      });

      response.monthly_estimate = {
        queries_per_month: body.queries_per_month,
        total_cost_usd: monthly.monthly,
        total_cost_formatted: formatCost(monthly.monthly),
        breakdown: {
          embedding_usd: monthly.breakdown.embedding,
          rerank_usd: monthly.breakdown.rerank,
          llm_usd: monthly.breakdown.llm,
          storage_usd: monthly.breakdown.storage,
        },
        per_query_avg_usd: monthly.perQuery.total,
      };
    }

    // Range estimation if requested
    if (body.range) {
      const range = estimateCostRange(plan, {
        minQueryLength: body.range.min_query_length ?? 50,
        maxQueryLength: body.range.max_query_length ?? 200,
        minChunks: body.range.min_chunks ?? 10,
        maxChunks: body.range.max_chunks ?? 100,
        includeRag: estimationParams.includeRag,
      });

      response.cost_range = {
        min_cost_usd: range.min.total,
        max_cost_usd: range.max.total,
        avg_cost_usd: range.avg.total,
        min_cost_formatted: formatCost(range.min.total),
        max_cost_formatted: formatCost(range.max.total),
        avg_cost_formatted: formatCost(range.avg.total),
      };
    }

    // Comparison if requested
    if (body.compare_with) {
      const compareInput = body.compare_with;
      const comparePlan: RetrievalPlanConfig = {
        embeddingModel: (compareInput.embedding_model || plan.embeddingModel) as EmbeddingModel,
        rerankEnabled: compareInput.rerank_enabled ?? plan.rerankEnabled,
        rerankModel: compareInput.rerank_model as RerankModel | undefined,
        llmModel: (compareInput.llm_model || plan.llmModel) as LLMModel,
        topK: compareInput.top_k ?? plan.topK,
        useCache: compareInput.use_cache ?? plan.useCache,
        chunkStrategy: (compareInput.chunk_strategy || plan.chunkStrategy) as ChunkStrategy,
        searchType: (compareInput.search_type || plan.searchType) as SearchType,
        qualityTier: compareInput.quality_tier || plan.qualityTier,
      };

      const comparison = comparePlanCosts(plan, comparePlan, estimationParams);
      const compareQuality = calculatePlanQuality(comparePlan);
      const compareLatency = estimateLatency(comparePlan, { includeRag: estimationParams.includeRag });

      response.comparison = {
        plan_a: {
          cost_usd: comparison.planA.total,
          quality: quality,
          latency_ms: latency,
        },
        plan_b: {
          cost_usd: comparison.planB.total,
          quality: compareQuality,
          latency_ms: compareLatency,
        },
        difference_usd: comparison.difference,
        difference_pct: comparison.percentDiff,
        cheaper_plan: comparison.cheaperPlan,
        recommendation: getCostRecommendation(
          comparison.planA.total,
          quality,
          comparison.planB.total,
          compareQuality
        ),
      };
    }

    return NextResponse.json(response, {
      headers: auth.rateLimitHeaders,
    });
  } catch (error) {
    console.error('Error estimating cost:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ESTIMATION_ERROR',
          message: 'Failed to estimate cost',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Generate cost recommendation based on comparison
 */
function getCostRecommendation(
  costA: number,
  qualityA: number,
  costB: number,
  qualityB: number
): string {
  const costEfficiencyA = qualityA / costA;
  const costEfficiencyB = qualityB / costB;

  if (Math.abs(costEfficiencyA - costEfficiencyB) < 0.1) {
    return 'Both plans have similar cost-efficiency. Choose based on specific requirements.';
  }

  if (costEfficiencyA > costEfficiencyB) {
    if (qualityB > qualityA) {
      return 'Plan A is more cost-efficient, but Plan B offers higher quality. Consider your budget.';
    }
    return 'Plan A is recommended - better cost-efficiency.';
  }

  if (qualityA > qualityB) {
    return 'Plan B is more cost-efficient, but Plan A offers higher quality. Consider your budget.';
  }
  return 'Plan B is recommended - better cost-efficiency.';
}
