/**
 * Autopilot Retrieval Stats API
 *
 * GET - Get strategy statistics and decision history
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  getStatsSummary,
  getRecentDecisions,
  loadBanditState,
  getOrCreateConfig,
} from '@/lib/autopilot-retrieval';
import { generateLearningInsights } from '@/lib/autopilot-retrieval/learner';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/autopilot/stats
 *
 * Get autopilot statistics and learning insights.
 *
 * Query params:
 * - collection_id: (optional) Get collection-specific stats
 * - include_decisions: (optional) Include recent decisions log (default: false)
 * - decisions_limit: (optional) Number of recent decisions to include (default: 50)
 * - include_insights: (optional) Include learning insights (default: true)
 *
 * Response:
 * {
 *   "success": true,
 *   "summary": {
 *     "config_id": string,
 *     "strategies": [
 *       {
 *         "strategy": string,
 *         "total_uses": number,
 *         "success_rate": number,
 *         "avg_reward": number,
 *         "avg_latency_ms": number,
 *         "avg_relevance": number,
 *         "trend": "improving" | "stable" | "declining"
 *       }
 *     ],
 *     "total_decisions": number,
 *     "exploration_rate": number,
 *     "last_updated": string
 *   },
 *   "insights"?: {
 *     "total_samples": number,
 *     "exploration_needed": boolean,
 *     "best_strategy": string | null,
 *     "underexplored_strategies": string[],
 *     "performance_issues": Array<{ strategy: string, issue: string }>,
 *     "recommendations": string[]
 *   },
 *   "decisions"?: [
 *     {
 *       "id": string,
 *       "created_at": string,
 *       "query_text": string,
 *       "chosen_strategy": string,
 *       "was_exploration": boolean,
 *       "latency_ms": number,
 *       "relevance_score": number,
 *       "reward": number,
 *       "user_feedback": string | null
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);

    const collectionId = searchParams.get('collection_id');
    const includeDecisions = searchParams.get('include_decisions') === 'true';
    const decisionsLimit = parseInt(searchParams.get('decisions_limit') || '50', 10);
    const includeInsights = searchParams.get('include_insights') !== 'false';

    // Get stats summary
    const summary = await getStatsSummary(userId, collectionId);

    if (!summary) {
      return NextResponse.json(
        { error: 'No autopilot config found. Make some queries first.' },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = {
      success: true,
      summary: {
        config_id: summary.configId,
        strategies: summary.strategies.map(s => ({
          strategy: s.strategy,
          total_uses: s.totalUses,
          success_rate: s.successRate,
          avg_reward: s.avgReward,
          avg_latency_ms: s.avgLatencyMs,
          avg_relevance: s.avgRelevance,
          trend: s.trend,
        })),
        total_decisions: summary.totalDecisions,
        exploration_rate: summary.explorationRate,
        last_updated: summary.lastUpdated,
      },
    };

    // Include learning insights if requested
    if (includeInsights) {
      const config = await getOrCreateConfig(userId, collectionId);
      const state = await loadBanditState(config.id);
      const insights = generateLearningInsights(state);

      response.insights = {
        total_samples: insights.totalSamples,
        exploration_needed: insights.explorationNeeded,
        best_strategy: insights.bestStrategy,
        underexplored_strategies: insights.underexploredStrategies,
        performance_issues: insights.performanceIssues,
        recommendations: insights.recommendations,
      };
    }

    // Include recent decisions if requested
    if (includeDecisions) {
      const decisions = await getRecentDecisions(
        userId,
        collectionId,
        Math.min(decisionsLimit, 100)
      );

      response.decisions = decisions.map(d => ({
        id: d.id,
        created_at: d.createdAt,
        query_text: d.queryText,
        chosen_strategy: d.chosenStrategy,
        was_exploration: d.wasExploration,
        latency_ms: d.latencyMs,
        relevance_score: d.relevanceScore,
        reward: d.reward,
        user_feedback: d.userFeedback,
      }));
    }

    return NextResponse.json(response);
  } catch (err) {
    logServerError('Autopilot stats GET error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/autopilot/stats
 *
 * Get detailed stats with filtering options.
 *
 * Body:
 * {
 *   "collection_id"?: string,
 *   "strategy_filter"?: string[],      // Filter to specific strategies
 *   "date_range"?: {
 *     "start": string,                  // ISO date
 *     "end": string                     // ISO date
 *   },
 *   "min_samples"?: number,            // Only include strategies with min samples
 *   "sort_by"?: "reward" | "uses" | "success_rate" | "latency"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    const collectionId = body?.collection_id || null;

    // Get base stats
    const summary = await getStatsSummary(userId, collectionId);

    if (!summary) {
      return NextResponse.json(
        { error: 'No autopilot config found' },
        { status: 404 }
      );
    }

    let strategies = summary.strategies;

    // Apply strategy filter
    if (body?.strategy_filter && Array.isArray(body.strategy_filter)) {
      strategies = strategies.filter(s =>
        body.strategy_filter.includes(s.strategy)
      );
    }

    // Apply min samples filter
    if (body?.min_samples && typeof body.min_samples === 'number') {
      strategies = strategies.filter(s => s.totalUses >= body.min_samples);
    }

    // Apply sorting
    const sortBy = body?.sort_by || 'reward';
    switch (sortBy) {
      case 'uses':
        strategies.sort((a, b) => b.totalUses - a.totalUses);
        break;
      case 'success_rate':
        strategies.sort((a, b) => b.successRate - a.successRate);
        break;
      case 'latency':
        strategies.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
        break;
      case 'reward':
      default:
        strategies.sort((a, b) => b.avgReward - a.avgReward);
    }

    // Get recent decisions for the date range if specified
    let decisions: unknown[] = [];
    if (body?.date_range) {
      const allDecisions = await getRecentDecisions(userId, collectionId, 1000);
      const start = new Date(body.date_range.start);
      const end = new Date(body.date_range.end);

      decisions = allDecisions.filter(d => {
        const date = new Date(d.createdAt);
        return date >= start && date <= end;
      });
    }

    return NextResponse.json({
      success: true,
      summary: {
        config_id: summary.configId,
        total_decisions: summary.totalDecisions,
        exploration_rate: summary.explorationRate,
      },
      strategies: strategies.map(s => ({
        strategy: s.strategy,
        total_uses: s.totalUses,
        success_rate: s.successRate,
        avg_reward: s.avgReward,
        avg_latency_ms: s.avgLatencyMs,
        avg_relevance: s.avgRelevance,
        trend: s.trend,
      })),
      decisions_in_range: decisions.length > 0 ? decisions.length : undefined,
      filters_applied: {
        strategy_filter: body?.strategy_filter,
        min_samples: body?.min_samples,
        sort_by: sortBy,
        date_range: body?.date_range,
      },
    });
  } catch (err) {
    logServerError('Autopilot stats POST error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
