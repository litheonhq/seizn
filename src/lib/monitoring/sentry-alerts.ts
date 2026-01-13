/**
 * Sentry Alerts Integration for SLO Monitoring
 *
 * Integrates SLO monitoring with Sentry for:
 * - Custom performance metrics
 * - Error rate tracking
 * - Latency monitoring with spans
 * - Alert rules configuration
 */

import * as Sentry from '@sentry/nextjs';
import type { SLOStatus, AlertEvent } from './types';
import { SLO_TARGETS } from './config';

/**
 * Sentry Alert Thresholds
 * These can be configured in Sentry Dashboard -> Alerts -> Metric Alerts
 */
export const SENTRY_ALERT_THRESHOLDS = {
  // P95 Latency Alert
  p95Latency: {
    metric: 'transaction.duration',
    threshold: SLO_TARGETS.p95Latency.target,
    timeWindow: 5, // minutes
    alertWhen: 'above',
  },

  // 5xx Error Rate Alert
  errorRate5xx: {
    metric: 'event.type:error',
    threshold: SLO_TARGETS.errorRate5xx.target,
    timeWindow: 5, // minutes
    alertWhen: 'above',
  },

  // Availability Alert (inverse of error rate)
  availability: {
    metric: 'transaction.failure_rate',
    threshold: (100 - SLO_TARGETS.availability.target) / 100, // Convert to failure rate
    timeWindow: 5, // minutes
    alertWhen: 'above',
  },
};

/**
 * Custom SLO metrics for Sentry
 */
export const SLO_METRIC_NAMES = {
  P95_LATENCY: 'seizn.slo.p95_latency_ms',
  ERROR_RATE_5XX: 'seizn.slo.error_rate_5xx_percent',
  AVAILABILITY: 'seizn.slo.availability_percent',
  MEMORY_OP_LATENCY: 'seizn.memory.operation_latency_ms',
  QUERY_LATENCY: 'seizn.query.latency_ms',
  REQUEST_COUNT: 'seizn.requests.total',
};

/**
 * Record SLO metrics to Sentry
 */
export function recordSLOMetric(
  metricName: string,
  value: number,
  tags?: Record<string, string>
): void {
  try {
    // Use Sentry.setTag for context instead of deprecated metrics API
    Sentry.withScope((scope) => {
      scope.setTag('metric.name', metricName);
      scope.setTag('environment', process.env.NODE_ENV || 'development');

      if (tags) {
        Object.entries(tags).forEach(([key, val]) => {
          scope.setTag(`metric.${key}`, val);
        });
      }

      scope.setExtra('metric.value', value);
      scope.setExtra('metric.timestamp', new Date().toISOString());
    });

    // Also use the newer metrics API if available
    if (typeof Sentry.metrics?.gauge === 'function') {
      Sentry.metrics.gauge(metricName, value, {
        unit: 'none',
      });
    }
  } catch (error) {
    console.warn('[Sentry Metrics] Failed to record metric:', error);
  }
}

/**
 * Record latency metric with operation type
 */
export function recordLatencyMetric(
  operation: 'memory' | 'query' | 'embedding' | 'rerank' | 'api',
  durationMs: number,
  endpoint?: string
): void {
  const metricName =
    operation === 'memory'
      ? SLO_METRIC_NAMES.MEMORY_OP_LATENCY
      : operation === 'query'
        ? SLO_METRIC_NAMES.QUERY_LATENCY
        : SLO_METRIC_NAMES.P95_LATENCY;

  recordSLOMetric(metricName, durationMs, {
    operation,
    ...(endpoint && { endpoint }),
  });
}

/**
 * Record error to Sentry with SLO context
 */
export function recordSLOError(
  error: Error,
  context: {
    endpoint: string;
    operation: string;
    durationMs?: number;
    statusCode?: number;
  }
): void {
  Sentry.withScope((scope) => {
    scope.setTag('slo.operation', context.operation);
    scope.setTag('slo.endpoint', context.endpoint);

    if (context.statusCode) {
      scope.setTag('slo.status_code', context.statusCode.toString());
    }

    if (context.durationMs) {
      scope.setExtra('slo.duration_ms', context.durationMs);
    }

    scope.setLevel('error');
    Sentry.captureException(error);
  });
}

/**
 * Report SLO status to Sentry
 */
export function reportSLOStatus(slos: {
  p95Latency: SLOStatus;
  errorRate5xx: SLOStatus;
  availability: SLOStatus;
}): void {
  // Record individual SLO metrics
  recordSLOMetric(SLO_METRIC_NAMES.P95_LATENCY, slos.p95Latency.current, {
    status: slos.p95Latency.status,
    breached: slos.p95Latency.breached.toString(),
  });

  recordSLOMetric(SLO_METRIC_NAMES.ERROR_RATE_5XX, slos.errorRate5xx.current, {
    status: slos.errorRate5xx.status,
    breached: slos.errorRate5xx.breached.toString(),
  });

  recordSLOMetric(SLO_METRIC_NAMES.AVAILABILITY, slos.availability.current, {
    status: slos.availability.status,
    breached: slos.availability.breached.toString(),
  });

  // Report breaches as Sentry issues
  for (const [key, slo] of Object.entries(slos)) {
    if (slo.breached) {
      Sentry.captureMessage(`SLO Breach: ${slo.metric}`, {
        level: 'error',
        tags: {
          'slo.metric': key,
          'slo.status': slo.status,
          'slo.breached': 'true',
        },
        extra: {
          current: slo.current,
          target: slo.target,
          unit: slo.unit,
          comparison: slo.comparison,
        },
      });
    }
  }
}

/**
 * Send SLO alert event to Sentry
 */
export function sendSentryAlert(alert: AlertEvent): void {
  Sentry.withScope((scope) => {
    scope.setTag('alert.type', alert.type);
    scope.setTag('alert.metric', alert.metric);
    scope.setTag('alert.severity', alert.severity);

    scope.setExtra('alert.value', alert.value);
    scope.setExtra('alert.threshold', alert.threshold);
    scope.setExtra('alert.timestamp', alert.timestamp);

    const level = alert.severity === 'critical' ? 'error' : 'warning';
    scope.setLevel(level);

    Sentry.captureMessage(alert.message, level);
  });
}

/**
 * Create a Sentry transaction for SLO-monitored operations
 */
export function createSLOTransaction(
  name: string,
  operation: string
): Sentry.Span | undefined {
  return Sentry.startInactiveSpan({
    name,
    op: operation,
    attributes: {
      'slo.monitored': true,
    },
  });
}

/**
 * Wrap an async operation with Sentry SLO monitoring
 */
export async function withSentryMonitoring<T>(
  operation: string,
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();

  return Sentry.startSpan(
    {
      name: `SLO: ${operation}`,
      op: `slo.${operation}`,
      attributes: {
        'slo.endpoint': endpoint,
        'slo.monitored': true,
      },
    },
    async (span) => {
      try {
        const result = await fn();
        const durationMs = performance.now() - startTime;

        // Record successful operation
        recordLatencyMetric(operation as 'memory' | 'query' | 'api', durationMs, endpoint);
        span?.setStatus({ code: 1, message: 'ok' });

        return result;
      } catch (error) {
        const durationMs = performance.now() - startTime;

        // Record error
        recordSLOError(error instanceof Error ? error : new Error(String(error)), {
          endpoint,
          operation,
          durationMs,
          statusCode: 500,
        });

        span?.setStatus({ code: 2, message: 'error' });
        throw error;
      }
    }
  );
}

/**
 * Sentry Alert Rules Configuration Guide
 *
 * To set up alerts in Sentry Dashboard:
 *
 * 1. Navigate to: Settings -> Alerts -> Create Alert Rule
 *
 * 2. P95 Latency Alert:
 *    - Metric: transaction.duration.p95
 *    - Filter: transaction.name:* (all transactions)
 *    - Threshold: > 500ms
 *    - Time Window: 5 minutes
 *    - Actions: Send notification
 *
 * 3. Error Rate Alert:
 *    - Alert Type: Issue Alert
 *    - Condition: Event frequency > N in 5 minutes
 *    - Filter: is:unresolved level:error
 *    - Actions: Send notification
 *
 * 4. Custom SLO Metric Alert:
 *    - Metric Type: Custom
 *    - Metric: seizn.slo.*
 *    - Configure thresholds based on SLO_TARGETS
 */
export const SENTRY_ALERT_RULES_CONFIG = {
  p95LatencyAlert: {
    name: 'Seizn P95 Latency SLO Breach',
    alertType: 'metric_alert',
    aggregate: 'p95(transaction.duration)',
    query: 'transaction.op:http.server',
    timeWindow: 5,
    threshold: SLO_TARGETS.p95Latency.target,
    thresholdType: 'above',
    resolveThreshold: SLO_TARGETS.p95Latency.target * 0.8,
    actions: [
      {
        type: 'slack',
        channel: '#seizn-alerts',
      },
      {
        type: 'email',
        targetType: 'team',
      },
    ],
  },

  errorRateAlert: {
    name: 'Seizn 5xx Error Rate SLO Breach',
    alertType: 'metric_alert',
    aggregate: 'percentage()',
    query: 'http.status_code:>=500',
    timeWindow: 5,
    threshold: SLO_TARGETS.errorRate5xx.target,
    thresholdType: 'above',
    resolveThreshold: SLO_TARGETS.errorRate5xx.target * 0.5,
    actions: [
      {
        type: 'slack',
        channel: '#seizn-alerts',
      },
      {
        type: 'pagerduty',
        severity: 'critical',
      },
    ],
  },

  availabilityAlert: {
    name: 'Seizn Availability SLO Breach',
    alertType: 'metric_alert',
    aggregate: 'failure_rate()',
    query: 'transaction.op:http.server',
    timeWindow: 5,
    threshold: (100 - SLO_TARGETS.availability.target) / 100,
    thresholdType: 'above',
    resolveThreshold: ((100 - SLO_TARGETS.availability.target) / 100) * 0.5,
    actions: [
      {
        type: 'slack',
        channel: '#seizn-alerts',
      },
      {
        type: 'pagerduty',
        severity: 'critical',
      },
    ],
  },

  memoryOperationLatencyAlert: {
    name: 'Seizn Memory Operation Latency',
    alertType: 'metric_alert',
    aggregate: 'p95()',
    query: `metric:${SLO_METRIC_NAMES.MEMORY_OP_LATENCY}`,
    timeWindow: 5,
    threshold: 500, // Memory operations should be < 500ms
    thresholdType: 'above',
    actions: [
      {
        type: 'slack',
        channel: '#seizn-alerts',
      },
    ],
  },
};
