/**
 * Budget Optimization API
 *
 * POST /api/budget/optimize - Get optimized plan for budget
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import {
  optimizeForBudget,
  suggestUpgrades,
  getAlternativePlans,
  getPlanForTier,
  checkBudget,
  type PlanConstraints,
  type QualityTier,
  type SearchType,
  type EmbeddingModel,
} from '@/lib/budget-planner';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/budget/optimize
 *
 * Get an optimized retrieval plan based on budget constraints.
 *
 * Body:
 * {
 *   "budget": 0.05,                    // Max cost per query (USD)
 *   "quality_tier": "standard",        // Optional: "economy", "standard", "premium"
 *   "constraints": {                   // Optional constraints
 *     "min_quality": 0.7,
 *     "max_latency_ms": 2000,
 *     "required_search_type": "hybrid",
 *     "must_rerank": true,
 *     "min_top_k": 5,
 *     "max_top_k": 20
 *   },
 *   "estimation": {                    // Optional estimation params
 *     "query_length": 100,
 *     "expected_chunks": 50,
 *     "include_rag": true
 *   },
 *   "include_alternatives": true,      // Include alternative plans
 *   "include_upgrades": true           // Include upgrade suggestions
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

    // Get user's budget status for context
    const budgetStatus = await checkBudget(auth.userId);

    // Determine budget to use
    let budget: number;
    if (body.budget !== undefined) {
      budget = parseFloat(body.budget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'budget must be a positive number',
            },
          },
          { status: 400 }
        );
      }
    } else if (body.quality_tier) {
      // Use tier-based budget estimation
      budget = body.quality_tier === 'economy' ? 0.01
        : body.quality_tier === 'premium' ? 0.10
        : 0.03;
    } else {
      // Use user's per-query max as default
      budget = budgetStatus.perQueryMax;
    }

    // Build constraints
    const constraints: PlanConstraints = {
      maxCostPerQuery: budget,
    };

    if (body.constraints) {
      if (body.constraints.min_quality !== undefined) {
        constraints.minQuality = parseFloat(body.constraints.min_quality);
      }
      if (body.constraints.max_latency_ms !== undefined) {
        constraints.maxLatencyMs = parseInt(body.constraints.max_latency_ms);
      }
      if (body.constraints.required_search_type !== undefined) {
        constraints.requiredSearchType = body.constraints.required_search_type as SearchType;
      }
      if (body.constraints.must_rerank !== undefined) {
        constraints.mustRerank = Boolean(body.constraints.must_rerank);
      }
      if (body.constraints.required_embedding_model !== undefined) {
        constraints.requiredEmbeddingModel = body.constraints.required_embedding_model as EmbeddingModel;
      }
      if (body.constraints.min_top_k !== undefined) {
        constraints.minTopK = parseInt(body.constraints.min_top_k);
      }
      if (body.constraints.max_top_k !== undefined) {
        constraints.maxTopK = parseInt(body.constraints.max_top_k);
      }
    }

    // Build estimation params
    const estimationParams = {
      queryLength: body.estimation?.query_length ?? 100,
      expectedChunks: body.estimation?.expected_chunks ?? 50,
      includeRag: body.estimation?.include_rag ?? false,
      avgChunkLength: body.estimation?.avg_chunk_length ?? 500,
      expectedResponseLength: body.estimation?.expected_response_length ?? 500,
    };

    // Get optimized plan
    let optimizedPlan;
    if (body.quality_tier) {
      optimizedPlan = getPlanForTier(
        body.quality_tier as QualityTier,
        constraints,
        estimationParams
      );
    } else {
      optimizedPlan = optimizeForBudget(budget, constraints, estimationParams);
    }

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      plan: {
        embedding_model: optimizedPlan.plan.embeddingModel,
        rerank_enabled: optimizedPlan.plan.rerankEnabled,
        rerank_model: optimizedPlan.plan.rerankModel,
        llm_model: optimizedPlan.plan.llmModel,
        top_k: optimizedPlan.plan.topK,
        use_cache: optimizedPlan.plan.useCache,
        chunk_strategy: optimizedPlan.plan.chunkStrategy,
        search_type: optimizedPlan.plan.searchType,
        quality_tier: optimizedPlan.plan.qualityTier,
      },
      estimated_cost_usd: optimizedPlan.estimatedCost,
      estimated_quality: optimizedPlan.estimatedQuality,
      estimated_latency_ms: optimizedPlan.estimatedLatencyMs,
      tradeoffs: optimizedPlan.tradeoffs,
      is_fallback: optimizedPlan.isFallback,
      limitation_reason: optimizedPlan.limitationReason,
      budget_context: {
        requested_budget: budget,
        daily_remaining: budgetStatus.dailyRemaining,
        monthly_remaining: budgetStatus.monthlyRemaining,
        can_afford: budget <= budgetStatus.dailyRemaining,
      },
    };

    // Include alternatives if requested
    if (body.include_alternatives) {
      const alternatives = getAlternativePlans(budget, estimationParams);
      response.alternatives = alternatives.map(alt => ({
        plan: {
          embedding_model: alt.plan.embeddingModel,
          rerank_enabled: alt.plan.rerankEnabled,
          rerank_model: alt.plan.rerankModel,
          llm_model: alt.plan.llmModel,
          top_k: alt.plan.topK,
          use_cache: alt.plan.useCache,
          chunk_strategy: alt.plan.chunkStrategy,
          search_type: alt.plan.searchType,
          quality_tier: alt.plan.qualityTier,
        },
        estimated_cost_usd: alt.estimatedCost,
        estimated_quality: alt.estimatedQuality,
        estimated_latency_ms: alt.estimatedLatencyMs,
        tradeoffs: alt.tradeoffs,
        is_fallback: alt.isFallback,
      }));
    }

    // Include upgrade suggestions if requested
    if (body.include_upgrades) {
      const additionalBudget = Math.min(
        budget * 2, // Double current budget
        budgetStatus.dailyRemaining - budget // Or remaining budget
      );

      if (additionalBudget > 0) {
        const upgrades = suggestUpgrades(
          optimizedPlan.plan,
          additionalBudget,
          estimationParams
        );

        response.upgrades = upgrades.map(u => ({
          current: u.current,
          suggested: u.suggested,
          additional_cost_usd: u.additionalCost,
          quality_improvement: u.qualityImprovement,
          description: u.description,
          priority: u.priority,
        }));
      }
    }

    return NextResponse.json(response, {
      headers: auth.rateLimitHeaders,
    });
  } catch (error) {
    logServerError('Budget optimize failed', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'OPTIMIZATION_ERROR',
          message: 'Failed to optimize retrieval plan',
        },
      },
      { status: 500 }
    );
  }
}
