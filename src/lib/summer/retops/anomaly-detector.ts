/**
 * RetOps Anomaly Detector
 *
 * Detects anomalies in retrieval operation metrics using statistical methods.
 */

import type {
  Anomaly,
  AnomalyDetectionConfig,
  AlertSeverity,
  RetOpsAlert,
  AlertType,
  AlertThreshold,
  TimePeriod,
} from './types';
import { getMetrics, getTimeSeries } from './metrics-collector';

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: AnomalyDetectionConfig = {
  enabled: true,
  metrics: ['qps', 'latency_p99', 'error_rate', 'cache_hit_rate'],
  sensitivity: 5,
  baselineWindowHours: 24,
  minDataPoints: 10,
};

const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { metric: 'latency_p99', warning: 500, critical: 1000, operator: 'gt', windowMinutes: 5 },
  { metric: 'error_rate', warning: 0.01, critical: 0.05, operator: 'gt', windowMinutes: 5 },
  { metric: 'qps_spike', warning: 2, critical: 5, operator: 'gt', windowMinutes: 1 },
  { metric: 'cache_hit_rate', warning: 0.5, critical: 0.3, operator: 'lt', windowMinutes: 15 },
];

const PERIOD_TO_MS: Record<TimePeriod, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// ============================================
// In-Memory Store
// ============================================

interface AnomalyStore {
  anomalies: Map<string, Anomaly[]>;
  alerts: Map<string, RetOpsAlert[]>;
  baselines: Map<string, Map<string, MetricBaseline>>;
}

interface MetricBaseline {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  updatedAt: number;
}

const anomalyStore: AnomalyStore = {
  anomalies: new Map(),
  alerts: new Map(),
  baselines: new Map(),
};

// ============================================
// Statistical Functions
// ============================================

/**
 * Calculate mean of an array of numbers
 */
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean?: number): number {
  if (values.length < 2) return 0;
  const m = mean ?? calculateMean(values);
  const squaredDiffs = values.map(v => Math.pow(v - m, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate Z-score for a value given mean and standard deviation
 */
function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Calculate Interquartile Range (IQR) for outlier detection
 */
function calculateIQR(values: number[]): { q1: number; q3: number; iqr: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  const q1 = sorted[Math.floor(len * 0.25)];
  const q3 = sorted[Math.floor(len * 0.75)];
  const iqr = q3 - q1;

  return { q1, q3, iqr };
}

/**
 * Check if value is an outlier using IQR method
 */
function isOutlier(value: number, q1: number, q3: number, iqr: number, multiplier: number = 1.5): boolean {
  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;
  return value < lowerBound || value > upperBound;
}

// ============================================
// Baseline Management
// ============================================

/**
 * Update baseline for a metric
 */
function updateBaseline(
  userId: string,
  metric: string,
  values: number[]
): MetricBaseline {
  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values, mean);
  const sorted = [...values].sort((a, b) => a - b);

  const baseline: MetricBaseline = {
    mean,
    stdDev,
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    updatedAt: Date.now(),
  };

  if (!anomalyStore.baselines.has(userId)) {
    anomalyStore.baselines.set(userId, new Map());
  }
  anomalyStore.baselines.get(userId)!.set(metric, baseline);

  return baseline;
}

/**
 * Get baseline for a metric
 */
function getBaseline(userId: string, metric: string): MetricBaseline | null {
  return anomalyStore.baselines.get(userId)?.get(metric) || null;
}

// ============================================
// Anomaly Detection Functions
// ============================================

/**
 * Detect anomalies using Z-score method
 */
function detectZScoreAnomalies(
  values: number[],
  baseline: MetricBaseline,
  sensitivity: number
): { index: number; value: number; zScore: number }[] {
  const anomalies: { index: number; value: number; zScore: number }[] = [];

  // Sensitivity 1-10 maps to Z-score threshold 4-1.5
  const zThreshold = 4 - (sensitivity - 1) * (2.5 / 9);

  values.forEach((value, index) => {
    const zScore = calculateZScore(value, baseline.mean, baseline.stdDev);
    if (Math.abs(zScore) > zThreshold) {
      anomalies.push({ index, value, zScore });
    }
  });

  return anomalies;
}

/**
 * Detect anomalies using IQR method
 */
function detectIQRAnomalies(
  values: number[],
  sensitivity: number
): { index: number; value: number }[] {
  if (values.length < 4) return [];

  const { q1, q3, iqr } = calculateIQR(values);

  // Sensitivity 1-10 maps to IQR multiplier 3-1
  const multiplier = 3 - (sensitivity - 1) * (2 / 9);

  const anomalies: { index: number; value: number }[] = [];
  values.forEach((value, index) => {
    if (isOutlier(value, q1, q3, iqr, multiplier)) {
      anomalies.push({ index, value });
    }
  });

  return anomalies;
}

/**
 * Detect spike in metric (sudden increase)
 */
function detectSpike(
  current: number,
  baseline: MetricBaseline,
  spikeMultiplier: number = 2
): boolean {
  if (baseline.mean === 0) return false;
  return current > baseline.mean * spikeMultiplier;
}

/**
 * Detect degradation in metric (value below expected)
 */
function detectDegradation(
  current: number,
  baseline: MetricBaseline,
  degradationThreshold: number = 0.5
): boolean {
  if (baseline.mean === 0) return false;
  return current < baseline.mean * degradationThreshold;
}

// ============================================
// Main Detection Functions
// ============================================

/**
 * Run anomaly detection for a user
 */
export async function detectAnomalies(
  userId: string,
  config: Partial<AnomalyDetectionConfig> = {}
): Promise<Anomaly[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    return [];
  }

  const detectedAnomalies: Anomaly[] = [];

  try {
    // Get time series data for analysis
    const timeSeries = await getTimeSeries(userId, { period: '1h', granularity: '1m' });

    // Analyze each configured metric
    for (const metric of cfg.metrics) {
      const values = getMetricValues(metric, timeSeries);

      if (values.length < cfg.minDataPoints) {
        continue;
      }

      // Get or create baseline
      let baseline = getBaseline(userId, metric);
      if (!baseline || Date.now() - baseline.updatedAt > cfg.baselineWindowHours * 60 * 60 * 1000) {
        baseline = updateBaseline(userId, metric, values.slice(0, -10)); // Use older data for baseline
      }

      // Run detection
      const zScoreAnomalies = detectZScoreAnomalies(values, baseline, cfg.sensitivity);

      for (const anomalyData of zScoreAnomalies) {
        const anomaly = createAnomaly(
          metric,
          baseline.mean,
          anomalyData.value,
          anomalyData.zScore
        );
        detectedAnomalies.push(anomaly);
      }
    }

    // Store anomalies
    if (detectedAnomalies.length > 0) {
      if (!anomalyStore.anomalies.has(userId)) {
        anomalyStore.anomalies.set(userId, []);
      }
      const userAnomalies = anomalyStore.anomalies.get(userId)!;
      userAnomalies.push(...detectedAnomalies);

      // Keep only recent anomalies
      if (userAnomalies.length > 1000) {
        userAnomalies.splice(0, userAnomalies.length - 1000);
      }
    }

    return detectedAnomalies;
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return [];
  }
}

/**
 * Get metric values from time series data
 */
function getMetricValues(
  metric: string,
  timeSeries: { qps: number[]; latencyP50: number[]; latencyP99: number[]; errorRate: number[]; cacheHitRate: number[] }
): number[] {
  switch (metric) {
    case 'qps':
      return timeSeries.qps;
    case 'latency_p50':
      return timeSeries.latencyP50;
    case 'latency_p99':
      return timeSeries.latencyP99;
    case 'error_rate':
      return timeSeries.errorRate;
    case 'cache_hit_rate':
      return timeSeries.cacheHitRate;
    default:
      return [];
  }
}

/**
 * Create an anomaly object
 */
function createAnomaly(
  metric: string,
  expectedValue: number,
  actualValue: number,
  deviationScore: number
): Anomaly {
  const severity = getSeverityFromDeviation(deviationScore);
  const { cause, action } = getAnomalyContext(metric, expectedValue, actualValue);

  return {
    id: `anom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    metric,
    detectedAt: new Date().toISOString(),
    expectedValue: Math.round(expectedValue * 1000) / 1000,
    actualValue: Math.round(actualValue * 1000) / 1000,
    deviationScore: Math.round(deviationScore * 100) / 100,
    severity,
    possibleCause: cause,
    recommendedAction: action,
  };
}

/**
 * Get severity level based on deviation score
 */
function getSeverityFromDeviation(deviationScore: number): AlertSeverity {
  const absDeviation = Math.abs(deviationScore);
  if (absDeviation > 4) return 'critical';
  if (absDeviation > 2.5) return 'warning';
  return 'info';
}

/**
 * Get context-specific information for an anomaly
 */
function getAnomalyContext(
  metric: string,
  expected: number,
  actual: number
): { cause: string; action: string } {
  const isHigher = actual > expected;

  switch (metric) {
    case 'qps':
      return isHigher
        ? {
            cause: 'Unusual traffic spike detected',
            action: 'Check for bot traffic or viral content; consider rate limiting',
          }
        : {
            cause: 'Significant drop in traffic',
            action: 'Verify service health; check for upstream issues',
          };

    case 'latency_p99':
    case 'latency_p50':
      return isHigher
        ? {
            cause: 'Elevated latency detected',
            action: 'Check vector store health; review recent index changes',
          }
        : {
            cause: 'Unusually low latency',
            action: 'Verify results quality; check cache effectiveness',
          };

    case 'error_rate':
      return isHigher
        ? {
            cause: 'Error rate spike detected',
            action: 'Check error logs; verify API key status and rate limits',
          }
        : {
            cause: 'Error rate lower than baseline',
            action: 'No action required; consider updating baseline',
          };

    case 'cache_hit_rate':
      return isHigher
        ? {
            cause: 'Cache effectiveness increased',
            action: 'No action required; consider adjusting cache size',
          }
        : {
            cause: 'Cache hit rate degradation',
            action: 'Review query patterns; check semantic cache threshold',
          };

    default:
      return {
        cause: 'Metric deviation detected',
        action: 'Review metric details and recent changes',
      };
  }
}

// ============================================
// Alert Management
// ============================================

/**
 * Check thresholds and create alerts
 */
export async function checkThresholds(
  userId: string,
  thresholds: AlertThreshold[] = DEFAULT_THRESHOLDS
): Promise<RetOpsAlert[]> {
  const newAlerts: RetOpsAlert[] = [];

  try {
    const metrics = await getMetrics(userId, { period: '1h' });

    for (const threshold of thresholds) {
      const value = getMetricValue(threshold.metric, metrics);
      if (value === null) continue;

      const exceeded = checkThreshold(value, threshold);

      if (exceeded) {
        const severity = determineSeverity(value, threshold);
        const alert = createAlert(threshold.metric, threshold, value, severity);
        newAlerts.push(alert);
      }
    }

    // Store alerts
    if (newAlerts.length > 0) {
      if (!anomalyStore.alerts.has(userId)) {
        anomalyStore.alerts.set(userId, []);
      }
      anomalyStore.alerts.get(userId)!.push(...newAlerts);
    }

    return newAlerts;
  } catch (error) {
    console.error('Threshold check error:', error);
    return [];
  }
}

/**
 * Get metric value from metrics object
 */
function getMetricValue(
  metric: string,
  metrics: { qps: number; latency: { p99: number; p50: number }; errors: { rate: number }; cache: { hitRate: number } }
): number | null {
  switch (metric) {
    case 'qps':
    case 'qps_spike':
      return metrics.qps;
    case 'latency_p99':
      return metrics.latency.p99;
    case 'latency_p50':
      return metrics.latency.p50;
    case 'error_rate':
      return metrics.errors.rate;
    case 'cache_hit_rate':
      return metrics.cache.hitRate;
    default:
      return null;
  }
}

/**
 * Check if value exceeds threshold
 */
function checkThreshold(value: number, threshold: AlertThreshold): boolean {
  switch (threshold.operator) {
    case 'gt':
      return value > threshold.warning;
    case 'gte':
      return value >= threshold.warning;
    case 'lt':
      return value < threshold.warning;
    case 'lte':
      return value <= threshold.warning;
    default:
      return false;
  }
}

/**
 * Determine alert severity based on threshold levels
 */
function determineSeverity(value: number, threshold: AlertThreshold): AlertSeverity {
  const isCritical =
    threshold.operator === 'gt' || threshold.operator === 'gte'
      ? value >= threshold.critical
      : value <= threshold.critical;

  return isCritical ? 'critical' : 'warning';
}

/**
 * Create an alert object
 */
function createAlert(
  metric: string,
  threshold: AlertThreshold,
  currentValue: number,
  severity: AlertSeverity
): RetOpsAlert {
  const alertType = getAlertType(metric);

  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: alertType,
    severity,
    status: 'active',
    title: getAlertTitle(alertType, severity),
    message: getAlertMessage(metric, currentValue, threshold),
    metric,
    threshold: severity === 'critical' ? threshold.critical : threshold.warning,
    currentValue: Math.round(currentValue * 1000) / 1000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get alert type from metric name
 */
function getAlertType(metric: string): AlertType {
  switch (metric) {
    case 'latency_p99':
    case 'latency_p50':
      return 'high_latency';
    case 'error_rate':
      return 'error_rate_spike';
    case 'qps':
    case 'qps_spike':
      return 'qps_spike';
    case 'cache_hit_rate':
      return 'cache_degradation';
    default:
      return 'anomaly_detected';
  }
}

/**
 * Get human-readable alert title
 */
function getAlertTitle(type: AlertType, severity: AlertSeverity): string {
  const prefix = severity === 'critical' ? '[CRITICAL]' : '[WARNING]';

  switch (type) {
    case 'high_latency':
      return `${prefix} High Latency Detected`;
    case 'error_rate_spike':
      return `${prefix} Error Rate Spike`;
    case 'qps_spike':
      return `${prefix} Traffic Spike Detected`;
    case 'cache_degradation':
      return `${prefix} Cache Performance Degradation`;
    default:
      return `${prefix} Anomaly Detected`;
  }
}

/**
 * Get alert message
 */
function getAlertMessage(metric: string, value: number, threshold: AlertThreshold): string {
  const thresholdValue = threshold.warning;
  const operator = threshold.operator === 'gt' || threshold.operator === 'gte' ? 'above' : 'below';

  return `${metric} is ${operator} threshold: current value ${value.toFixed(3)}, threshold ${thresholdValue}`;
}

// ============================================
// Alert Query Functions
// ============================================

/**
 * Get alerts for a user
 */
export async function getAlerts(
  userId: string,
  params: { status?: string; severity?: string; limit?: number } = {}
): Promise<{ alerts: RetOpsAlert[]; activeCount: number; acknowledgedCount: number }> {
  let alerts = anomalyStore.alerts.get(userId) || [];

  // Filter by status
  if (params.status) {
    alerts = alerts.filter(a => a.status === params.status);
  }

  // Filter by severity
  if (params.severity) {
    alerts = alerts.filter(a => a.severity === params.severity);
  }

  // Sort by createdAt descending
  alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Apply limit
  if (params.limit) {
    alerts = alerts.slice(0, params.limit);
  }

  // Count by status
  const allAlerts = anomalyStore.alerts.get(userId) || [];
  const activeCount = allAlerts.filter(a => a.status === 'active').length;
  const acknowledgedCount = allAlerts.filter(a => a.status === 'acknowledged').length;

  return { alerts, activeCount, acknowledgedCount };
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  userId: string,
  alertId: string,
  acknowledgedBy: string
): Promise<boolean> {
  const alerts = anomalyStore.alerts.get(userId);
  if (!alerts) return false;

  const alert = alerts.find(a => a.id === alertId);
  if (!alert) return false;

  alert.status = 'acknowledged';
  alert.acknowledgedBy = acknowledgedBy;
  alert.acknowledgedAt = new Date().toISOString();
  alert.updatedAt = new Date().toISOString();

  return true;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(userId: string, alertId: string): Promise<boolean> {
  const alerts = anomalyStore.alerts.get(userId);
  if (!alerts) return false;

  const alert = alerts.find(a => a.id === alertId);
  if (!alert) return false;

  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  alert.updatedAt = new Date().toISOString();

  return true;
}

// ============================================
// Export Store for Testing
// ============================================

export { anomalyStore, DEFAULT_CONFIG, DEFAULT_THRESHOLDS };
