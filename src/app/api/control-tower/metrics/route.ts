/**
 * Control Tower Metrics API
 *
 * GET /api/control-tower/metrics
 * Returns dashboard metrics and time series data
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { getDashboardMetrics, getMetricSeries } from '@/lib/control-tower';
import type { TimeRange } from '@/lib/control-tower/types';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('org_id') || undefined;

    // Parse time range
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const granularity = url.searchParams.get('granularity') || '1h';

    // Validate granularity
    const validGranularities = ['1m', '5m', '15m', '1h', '6h', '1d'];
    if (!validGranularities.includes(granularity)) {
      return ValidationErrors.invalidField('granularity', `Must be one of: ${validGranularities.join(', ')}`);
    }

    const timeRange: TimeRange | undefined = start && end
      ? {
          start,
          end,
          granularity: granularity as TimeRange['granularity'],
        }
      : undefined;

    // Check if requesting specific metric series
    const metricName = url.searchParams.get('metric');

    if (metricName && timeRange) {
      const series = await getMetricSeries(metricName, timeRange, userId, organizationId);
      return NextResponse.json({
        success: true,
        data: series,
      });
    }

    // Return dashboard metrics
    const metrics = await getDashboardMetrics(userId, organizationId, timeRange);

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (err) {
    logServerError('Control Tower metrics error', err);
    return ServerErrors.internal('control_tower_metrics');
  }
}
