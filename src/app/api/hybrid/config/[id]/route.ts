import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  getHybridConfig,
  updateHybridConfig,
  deleteHybridConfig,
} from '@/lib/hybrid-orchestrator';
import type {
  StrategyConfig,
  FusionMethod,
} from '@/lib/hybrid-orchestrator';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/hybrid/config/[id]
 *
 * Get a specific hybrid config by ID.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { id } = await params;

    const config = await getHybridConfig(id, userId);

    if (!config) {
      await logRequest(
        { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'GET', startTime },
        404
      );
      return NextResponse.json(
        { success: false, error: 'Config not found' },
        { status: 404 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json(
      { success: true, config },
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
 * PATCH /api/hybrid/config/[id]
 *
 * Update a hybrid config.
 *
 * Body (all optional):
 * {
 *   "name"?: "string",
 *   "strategies"?: [{ type, weight, params }],
 *   "fusion_method"?: "rrf" | "weighted_sum" | "learned" | "cascade",
 *   "rrf_k"?: number,
 *   "cascade_threshold"?: number,
 *   "is_active"?: boolean
 * }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { id } = await params;

    // Verify config exists
    const existingConfig = await getHybridConfig(id, userId);
    if (!existingConfig) {
      await logRequest(
        { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'PATCH', startTime },
        404
      );
      return NextResponse.json(
        { success: false, error: 'Config not found' },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Validate strategies if provided
    if (body.strategies) {
      if (!Array.isArray(body.strategies)) {
        await logRequest(
          { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'PATCH', startTime },
          400
        );
        return ValidationErrors.invalidValue('strategies', 'array');
      }

      const validationError = validateStrategies(body.strategies);
      if (validationError) {
        await logRequest(
          { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'PATCH', startTime },
          400
        );
        return NextResponse.json(
          { success: false, error: validationError },
          { status: 400 }
        );
      }
    }

    // Validate fusion method if provided
    if (body.fusion_method) {
      const validFusionMethods: FusionMethod[] = [
        'rrf',
        'weighted_sum',
        'learned',
        'cascade',
      ];
      if (!validFusionMethods.includes(body.fusion_method)) {
        await logRequest(
          { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'PATCH', startTime },
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

    const updatedConfig = await updateHybridConfig({
      id,
      userId,
      name: body.name,
      strategies: body.strategies as StrategyConfig[] | undefined,
      fusionMethod: body.fusion_method,
      rrfK: body.rrf_k,
      cascadeThreshold: body.cascade_threshold,
      isActive: body.is_active,
    });

    await logRequest(
      { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'PATCH', startTime },
      200
    );

    const response = NextResponse.json(
      { success: true, config: updatedConfig },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) =>
        response.headers.set(k, v)
      );
    }

    return response;
  } catch (err) {
    console.error('Hybrid config PATCH error:', err);
    return ServerErrors.internal('hybrid_config_update');
  }
}

/**
 * DELETE /api/hybrid/config/[id]
 *
 * Delete a hybrid config.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { id } = await params;

    // Verify config exists
    const existingConfig = await getHybridConfig(id, userId);
    if (!existingConfig) {
      await logRequest(
        { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'DELETE', startTime },
        404
      );
      return NextResponse.json(
        { success: false, error: 'Config not found' },
        { status: 404 }
      );
    }

    await deleteHybridConfig(id, userId);

    await logRequest(
      { userId, keyId, endpoint: `/api/hybrid/config/${id}`, method: 'DELETE', startTime },
      200
    );

    const response = NextResponse.json(
      { success: true, message: 'Config deleted' },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) =>
        response.headers.set(k, v)
      );
    }

    return response;
  } catch (err) {
    console.error('Hybrid config DELETE error:', err);
    return ServerErrors.internal('hybrid_config_delete');
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
  }

  return null;
}
