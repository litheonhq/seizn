import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { getQualityMetrics, getQualityTrend } from '@/lib/summer/retops';
import type { TimePeriod } from '@/lib/summer/retops/types';

/**
 * GET /api/summer/retops/quality
 *
 * Get search quality metrics for the authenticated user.
 *
 * Query Parameters:
 * - period: Time period for metrics (1h, 6h, 24h, 7d, 30d) - default: 24h
 * - collectionId: Filter by collection ID (optional)
 * - includeTrend: Include quality trend data (true/false) - default: false
 *
 * Response:
 * {
 *   "success": true,
 *   "quality": {
 *     "mrr": 0.75,
 *     "ndcg": 0.68,
 *     "precisionAtK": { "p1": 0.85, "p3": 0.72, "p5": 0.65, "p10": 0.55 },
 *     "recallAtK": { "r1": 0.35, "r3": 0.55, "r5": 0.68, "r10": 0.82 },
 *     "groundedness": 0.88,
 *     "rerankImprovement": 0.12
 *   },
 *   "trend": [
 *     { "timestamp": "2024-01-01T00:00:00Z", "mrr": 0.74, "ndcg": 0.67, "groundedness": 0.87 },
 *     ...
 *   ]
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
    const includeTrend = searchParams.get('includeTrend') === 'true';

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

    // Get quality metrics
    const quality = await getQualityMetrics(userId, {
      period,
      collectionId,
    });

    // Get trend if requested
    let trend = null;
    if (includeTrend) {
      trend = await getQualityTrend(userId, {
        period,
        collectionId,
      });
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/retops/quality', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        quality,
        trend,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('RetOps quality error:', err);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve quality metrics',
        },
      },
      { status: 500 }
    );
  }
}
