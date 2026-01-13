/**
 * Budget Usage API
 *
 * GET /api/budget/usage - Get usage history and summaries
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import {
  getUsageSummaries,
  getQueryCostHistory,
  getTotalSpending,
  getSpendingTrend,
} from '@/lib/budget-planner';

/**
 * GET /api/budget/usage
 *
 * Get usage history for the authenticated user.
 *
 * Query parameters:
 * - view: "summary" (default), "detailed", "trend"
 * - start_date: ISO date string (e.g., "2025-01-01")
 * - end_date: ISO date string
 * - period: "day", "week", "month", "year" (for total spending)
 * - limit: Number of records to return (default: 30)
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  try {
    const { searchParams } = new URL(request.url);

    const view = searchParams.get('view') || 'summary';
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const period = searchParams.get('period') as 'day' | 'week' | 'month' | 'year' | null;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 30;

    if (view === 'summary') {
      // Get daily summaries
      const summaries = await getUsageSummaries(auth.userId, {
        startDate,
        endDate,
        limit,
      });

      // Calculate totals
      const totalCost = summaries.reduce((sum, s) => sum + s.totalCostUsd, 0);
      const totalQueries = summaries.reduce((sum, s) => sum + s.totalQueries, 0);

      return NextResponse.json({
        success: true,
        summaries: summaries.map(s => ({
          date: s.date,
          total_queries: s.totalQueries,
          total_cost_usd: s.totalCostUsd,
          embedding_cost_usd: s.embeddingCostUsd,
          rerank_cost_usd: s.rerankCostUsd,
          llm_cost_usd: s.llmCostUsd,
          storage_cost_usd: s.storageCostUsd,
          total_embedding_tokens: s.totalEmbeddingTokens,
          total_llm_tokens_in: s.totalLlmTokensIn,
          total_llm_tokens_out: s.totalLlmTokensOut,
          avg_cost_per_query: s.avgCostPerQuery,
          avg_latency_ms: s.avgLatencyMs,
          budget_utilization_pct: s.budgetUtilizationPct,
          over_budget_queries: s.overBudgetQueries,
          fallback_queries: s.fallbackQueries,
        })),
        total_cost_usd: totalCost,
        total_queries: totalQueries,
      }, {
        headers: auth.rateLimitHeaders,
      });
    }

    if (view === 'detailed') {
      // Get individual query costs
      const costs = await getQueryCostHistory(auth.userId, { limit });

      return NextResponse.json({
        success: true,
        costs: costs.map(c => ({
          id: c.id,
          trace_id: c.traceId,
          embedding_cost_usd: c.embeddingCost,
          rerank_cost_usd: c.rerankCost,
          llm_cost_usd: c.llmCost,
          storage_cost_usd: c.storageCost,
          total_cost_usd: c.totalCost,
          embedding_model: c.embeddingModel,
          embedding_tokens: c.embeddingTokens,
          rerank_model: c.rerankModel,
          rerank_pairs: c.rerankPairs,
          llm_model: c.llmModel,
          llm_tokens_in: c.llmTokensIn,
          llm_tokens_out: c.llmTokensOut,
          query_type: c.queryType,
          result_count: c.resultCount,
          latency_ms: c.latencyMs,
          was_over_budget: c.wasOverBudget,
          used_fallback: c.usedFallback,
          created_at: c.createdAt,
        })),
      }, {
        headers: auth.rateLimitHeaders,
      });
    }

    if (view === 'trend') {
      // Get spending trend
      const days = limit || 30;
      const trend = await getSpendingTrend(auth.userId, days);

      return NextResponse.json({
        success: true,
        trend: trend.map(t => ({
          date: t.date,
          cost_usd: t.cost,
          queries: t.queries,
        })),
      }, {
        headers: auth.rateLimitHeaders,
      });
    }

    if (view === 'total' && period) {
      // Get total spending for period
      const total = await getTotalSpending(auth.userId, period);

      return NextResponse.json({
        success: true,
        period,
        total_cost_usd: total.totalCost,
        total_queries: total.totalQueries,
        avg_cost_per_query: total.avgCostPerQuery,
      }, {
        headers: auth.rateLimitHeaders,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid view parameter. Use "summary", "detailed", "trend", or "total" with period.',
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error getting usage:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'USAGE_ERROR',
          message: 'Failed to retrieve usage data',
        },
      },
      { status: 500 }
    );
  }
}
