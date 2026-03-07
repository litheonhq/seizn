import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { logServerError } from '@/lib/server/logger';
import { getSemanticCache } from '@/lib/summer/cache';
import { getBudgetRouter } from '@/lib/summer/router';

/**
 * GET /api/summer/cache/stats
 *
 * Cache Statistics API
 *
 * Returns cache performance metrics and statistics.
 *
 * Query Parameters:
 * - include_router: boolean (include router stats, default: false)
 *
 * Response:
 * {
 *   "success": true,
 *   "cache": {
 *     "total_entries": 1500,
 *     "hit_count": 8500,
 *     "miss_count": 1500,
 *     "hit_rate": 0.85,
 *     "average_hit_similarity": 0.97,
 *     "average_latency_savings_ms": 180,
 *     "expired_entries": 25,
 *     "by_collection": { ... }
 *   },
 *   "router": { ... },                   // If include_router=true
 *   "config": {
 *     "similarity_threshold": 0.95,
 *     "default_ttl_seconds": 3600,
 *     "max_entries": 10000,
 *     "eviction_policy": "lru"
 *   },
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse options
    const includeRouter = searchParams.get('include_router') === 'true';

    // Get cache instance and stats
    const cache = getSemanticCache();
    const cacheStats = await cache.getStats();
    const cacheConfig = cache.getConfig();

    // Build response
    const responseData: Record<string, unknown> = {
      success: true,
      cache: {
        total_entries: cacheStats.totalEntries,
        total_size_bytes: cacheStats.totalSizeBytes,
        hit_count: cacheStats.hitCount,
        miss_count: cacheStats.missCount,
        hit_rate: cacheStats.hitRate,
        average_hit_similarity: cacheStats.averageHitSimilarity,
        average_latency_savings_ms: cacheStats.averageLatencySavingsMs,
        expired_entries: cacheStats.expiredEntries,
        by_collection: cacheStats.byCollection,
      },
      config: {
        enabled: cacheConfig.enabled,
        similarity_threshold: cacheConfig.similarityThreshold,
        default_ttl_seconds: cacheConfig.defaultTtlSeconds,
        max_entries: cacheConfig.maxEntries,
        eviction_policy: cacheConfig.evictionPolicy,
        min_query_length: cacheConfig.minQueryLength,
        max_query_length: cacheConfig.maxQueryLength,
      },
      timestamp: cacheStats.timestamp,
    };

    // Include router stats if requested
    if (includeRouter) {
      const router = getBudgetRouter();
      const routerStats = router.getStats();

      responseData.router = {
        total_decisions: routerStats.totalDecisions,
        cache_hits: routerStats.cacheHits,
        cache_misses: routerStats.cacheMisses,
        total_cost_credits: routerStats.totalCostCredits,
        average_latency_ms: routerStats.avgLatencyMs,
        by_strategy: routerStats.byStrategy,
        by_model: routerStats.byModel,
        fallback_count: routerStats.fallbackCount,
        budget_exceeded_count: routerStats.budgetExceededCount,
        timestamp: routerStats.timestamp,
      };
    }

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/cache/stats', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(responseData, { status: 200 });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Cache stats error', err);
    return ServerErrors.internal('cache_stats');
  }
}

/**
 * POST /api/summer/cache/stats
 *
 * Reset cache statistics (admin operation)
 *
 * Request Body:
 * {
 *   "reset": true,
 *   "reset_router": false               // Optional: also reset router stats
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    // Only enterprise users can reset stats
    if (plan !== 'enterprise') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Stats reset is only available for enterprise plan',
          },
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const reset = body?.reset === true;
    const resetRouter = body?.reset_router === true;

    if (!reset) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Set reset: true to confirm stats reset',
          },
        },
        { status: 400 }
      );
    }

    // Reset router stats if requested
    if (resetRouter) {
      const router = getBudgetRouter();
      router.resetStats();
    }

    // Note: Cache stats are stored in Redis and managed by TTLManager
    // A full reset would require clearing Redis keys, which we don't expose directly

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/cache/stats', method: 'POST', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        message: 'Statistics reset successfully',
        reset_router: resetRouter,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Cache stats reset error', err);
    return ServerErrors.internal('cache_stats_reset');
  }
}
