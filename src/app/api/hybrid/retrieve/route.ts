import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  hybridRetrieve,
  getActiveConfig,
  getHybridConfig,
} from '@/lib/hybrid-orchestrator';
import type {
  StrategyConfig,
  FusionMethod,
} from '@/lib/hybrid-orchestrator';
import { estimateTokens } from '@/lib/summer/utils/tokens';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

/**
 * POST /api/hybrid/retrieve
 *
 * Execute hybrid multi-strategy retrieval.
 *
 * Body:
 * {
 *   "collection_id": "uuid",
 *   "query": "string",
 *   "config_id"?: "uuid",           // Use specific config (optional)
 *   "strategies"?: [{ type, weight, params }],  // Override strategies
 *   "fusion_method"?: "rrf" | "weighted_sum" | "learned" | "cascade",
 *   "top_k"?: number,               // Max results (default: 20)
 *   "include_strategy_results"?: boolean  // Include per-strategy results
 * }
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
        { userId, keyId, endpoint: '/api/hybrid/retrieve', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('collection_id');
    }

    if (!body?.query || typeof body.query !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/retrieve', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('query');
    }

    // Get config
    let config;
    if (body.config_id) {
      config = await getHybridConfig(body.config_id, userId);
      if (!config) {
        await logRequest(
          { userId, keyId, endpoint: '/api/hybrid/retrieve', method: 'POST', startTime },
          404
        );
        return NextResponse.json(
          { success: false, error: 'Config not found' },
          { status: 404 }
        );
      }
    } else {
      config = await getActiveConfig(userId, body.collection_id);
    }

    // Validate optional overrides
    if (body.strategies) {
      const validationError = validateStrategies(body.strategies);
      if (validationError) {
        await logRequest(
          { userId, keyId, endpoint: '/api/hybrid/retrieve', method: 'POST', startTime },
          400
        );
        return NextResponse.json(
          { success: false, error: validationError },
          { status: 400 }
        );
      }
    }

    if (body.fusion_method) {
      const validFusionMethods: FusionMethod[] = [
        'rrf',
        'weighted_sum',
        'learned',
        'cascade',
      ];
      if (!validFusionMethods.includes(body.fusion_method)) {
        await logRequest(
          { userId, keyId, endpoint: '/api/hybrid/retrieve', method: 'POST', startTime },
          400
        );
        return NextResponse.json(
          {
            success: false,
            error: `Invalid fusion_method. Must be one of: ${validFusionMethods.join(', ')}`,
          },
          { status: 400 }
        );
      }
    }

    // Execute hybrid retrieval
    const result = await hybridRetrieve(
      {
        userId,
        collectionId: body.collection_id,
        query: body.query,
      },
      config,
      {
        strategies: body.strategies as StrategyConfig[] | undefined,
        fusionMethod: body.fusion_method,
        topK: body.top_k ?? 20,
        includeStrategyResults: body.include_strategy_results ?? false,
      }
    );

    // Log usage
    await logRequest(
      { userId, keyId, endpoint: '/api/hybrid/retrieve', method: 'POST', startTime },
      200,
      { embedding: estimateTokens(body.query) }
    );

    // Convert Map to object for JSON serialization
    let strategyResultsObj: Record<string, unknown> | undefined;
    if (result.strategyResults) {
      strategyResultsObj = {};
      for (const [key, value] of result.strategyResults) {
        strategyResultsObj[key] = value;
      }
    }

    const response = NextResponse.json(
      {
        success: true,
        plan,
        results: result.results,
        strategy_results: strategyResultsObj,
        config: {
          id: result.config.id,
          name: result.config.name,
          fusion_method: result.fusionMethod,
        },
        metrics: {
          total_latency_ms: result.metrics.totalLatencyMs,
          strategy_latencies: result.metrics.strategyLatencies,
          fusion_latency_ms: result.metrics.fusionLatencyMs,
        },
        trace_id: result.traceId,
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
    console.error('Hybrid retrieve error:', err);
    return ServerErrors.internal('hybrid_retrieve');
  }
}

/**
 * Validate strategy configurations
 */
function validateStrategies(strategies: unknown[]): string | null {
  if (!Array.isArray(strategies)) {
    return 'strategies must be an array';
  }

  if (strategies.length === 0) {
    return 'At least one strategy is required';
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
