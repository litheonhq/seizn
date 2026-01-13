/**
 * SLO Monitoring Core
 * Evaluates metrics against SLO targets and generates reports
 */

import type { SLOStatus, SLOReport, AggregatedMetrics, AlertEvent } from './types';
import { SLO_TARGETS, ALERT_CONFIG, METRICS_CONFIG } from './config';
import { metricsCollector } from './collector';
import { alertManager } from './alerts';

/**
 * Check if a value breaches the SLO target
 */
function checkSLOBreach(
  value: number,
  target: number,
  comparison: 'lt' | 'lte' | 'gt' | 'gte'
): boolean {
  switch (comparison) {
    case 'lt':
      return value >= target;
    case 'lte':
      return value > target;
    case 'gt':
      return value <= target;
    case 'gte':
      return value < target;
    default:
      return false;
  }
}

/**
 * Determine status based on value and thresholds
 */
function determineStatus(
  value: number,
  target: number,
  comparison: 'lt' | 'lte' | 'gt' | 'gte'
): 'healthy' | 'warning' | 'critical' {
  const breached = checkSLOBreach(value, target, comparison);

  if (breached) {
    return 'critical';
  }

  // Calculate warning threshold (80% of the way to breach)
  const warningThresholdPercent = ALERT_CONFIG.warningThresholdPercent / 100;
  let warningThreshold: number;

  switch (comparison) {
    case 'lt':
    case 'lte':
      // For "less than" targets, warning is when approaching from below
      warningThreshold = target * warningThresholdPercent;
      if (value >= warningThreshold) {
        return 'warning';
      }
      break;
    case 'gt':
    case 'gte':
      // For "greater than" targets, warning is when dropping toward threshold
      // e.g., availability 99.9% target, warning at 99.92%
      const buffer = (100 - target) * (1 - warningThresholdPercent);
      warningThreshold = target + buffer;
      if (value <= warningThreshold) {
        return 'warning';
      }
      break;
  }

  return 'healthy';
}

/**
 * Evaluate P95 Latency SLO
 */
function evaluateP95Latency(metrics: AggregatedMetrics): SLOStatus {
  const { p95Latency } = SLO_TARGETS;
  const value = metrics.latency.p95;
  const breached = checkSLOBreach(value, p95Latency.target, p95Latency.comparison);

  return {
    metric: p95Latency.name,
    target: p95Latency.target,
    current: Math.round(value * 100) / 100,
    unit: p95Latency.unit,
    status: determineStatus(value, p95Latency.target, p95Latency.comparison),
    breached,
    comparison: p95Latency.comparison,
  };
}

/**
 * Evaluate 5xx Error Rate SLO
 */
function evaluateErrorRate5xx(metrics: AggregatedMetrics): SLOStatus {
  const { errorRate5xx } = SLO_TARGETS;
  const value = metrics.errors.rate5xx;
  const breached = checkSLOBreach(value, errorRate5xx.target, errorRate5xx.comparison);

  return {
    metric: errorRate5xx.name,
    target: errorRate5xx.target,
    current: Math.round(value * 10000) / 10000,
    unit: errorRate5xx.unit,
    status: determineStatus(value, errorRate5xx.target, errorRate5xx.comparison),
    breached,
    comparison: errorRate5xx.comparison,
  };
}

/**
 * Evaluate API Availability SLO
 */
function evaluateAvailability(metrics: AggregatedMetrics): SLOStatus {
  const { availability } = SLO_TARGETS;
  const value = metrics.availability.percentage;
  const breached = checkSLOBreach(value, availability.target, availability.comparison);

  return {
    metric: availability.name,
    target: availability.target,
    current: Math.round(value * 10000) / 10000,
    unit: availability.unit,
    status: determineStatus(value, availability.target, availability.comparison),
    breached,
    comparison: availability.comparison,
  };
}

/**
 * Determine overall health from individual SLO statuses
 */
function determineOverallHealth(slos: {
  p95Latency: SLOStatus;
  errorRate5xx: SLOStatus;
  availability: SLOStatus;
}): 'healthy' | 'degraded' | 'critical' {
  const statuses = [slos.p95Latency.status, slos.errorRate5xx.status, slos.availability.status];

  if (statuses.includes('critical')) {
    return 'critical';
  }

  if (statuses.includes('warning')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Generate SLO alerts for breached or warning statuses
 */
async function generateAlerts(
  slos: { p95Latency: SLOStatus; errorRate5xx: SLOStatus; availability: SLOStatus },
  timestamp: string
): Promise<AlertEvent[]> {
  const alerts: AlertEvent[] = [];

  for (const [key, slo] of Object.entries(slos)) {
    if (slo.status === 'critical' || slo.status === 'warning') {
      const alert: AlertEvent = {
        id: `${key}-${Date.now()}`,
        type: slo.breached ? 'slo_breach' : 'threshold_warning',
        metric: slo.metric,
        message: slo.breached
          ? `SLO BREACH: ${slo.metric} is ${slo.current}${slo.unit} (target: ${slo.comparison === 'lt' || slo.comparison === 'lte' ? '<' : '>'} ${slo.target}${slo.unit})`
          : `WARNING: ${slo.metric} approaching threshold at ${slo.current}${slo.unit} (target: ${slo.comparison === 'lt' || slo.comparison === 'lte' ? '<' : '>'} ${slo.target}${slo.unit})`,
        severity: slo.status === 'critical' ? 'critical' : 'warning',
        timestamp,
        value: slo.current,
        threshold: slo.target,
      };

      alerts.push(alert);

      // Send Telegram notification
      if (ALERT_CONFIG.enabled) {
        await alertManager.sendAlert(alert);
      }
    }
  }

  return alerts;
}

/**
 * Generate complete SLO report
 */
export async function generateSLOReport(
  windowMs: number = METRICS_CONFIG.aggregationWindowMs
): Promise<SLOReport> {
  const metrics = metricsCollector.aggregate(windowMs);
  const timestamp = new Date().toISOString();

  const slos = {
    p95Latency: evaluateP95Latency(metrics),
    errorRate5xx: evaluateErrorRate5xx(metrics),
    availability: evaluateAvailability(metrics),
  };

  const overallHealth = determineOverallHealth(slos);
  const alerts = await generateAlerts(slos, timestamp);

  return {
    timestamp,
    window: {
      start: new Date(metrics.window.start).toISOString(),
      end: new Date(metrics.window.end).toISOString(),
      durationMs: metrics.window.durationMs,
    },
    metrics,
    slos,
    overallHealth,
    alerts,
  };
}

/**
 * Quick health check (no alerts)
 */
export function getSLOStatus(windowMs: number = METRICS_CONFIG.aggregationWindowMs): {
  healthy: boolean;
  metrics: AggregatedMetrics;
  slos: { p95Latency: SLOStatus; errorRate5xx: SLOStatus; availability: SLOStatus };
} {
  const metrics = metricsCollector.aggregate(windowMs);

  const slos = {
    p95Latency: evaluateP95Latency(metrics),
    errorRate5xx: evaluateErrorRate5xx(metrics),
    availability: evaluateAvailability(metrics),
  };

  const healthy = !slos.p95Latency.breached && !slos.errorRate5xx.breached && !slos.availability.breached;

  return {
    healthy,
    metrics,
    slos,
  };
}

/**
 * Get SLO targets (for reference)
 */
export function getSLOTargets() {
  return SLO_TARGETS;
}
