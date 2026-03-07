import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';
import { getStats } from '@/lib/summer/retops';
import type { TimePeriod } from '@/lib/summer/retops/types';

/**
 * GET /api/summer/retops/stats
 *
 * Get comprehensive retrieval statistics for the authenticated user.
 *
 * Query Parameters:
 * - period: Time period for stats (1h, 6h, 24h, 7d, 30d) - default: 24h
 * - collectionId: Filter by collection ID (optional)
 * - includeTopQueries: Include top queries list (true/false) - default: true
 * - topQueriesLimit: Number of top queries to return (1-50) - default: 10
 *
 * Response:
 * {
 *   "success": true,
 *   "stats": {
 *     "period": "24h",
 *     "startTime": "2024-01-01T00:00:00Z",
 *     "endTime": "2024-01-02T00:00:00Z",
 *     "queryVolume": {
 *       "total": 15000,
 *       "avgQps": 0.17,
 *       "peakQps": 2.5,
 *       "timeSeries": [...]
 *     },
 *     "searchTypes": {
 *       "vector": 5000,
 *       "keyword": 1000,
 *       "hybrid": 9000,
 *       "federated": 0
 *     },
 *     "topQueries": [...],
 *     "collectionBreakdown": [...],
 *     "embeddingUsage": {...},
 *     "rerankUsage": {...}
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
    const period = (searchParams.get('period') as TimePeriod) || '24h';
    const collectionId = searchParams.get('collectionId') || undefined;
    const includeTopQueries = searchParams.get('includeTopQueries') !== 'false';
    const topQueriesLimit = boundedInt(searchParams.get('topQueriesLimit'), 10, 1, 50);

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

    // Get stats
    const stats = await getStats(userId, {
      period,
      collectionId,
      includeTopQueries,
      topQueriesLimit,
    });

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/retops/stats', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        stats,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('RetOps stats error', err);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve stats',
        },
      },
      { status: 500 }
    );
  }
}
