/**
 * Autopilot Retrieval Decision API
 *
 * POST - Get autopilot strategy decision for a query
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { makeDecision, recordOutcome } from '@/lib/autopilot-retrieval';
import type { StrategyOutcome, RewardComponents } from '@/lib/autopilot-retrieval';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/autopilot/decide
 *
 * Get autopilot strategy decision for a query.
 *
 * Body:
 * {
 *   "query": string,              // Required: the query to get strategy for
 *   "collection_id"?: string,     // Optional: collection-specific decision
 *   "trace_id"?: string,          // Optional: associated trace ID
 *   "record_outcome"?: {          // Optional: record outcome in same request
 *     "latency_ms": number,
 *     "relevance_score": number,
 *     "cost": number,
 *     "result_count": number,
 *     "user_feedback"?: "positive" | "negative" | "neutral"
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "decision_id": string,        // ID for recording feedback later
 *   "selection": {
 *     "strategy": "vector" | "hybrid" | "keyword" | "multi_query" | "hyde",
 *     "is_exploration": boolean,
 *     "reason": string,
 *     "confidence": number,
 *     "params": {                  // Strategy parameters to use
 *       "topK": number,
 *       "threshold": number,
 *       ...
 *     }
 *   },
 *   "config": {                   // Current autopilot config
 *     "enabled": boolean,
 *     "mode": string,
 *     ...
 *   }
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

    // Validate required fields
    const query = body?.query;
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'query (string) is required' },
        { status: 400 }
      );
    }

    if (query.length > 10000) {
      return NextResponse.json(
        { error: 'query must be less than 10000 characters' },
        { status: 400 }
      );
    }

    const collectionId = body?.collection_id || null;
    const traceId = body?.trace_id || null;

    // Make decision
    const { selection, decisionId, config } = await makeDecision(
      userId,
      query,
      collectionId,
      traceId
    );

    // Optionally record outcome in same request
    let reward: number | undefined;
    let rewardComponents: RewardComponents | undefined;

    if (body?.record_outcome && decisionId) {
      const outcome = body.record_outcome as StrategyOutcome;

      // Validate outcome
      if (
        typeof outcome.latencyMs !== 'number' ||
        typeof outcome.relevanceScore !== 'number' ||
        typeof outcome.cost !== 'number' ||
        typeof outcome.resultCount !== 'number'
      ) {
        return NextResponse.json(
          {
            error:
              'record_outcome requires latency_ms, relevance_score, cost, and result_count',
          },
          { status: 400 }
        );
      }

      const result = await recordOutcome(decisionId, {
        latencyMs: outcome.latencyMs,
        relevanceScore: outcome.relevanceScore,
        cost: outcome.cost,
        resultCount: outcome.resultCount,
        userFeedback: outcome.userFeedback,
      });

      reward = result.reward;
      rewardComponents = result.components;
    }

    const response: Record<string, unknown> = {
      success: true,
      decision_id: decisionId,
      selection: {
        strategy: selection.strategy,
        is_exploration: selection.isExploration,
        reason: selection.reason,
        confidence: selection.confidence,
        params: selection.params,
      },
      config: {
        id: config.id,
        enabled: config.enabled,
        mode: config.mode,
        strategy_weights: config.strategyWeights,
      },
    };

    // Include reward if outcome was recorded
    if (reward !== undefined) {
      response.reward = reward;
      response.reward_components = rewardComponents;
    }

    return NextResponse.json(response);
  } catch (err) {
    logServerError('Autopilot decide POST error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/autopilot/decide
 *
 * Quick strategy decision (for simple use cases).
 * Query params:
 * - query: The query text (required)
 * - collection_id: Collection ID (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query');
    if (!query) {
      return NextResponse.json(
        { error: 'query parameter is required' },
        { status: 400 }
      );
    }

    const collectionId = searchParams.get('collection_id');

    const { selection, decisionId, config: _config } = await makeDecision(
      userId,
      query,
      collectionId,
      null
    );

    return NextResponse.json({
      success: true,
      decision_id: decisionId,
      strategy: selection.strategy,
      is_exploration: selection.isExploration,
      reason: selection.reason,
      confidence: selection.confidence,
      params: selection.params,
    });
  } catch (err) {
    logServerError('Autopilot decide GET error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
