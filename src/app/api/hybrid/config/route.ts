import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  listHybridConfigs,
  createHybridConfig,
  getActiveConfig,
} from '@/lib/hybrid-orchestrator';
import type {
  StrategyConfig,
  FusionMethod,
} from '@/lib/hybrid-orchestrator';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

/**
 * GET /api/hybrid/config
 *
 * List hybrid configs or get active config.
 *
 * Query params:
 * - collection_id (optional): Filter by collection
 * - active (optional): If 'true', return only the active config
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id') ?? undefined;
    const activeOnly = searchParams.get('active') === 'true';

    let result;

    if (activeOnly) {
      // Get single active config
      const config = await getActiveConfig(userId, collectionId);
      result = { config };
    } else {
      // List all configs
      const configs = await listHybridConfigs(userId, collectionId);
      result = { configs };
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/hybrid/config', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json(
      { success: true, ...result },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) =>
        response.headers.set(k, v)
      );
    }

    return response;
  } catch (err) {
    console.error('Hybrid config GET error:', err);
    return ServerErrors.internal('hybrid_config_get');
  }
}

/**
 * POST /api/hybrid/config
 *
 * Create a new hybrid config.
 *
 * Body:
 * {
 *   "name": "string",
 *   "collection_id"?: "uuid",
 *   "strategies": [{ type, weight, params }],
 *   "fusion_method"?: "rrf" | "weighted_sum" | "learned" | "cascade",
 *   "rrf_k"?: number,
 *   "cascade_threshold"?: number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const body = await request.json();

    // Validate required fields
    if (!body?.name || typeof body.name !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/config', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('name');
    }

    if (!body?.strategies || !Array.isArray(body.strategies)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/config', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('strategies');
    }

    // Validate strategies
    const validationError = validateStrategies(body.strategies);
    if (validationError) {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/config', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    // Validate fusion method
    const validFusionMethods: FusionMethod[] = [
      'rrf',
      'weighted_sum',
      'learned',
      'cascade',
    ];
    if (body.fusion_method && !validFusionMethods.includes(body.fusion_method)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/hybrid/config', method: 'POST', startTime },
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

    const config = await createHybridConfig({
      userId,
      name: body.name,
      collectionId: body.collection_id ?? undefined,
      strategies: body.strategies as StrategyConfig[],
      fusionMethod: body.fusion_method,
      rrfK: body.rrf_k,
      cascadeThreshold: body.cascade_threshold,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/hybrid/config', method: 'POST', startTime },
      201
    );

    const response = NextResponse.json(
      { success: true, config },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) =>
        response.headers.set(k, v)
      );
    }

    return response;
  } catch (err) {
    console.error('Hybrid config POST error:', err);
    return ServerErrors.internal('hybrid_config_create');
  }
}

/**
 * Validate strategy configurations
 */
function validateStrategies(strategies: unknown[]): string | null {
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

    const params = strategy.params as Record<string, unknown>;

    // Validate type-specific params
    if (strategy.type === 'vector' || strategy.type === 'keyword') {
      if (typeof params.top_k !== 'number' || params.top_k < 1) {
        return `Strategy ${i}: params.top_k must be a positive number`;
      }
    }

    if (strategy.type === 'multi_query') {
      if (typeof params.top_k !== 'number' || params.top_k < 1) {
        return `Strategy ${i}: params.top_k must be a positive number`;
      }
      if (typeof params.num_expansions !== 'number' || params.num_expansions < 1) {
        return `Strategy ${i}: params.num_expansions must be a positive number`;
      }
      const validMethods = ['llm', 'synonyms', 'embedding_nn'];
      if (
        params.expansion_method &&
        !validMethods.includes(params.expansion_method as string)
      ) {
        return `Strategy ${i}: params.expansion_method must be one of: ${validMethods.join(', ')}`;
      }
    }
  }

  return null;
}
