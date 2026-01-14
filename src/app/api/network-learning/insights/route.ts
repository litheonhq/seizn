/**
 * Network Learning Insights API
 *
 * GET: Get aggregated insights
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  getInsights,
  analyzeTrends,
} from '@/lib/network-learning';
import type { AggregationPeriod, InsightsResponse } from '@/lib/network-learning';

// GET /api/network-learning/insights
// Query params:
// - period: daily | weekly | monthly (default: weekly)
// - limit: number (default: 50, max: 100)
// - cluster: string (optional query cluster filter)
// - includeTrends: boolean (default: false)
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { searchParams } = new URL(request.url);

    // Parse period
    const periodParam = searchParams.get('period') ?? 'weekly';
    const validPeriods: AggregationPeriod[] = ['daily', 'weekly', 'monthly'];

    if (!validPeriods.includes(periodParam as AggregationPeriod)) {
      return ValidationErrors.invalidValue('period', periodParam, 'daily | weekly | monthly');
    }

    const period = periodParam as AggregationPeriod;

    // Parse limit
    const limitParam = searchParams.get('limit');
    let limit = 50;

    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return ValidationErrors.invalidValue('limit', limitParam, 'positive integer');
      }
      limit = Math.min(parsedLimit, 100); // Max 100
    }

    // Parse cluster filter
    const cluster = searchParams.get('cluster') ?? undefined;

    // Parse includeTrends
    const includeTrends = searchParams.get('includeTrends') === 'true';

    // Get insights
    const insights = await getInsights({
      period,
      queryCluster: cluster,
      limit,
    });

    const response: InsightsResponse & {
      trends?: Awaited<ReturnType<typeof analyzeTrends>>;
    } = {
      success: true,
      insights,
      period,
      totalCount: insights.length,
    };

    // Include trends if requested
    if (includeTrends) {
      try {
        const trends = await analyzeTrends(period);
        response.trends = trends;
      } catch (trendError) {
        console.error('Failed to analyze trends:', trendError);
        // Continue without trends
      }
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Network learning insights GET error:', err);
    return ServerErrors.internal('insights_get');
  }
}
