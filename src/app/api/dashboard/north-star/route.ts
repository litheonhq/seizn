import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getNorthStarMetrics, NorthStarMetrics } from '@/lib/metrics/north-star';
import { logServerError } from '@/lib/server/logger';

// GET /api/dashboard/north-star - Get North Star metrics
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get('organizationId') || undefined;
    const period = searchParams.get('period') || '30d';

    // Calculate time range based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '14d':
        startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    const timeRange = {
      start: startDate,
      end: now,
      label: period,
    };

    // Fetch metrics
    let metrics: NorthStarMetrics;

    try {
      metrics = await getNorthStarMetrics(organizationId, timeRange);
    } catch (metricsError) {
      logServerError('Error fetching metrics', metricsError);
      // Return placeholder metrics if calculation fails
      metrics = createPlaceholderMetrics();
    }

    return NextResponse.json({
      success: true,
      metrics,
      period,
    });
  } catch (error) {
    logServerError('North Star metrics error', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Create placeholder metrics for when real data is unavailable
function createPlaceholderMetrics(): NorthStarMetrics {
  return {
    ttft: {
      p75Minutes: null,
      p50Minutes: null,
      sampleSize: 0,
      trend: 'insufficient_data',
      target: 15,
    },
    ttd: {
      averageMinutes: null,
      medianMinutes: null,
      sampleSize: 0,
      trend: 'insufficient_data',
      target: 30,
    },
    costPredictability: {
      overrunsBlocked: 0,
      totalBudgetChecks: 0,
      blockRate: 0,
      savingsEstimate: 0,
      trend: 'insufficient_data',
    },
    regressionRate: {
      detectionsThisPeriod: 0,
      rollbacksThisPeriod: 0,
      totalEvals: 0,
      detectionRate: 0,
      trend: 'insufficient_data',
    },
    lastUpdated: new Date().toISOString(),
  };
}
