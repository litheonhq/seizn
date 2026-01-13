/**
 * SLO Monitoring API Endpoint
 *
 * GET /api/monitoring/slo
 * Returns current SLO status and metrics for dashboard
 *
 * Query Parameters:
 * - window: Time window in minutes (default: 5)
 * - detailed: Include endpoint-level metrics (default: false)
 * - format: Response format (json, prometheus)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateSLOReport,
  getSLOTargets,
  metricsCollector,
} from '@/lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const windowMinutes = parseInt(searchParams.get('window') || '5', 10);
    const windowMs = Math.min(windowMinutes, 60) * 60 * 1000; // Max 60 minutes
    const detailed = searchParams.get('detailed') === 'true';
    const format = searchParams.get('format') || 'json';

    // Generate report (includes alerting)
    const report = await generateSLOReport(windowMs);

    // Prometheus format
    if (format === 'prometheus') {
      const prometheusMetrics = generatePrometheusMetrics(report);
      return new NextResponse(prometheusMetrics, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4',
          'Cache-Control': 'no-store',
        },
      });
    }

    // JSON format (default)
    const response: Record<string, unknown> = {
      status: report.overallHealth,
      timestamp: report.timestamp,
      window: report.window,
      slos: report.slos,
      metrics: {
        latency: report.metrics.latency,
        errors: report.metrics.errors,
        availability: report.metrics.availability,
      },
      alerts: report.alerts,
      targets: getSLOTargets(),
    };

    // Add detailed endpoint metrics if requested
    if (detailed) {
      response.endpoints = metricsCollector.getEndpointMetrics(windowMs);
      response.rawMetricsCount = metricsCollector.count;
    }

    return NextResponse.json(response, {
      status: report.overallHealth === 'critical' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-SLO-Status': report.overallHealth,
      },
    });
  } catch (error) {
    console.error('[SLO API] Error generating report:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate SLO report',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate Prometheus-compatible metrics output
 */
function generatePrometheusMetrics(report: Awaited<ReturnType<typeof generateSLOReport>>): string {
  const lines: string[] = [
    '# HELP seizn_api_latency_p95_ms P95 latency in milliseconds',
    '# TYPE seizn_api_latency_p95_ms gauge',
    `seizn_api_latency_p95_ms ${report.metrics.latency.p95}`,
    '',
    '# HELP seizn_api_latency_p99_ms P99 latency in milliseconds',
    '# TYPE seizn_api_latency_p99_ms gauge',
    `seizn_api_latency_p99_ms ${report.metrics.latency.p99}`,
    '',
    '# HELP seizn_api_latency_avg_ms Average latency in milliseconds',
    '# TYPE seizn_api_latency_avg_ms gauge',
    `seizn_api_latency_avg_ms ${report.metrics.latency.avg}`,
    '',
    '# HELP seizn_api_requests_total Total number of API requests',
    '# TYPE seizn_api_requests_total counter',
    `seizn_api_requests_total ${report.metrics.latency.count}`,
    '',
    '# HELP seizn_api_errors_5xx_total Total number of 5xx errors',
    '# TYPE seizn_api_errors_5xx_total counter',
    `seizn_api_errors_5xx_total ${report.metrics.errors.count5xx}`,
    '',
    '# HELP seizn_api_errors_4xx_total Total number of 4xx errors',
    '# TYPE seizn_api_errors_4xx_total counter',
    `seizn_api_errors_4xx_total ${report.metrics.errors.count4xx}`,
    '',
    '# HELP seizn_api_error_rate_5xx_percent 5xx error rate percentage',
    '# TYPE seizn_api_error_rate_5xx_percent gauge',
    `seizn_api_error_rate_5xx_percent ${report.metrics.errors.rate5xx}`,
    '',
    '# HELP seizn_api_availability_percent API availability percentage',
    '# TYPE seizn_api_availability_percent gauge',
    `seizn_api_availability_percent ${report.metrics.availability.percentage}`,
    '',
    '# HELP seizn_slo_p95_latency_healthy SLO status (1=healthy, 0=breached)',
    '# TYPE seizn_slo_p95_latency_healthy gauge',
    `seizn_slo_p95_latency_healthy ${report.slos.p95Latency.breached ? 0 : 1}`,
    '',
    '# HELP seizn_slo_error_rate_healthy SLO status (1=healthy, 0=breached)',
    '# TYPE seizn_slo_error_rate_healthy gauge',
    `seizn_slo_error_rate_healthy ${report.slos.errorRate5xx.breached ? 0 : 1}`,
    '',
    '# HELP seizn_slo_availability_healthy SLO status (1=healthy, 0=breached)',
    '# TYPE seizn_slo_availability_healthy gauge',
    `seizn_slo_availability_healthy ${report.slos.availability.breached ? 0 : 1}`,
    '',
    '# HELP seizn_slo_overall_health Overall SLO health (2=healthy, 1=degraded, 0=critical)',
    '# TYPE seizn_slo_overall_health gauge',
    `seizn_slo_overall_health ${report.overallHealth === 'healthy' ? 2 : report.overallHealth === 'degraded' ? 1 : 0}`,
    '',
  ];

  return lines.join('\n');
}
