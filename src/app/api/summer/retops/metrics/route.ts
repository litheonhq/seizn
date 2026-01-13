import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { getMetrics, getTimeSeries } from '@/lib/summer/retops';
import type { TimePeriod, TimeGranularity } from '@/lib/summer/retops/types';

/**
 * GET /api/summer/retops/metrics
 *
 * Get RetOps metrics snapshot for the authenticated user.
 *
 * Query Parameters:
 * - period: Time period for metrics (1h, 6h, 24h, 7d, 30d) - default: 1h
 * - collectionId: Filter by collection ID (optional)
 * - granularity: Granularity for time series (1m, 5m, 15m, 1h, 1d) - optional
 * - includeTimeSeries: Include time series data (true/false) - default: true
 *
 * Response:
 * {
 *   "success": true,
 *   "metrics": {
 *     "timestamp": "2024-01-01T00:00:00Z",
 *     "userId": "user_xxx",
 *     "qps": 1.25,
 *     "totalQueries": 1500,
 *     "latency": { "p50": 45, "p75": 78, "p90": 120, "p95": 180, "p99": 350, "avg": 65, "max": 890 },
 *     "cache": { "hits": 800, "misses": 700, "hitRate": 0.533, "semanticHitRate": 0.426, "avgTimeSavedMs": 58 },
 *     "errors": { "total": 12, "rate": 0.008, "byType": { "RATE_LIMIT": 8, "NOT_FOUND": 4 } },
 *     "quality": { "mrr": 0.75, "ndcg": 0.68, ... }
 *   },
 *   "timeSeries": {
 *     "timestamps": [...],
 *     "qps": [...],
 *     "latencyP50": [...],
 *     "latencyP99": [...],
 *     "errorRate": [...],
 *     "cacheHitRate": [...]
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get('period') as TimePeriod) || '1h';
    const collectionId = searchParams.get('collectionId') || undefined;
    const granularity = (searchParams.get('granularity') as TimeGranularity) || undefined;
    const includeTimeSeries = searchParams.get('includeTimeSeries') !== 'false';

    // Validate period
    const validPeriods: TimePeriod[] = ['1h', '6h', '24h', '7d', '30d'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Get metrics
    const metrics = await getMetrics(userId, {
      period,
      collectionId,
      granularity,
    });

    // Get time series if requested
    let timeSeries = null;
    if (includeTimeSeries) {
      timeSeries = await getTimeSeries(userId, {
        period,
        collectionId,
        granularity,
      });
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/retops/metrics', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        metrics,
        timeSeries,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('RetOps metrics error:', err);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve metrics',
        },
      },
      { status: 500 }
    );
  }
}
