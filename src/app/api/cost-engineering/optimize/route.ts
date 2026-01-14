/**
 * Cost Engineering Optimize API
 *
 * POST /api/cost-engineering/optimize
 *
 * Triggers manual optimization for cost engineering.
 * Analyzes usage patterns and applies optimization recommendations.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { runOptimization } from '@/lib/cost-engineering';
import type { RecommendationType } from '@/lib/cost-engineering';

interface OptimizeRequestBody {
  collection_id?: string;
  types?: RecommendationType[];
  dry_run?: boolean;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Authenticate request
  const authResult = await authenticateRequest(request);

  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId, rateLimitHeaders } = authResult;

  try {
    // Parse request body
    let body: OptimizeRequestBody = {};
    try {
      const rawBody = await request.text();
      if (rawBody) {
        body = JSON.parse(rawBody);
      }
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate types if provided
    const validTypes: RecommendationType[] = [
      "caching",
      "tiering",
      "query_optimization",
      "model_selection",
    ];

    if (body.types) {
      if (!Array.isArray(body.types)) {
        return ValidationErrors.invalidField('types', 'must be an array');
      }

      for (const type of body.types) {
        if (!validTypes.includes(type)) {
          return ValidationErrors.invalidValue(
            'types',
            type,
            `one of: ${validTypes.join(', ')}`
          );
        }
      }
    }

    // Run optimization
    const result = await runOptimization(userId, {
      collectionId: body.collection_id,
      types: body.types,
      dryRun: body.dry_run ?? false,
    });

    // Log successful request
    await logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/cost-engineering/optimize',
        method: 'POST',
        startTime,
      },
      200
    );

    const response = NextResponse.json({
      success: true,
      data: {
        dry_run: body.dry_run ?? false,
        recommendations_analyzed: result.recommendations.length,
        actions_taken: result.actions,
        actions: result.actions.map((action) => ({
          type: action.type,
          description: action.target,
          impact_level: action.status,
          estimated_savings_usd: action.savingsUsd,
          applied: action.status === "success",
          error: action.error,
        })),
        summary: {
          total_savings_usd: result.totalSavingsUsd,
          vectors_migrated: result.actions.filter(a => a.type === "migrate_tier").length,
          cache_entries_affected: result.actions.filter(a => a.type === "adjust_cache_ttl").length,
        },
        executed_at: result.durationMs,
      },
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error) {
    console.error('Cost engineering optimize error:', error);

    // Log failed request
    await logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/cost-engineering/optimize',
        method: 'POST',
        startTime,
      },
      500
    );

    return ServerErrors.internal('cost_engineering_optimize');
  }
}
