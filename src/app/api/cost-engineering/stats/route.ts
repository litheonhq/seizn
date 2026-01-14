/**
 * Cost Engineering Stats API
 *
 * GET /api/cost-engineering/stats
 *
 * Returns cost engineering statistics including tier distribution,
 * cache stats, active recommendations, and cost savings.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { getCostEngineeringStats } from '@/lib/cost-engineering';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Authenticate request
  const authResult = await authenticateRequest(request);

  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId, rateLimitHeaders } = authResult;

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id') || undefined;

    // Get cost engineering stats
    const stats = await getCostEngineeringStats(userId, collectionId);

    // Log successful request
    await logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/cost-engineering/stats',
        method: 'GET',
        startTime,
      },
      200
    );

    const response = NextResponse.json({
      success: true,
      data: {
        user_id: stats.userId,
        collection_id: stats.collectionId,
        current_month: {
          cost_usd: stats.currentMonthCostUsd,
          savings_usd: stats.currentMonthSavingsUsd,
        },
        vectors: {
          total: stats.totalVectors,
          tier_distribution: {
            hot: stats.tierDistribution.hot,
            warm: stats.tierDistribution.warm,
            cold: stats.tierDistribution.cold,
          },
        },
        cache: {
          total_entries: stats.cacheStats.totalEntries,
          total_size_bytes: stats.cacheStats.totalSizeBytes,
          hit_rate: stats.cacheStats.hitRate,
          hit_count: stats.cacheStats.hitCount,
          miss_count: stats.cacheStats.missCount,
          avg_latency_savings_ms: stats.cacheStats.averageLatencySavingsMs,
        },
        optimization: {
          autopilot_enabled: stats.autopilotEnabled,
          active_recommendations: stats.activeRecommendations,
          last_optimization_at: stats.lastOptimizationAt,
        },
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
    console.error('Cost engineering stats error:', error);

    // Log failed request
    await logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/cost-engineering/stats',
        method: 'GET',
        startTime,
      },
      500
    );

    return ServerErrors.internal('cost_engineering_stats');
  }
}
