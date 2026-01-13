import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { compareStrategies } from '@/lib/hybrid-orchestrator';
import type { StrategyConfig } from '@/lib/hybrid-orchestrator';
import { estimateTokens } from '@/lib/summer/utils/tokens';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

/**
 * POST /api/hybrid/compare
 *
 * Compare strategy results side-by-side.
 * Useful for A/B testing and strategy tuning.
 *
 * Body:
 * {
 *   "collection_id": "uuid",
 *   "query": "string",
 *   "strategies": [{ type, weight, params }]
 * }
 *
 * Response includes:
 * - Per-strategy results
 * - Overlap analysis between strategies
 * - Latency comparison
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    const body = await request.json();

    // Validate required fields
    if (!body?.collection_id || typeof body.collection_id !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/compare', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('collection_id');
    }

    if (!body?.query || typeof body.query !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/compare', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('query');
    }

    if (!body?.strategies || !Array.isArray(body.strategies)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/compare', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('strategies');
    }

    // Validate strategies
    const validationError = validateStrategies(body.strategies);
    if (validationError) {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/compare', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    // Execute comparison
    const result = await compareStrategies(
      {
        userId,
        collectionId: body.collection_id,
        query: body.query,
      },
      body.strategies as StrategyConfig[]
    );

    // Log usage
    await logRequest(
      { userId, keyId, endpoint: '/api/hybrid/compare', method: 'POST', startTime },
      200,
      { embedding: estimateTokens(body.query) }
    );

    // Convert Map to object for JSON serialization
    const strategyResultsObj: Record<string, unknown> = {};
    for (const [key, value] of result.strategyResults) {
      strategyResultsObj[key] = value;
    }

    const response = NextResponse.json(
      {
        success: true,
        plan,
        strategy_results: strategyResultsObj,
        strategy_latencies: result.strategyLatencies,
        overlap_analysis: {
          total_unique: result.overlapAnalysis.totalUnique,
          overlapping: result.overlapAnalysis.overlapping,
          overlap_percentage:
            result.overlapAnalysis.totalUnique > 0
              ? (
                  (result.overlapAnalysis.overlapping /
                    result.overlapAnalysis.totalUnique) *
                  100
                ).toFixed(1)
              : 0,
          overlap_matrix: result.overlapAnalysis.overlapMatrix,
        },
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) =>
        response.headers.set(k, v)
      );
    }

    return response;
  } catch (err) {
    console.error('Hybrid compare error:', err);
    return ServerErrors.internal('hybrid_compare');
  }
}

/**
 * Validate strategy configurations
 */
function validateStrategies(strategies: unknown[]): string | null {
  if (strategies.length < 2) {
    return 'At least two strategies are required for comparison';
  }

  const validTypes = ['vector', 'keyword', 'multi_query'];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i] as Record<string, unknown>;

    if (!strategy.type || !validTypes.includes(strategy.type as string)) {
      return `Strategy ${i}: Invalid type. Must be one of: ${validTypes.join(', ')}`;
    }

    if (
      typeof strategy.weight !== 'number' ||
      strategy.weight < 0 ||
      strategy.weight > 1
    ) {
      return `Strategy ${i}: Weight must be a number between 0 and 1`;
    }

    if (!strategy.params || typeof strategy.params !== 'object') {
      return `Strategy ${i}: params is required and must be an object`;
    }
  }

  return null;
}
