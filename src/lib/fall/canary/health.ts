/**
 * Canary Health Monitor
 *
 * Monitors deployment health and triggers automatic rollback
 * when thresholds are exceeded.
 */

import type {
  CanaryDeployment,
  CanaryConfig,
  DeploymentMetrics,
  MetricThreshold,
  CanaryMetricType,
  HealthCheckResult,
  MetricCheck,
  RollbackReason,
  RecordResultRequest,
} from './types';
import { DEFAULT_CANARY_CONFIG } from './types';

// ============================================
// Metrics Collection
// ============================================

/**
 * Latency bucket for percentile calculation
 */
interface LatencyBucket {
  values: number[];
  maxSize: number;
}

/**
 * In-memory metrics collector
 */
class MetricsCollector {
  private deploymentMetrics: Map<string, {
    baseline: DeploymentMetrics;
    canary: DeploymentMetrics;
    baselineLatencies: LatencyBucket;
    canaryLatencies: LatencyBucket;
  }> = new Map();

  /**
   * Initialize metrics for a deployment
   */
  initialize(deploymentId: string): void {
    if (!this.deploymentMetrics.has(deploymentId)) {
      const now = new Date().toISOString();
      this.deploymentMetrics.set(deploymentId, {
        baseline: { ...createEmptyMetrics(now) },
        canary: { ...createEmptyMetrics(now) },
        baselineLatencies: { values: [], maxSize: 1000 },
        canaryLatencies: { values: [], maxSize: 1000 },
      });
    }
  }

  /**
   * Record a request result
   */
  recordResult(request: RecordResultRequest): void {
    const data = this.deploymentMetrics.get(request.deploymentId);
    if (!data) return;

    const metrics = request.version === 'baseline' ? data.baseline : data.canary;
    const latencies = request.version === 'baseline'
      ? data.baselineLatencies
      : data.canaryLatencies;

    // Update counts
    metrics.totalRequests++;
    if (request.success) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }

    // Update error rate
    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;

    // Update latencies
    latencies.values.push(request.latencyMs);
    if (latencies.values.length > latencies.maxSize) {
      latencies.values.shift();
    }

    // Calculate percentiles
    const sorted = [...latencies.values].sort((a, b) => a - b);
    const len = sorted.length;
    metrics.avgLatencyMs = sorted.reduce((a, b) => a + b, 0) / len;
    metrics.p50LatencyMs = sorted[Math.floor(len * 0.5)] || 0;
    metrics.p95LatencyMs = sorted[Math.floor(len * 0.95)] || 0;
    metrics.p99LatencyMs = sorted[Math.floor(len * 0.99)] || 0;

    // Update quality scores
    if (request.qualityScore !== undefined) {
      const prevAvg = metrics.avgQualityScore || 0;
      const prevCount = metrics.totalRequests - 1;
      metrics.avgQualityScore = (prevAvg * prevCount + request.qualityScore) / metrics.totalRequests;
    }
    if (request.groundedness !== undefined) {
      const prevAvg = metrics.avgGroundedness || 0;
      const prevCount = metrics.totalRequests - 1;
      metrics.avgGroundedness = (prevAvg * prevCount + request.groundedness) / metrics.totalRequests;
    }

    metrics.lastUpdatedAt = new Date().toISOString();
  }

  /**
   * Get metrics for a deployment
   */
  getMetrics(deploymentId: string): { baseline: DeploymentMetrics; canary: DeploymentMetrics } | null {
    const data = this.deploymentMetrics.get(deploymentId);
    if (!data) return null;
    return { baseline: data.baseline, canary: data.canary };
  }

  /**
   * Get metric value by type
   */
  getMetricValue(deploymentId: string, version: 'baseline' | 'canary', metric: CanaryMetricType): number | null {
    const data = this.deploymentMetrics.get(deploymentId);
    if (!data) return null;

    const metrics = version === 'baseline' ? data.baseline : data.canary;

    switch (metric) {
      case 'error_rate':
        return metrics.errorRate;
      case 'latency_p50':
        return metrics.p50LatencyMs;
      case 'latency_p95':
        return metrics.p95LatencyMs;
      case 'latency_p99':
        return metrics.p99LatencyMs;
      case 'success_rate':
        return 1 - metrics.errorRate;
      case 'quality_score':
        return metrics.avgQualityScore || null;
      case 'groundedness':
        return metrics.avgGroundedness || null;
      default:
        return null;
    }
  }

  /**
   * Get sample count
   */
  getSampleCount(deploymentId: string, version: 'baseline' | 'canary'): number {
    const data = this.deploymentMetrics.get(deploymentId);
    if (!data) return 0;
    const metrics = version === 'baseline' ? data.baseline : data.canary;
    return metrics.totalRequests;
  }

  /**
   * Clear metrics for a deployment
   */
  clear(deploymentId: string): void {
    this.deploymentMetrics.delete(deploymentId);
  }
}

/**
 * Create empty metrics
 */
function createEmptyMetrics(timestamp: string): DeploymentMetrics {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    lastUpdatedAt: timestamp,
  };
}

// Global metrics collector instance
export const metricsCollector = new MetricsCollector();

// ============================================
// Health Check
// ============================================

/**
 * Consecutive failure tracking
 */
const consecutiveFailures = new Map<string, number>();

/**
 * Perform health check on a deployment
 */
export function performHealthCheck(
  deployment: CanaryDeployment,
  config: CanaryConfig
): HealthCheckResult {
  const timestamp = new Date().toISOString();
  const checks: MetricCheck[] = [];
  let shouldRollback = false;
  let rollbackReason: RollbackReason | undefined;

  // Check each threshold
  for (const threshold of config.rollbackThresholds) {
    const check = checkMetricThreshold(deployment.id, 'canary', threshold);
    checks.push(check);

    if (!check.passed) {
      shouldRollback = true;
      rollbackReason = getReasonForMetric(threshold.metric);
    }
  }

  // Compare canary vs baseline
  const comparisonCheck = compareWithBaseline(deployment, config);
  if (comparisonCheck && !comparisonCheck.passed) {
    checks.push(comparisonCheck);
    shouldRollback = true;
    rollbackReason = 'quality_degradation';
  }

  // Update consecutive failures
  const deploymentKey = deployment.id;
  let failures = consecutiveFailures.get(deploymentKey) || 0;

  if (shouldRollback) {
    failures++;
  } else {
    failures = 0;
  }
  consecutiveFailures.set(deploymentKey, failures);

  // Only trigger rollback after grace period / max failures
  const actuallyRollback = failures >= config.maxConsecutiveFailures;

  return {
    deploymentId: deployment.id,
    timestamp,
    healthy: !shouldRollback,
    checks,
    consecutiveFailures: failures,
    shouldRollback: actuallyRollback && config.autoRollbackEnabled,
    rollbackReason: actuallyRollback ? rollbackReason : undefined,
  };
}

/**
 * Check a single metric threshold
 */
function checkMetricThreshold(
  deploymentId: string,
  version: 'baseline' | 'canary',
  threshold: MetricThreshold
): MetricCheck {
  const value = metricsCollector.getMetricValue(deploymentId, version, threshold.metric);
  const sampleCount = metricsCollector.getSampleCount(deploymentId, version);

  // Not enough samples
  if (value === null || sampleCount < threshold.minSamples) {
    return {
      metric: threshold.metric,
      value: value || 0,
      threshold: threshold.threshold,
      operator: threshold.operator,
      passed: true, // Pass if not enough data
      sampleCount,
    };
  }

  // Check threshold
  let passed: boolean;
  switch (threshold.operator) {
    case 'gt':
      passed = value <= threshold.threshold;
      break;
    case 'lt':
      passed = value >= threshold.threshold;
      break;
    case 'gte':
      passed = value < threshold.threshold;
      break;
    case 'lte':
      passed = value > threshold.threshold;
      break;
    default:
      passed = true;
  }

  return {
    metric: threshold.metric,
    value,
    threshold: threshold.threshold,
    operator: threshold.operator,
    passed,
    sampleCount,
  };
}

/**
 * Compare canary metrics with baseline
 */
function compareWithBaseline(
  deployment: CanaryDeployment,
  config: CanaryConfig
): MetricCheck | null {
  const baselineErrorRate = metricsCollector.getMetricValue(deployment.id, 'baseline', 'error_rate');
  const canaryErrorRate = metricsCollector.getMetricValue(deployment.id, 'canary', 'error_rate');
  const canarySamples = metricsCollector.getSampleCount(deployment.id, 'canary');
  const baselineSamples = metricsCollector.getSampleCount(deployment.id, 'baseline');

  // Need minimum samples from both
  if (
    baselineErrorRate === null ||
    canaryErrorRate === null ||
    canarySamples < 10 ||
    baselineSamples < 10
  ) {
    return null;
  }

  // Allow 2x baseline error rate as threshold
  const threshold = Math.max(baselineErrorRate * 2, 0.01);
  const passed = canaryErrorRate <= threshold;

  return {
    metric: 'error_rate',
    value: canaryErrorRate,
    threshold,
    operator: 'lte',
    passed,
    sampleCount: canarySamples,
  };
}

/**
 * Get rollback reason for a metric type
 */
function getReasonForMetric(metric: CanaryMetricType): RollbackReason {
  switch (metric) {
    case 'error_rate':
    case 'success_rate':
      return 'error_threshold_exceeded';
    case 'latency_p50':
    case 'latency_p95':
    case 'latency_p99':
      return 'latency_threshold_exceeded';
    case 'quality_score':
    case 'groundedness':
      return 'quality_degradation';
    default:
      return 'health_check_failed';
  }
}

/**
 * Clear health state for a deployment
 */
export function clearHealthState(deploymentId: string): void {
  consecutiveFailures.delete(deploymentId);
  metricsCollector.clear(deploymentId);
}

// ============================================
// Rollback Utilities
// ============================================

/**
 * Check if deployment should be promoted to next stage
 */
export function shouldPromote(
  deployment: CanaryDeployment,
  config: CanaryConfig
): { shouldPromote: boolean; reason: string } {
  // Check status
  if (deployment.status !== 'rolling_out' && deployment.status !== 'monitoring') {
    return { shouldPromote: false, reason: 'Deployment not active' };
  }

  // Check minimum samples
  const canarySamples = metricsCollector.getSampleCount(deployment.id, 'canary');
  if (canarySamples < config.minSamplesPerStage) {
    return {
      shouldPromote: false,
      reason: `Insufficient samples: ${canarySamples}/${config.minSamplesPerStage}`,
    };
  }

  // Check wait time
  const lastPromotion = deployment.lastPromotedAt || deployment.startedAt;
  const elapsed = Date.now() - new Date(lastPromotion).getTime();
  const waitMs = config.stageWaitSeconds * 1000;

  if (elapsed < waitMs) {
    const remaining = Math.ceil((waitMs - elapsed) / 1000);
    return {
      shouldPromote: false,
      reason: `Wait time not elapsed: ${remaining}s remaining`,
    };
  }

  // Check health
  const healthResult = performHealthCheck(deployment, config);
  if (!healthResult.healthy) {
    return {
      shouldPromote: false,
      reason: `Health check failed: ${healthResult.checks.filter(c => !c.passed).map(c => c.metric).join(', ')}`,
    };
  }

  return { shouldPromote: true, reason: 'Ready for promotion' };
}

/**
 * Generate rollback report
 */
export function generateRollbackReport(
  deployment: CanaryDeployment,
  reason: RollbackReason,
  healthResult: HealthCheckResult
): string {
  const lines = [
    `Canary Rollback Report`,
    `=====================`,
    ``,
    `Deployment ID: ${deployment.id}`,
    `Rolled back at: ${new Date().toISOString()}`,
    `Reason: ${reason}`,
    ``,
    `Health Check Results:`,
    `-------------------`,
  ];

  for (const check of healthResult.checks) {
    const status = check.passed ? '✓' : '✗';
    lines.push(`${status} ${check.metric}: ${check.value.toFixed(4)} (threshold: ${check.threshold}, samples: ${check.sampleCount})`);
  }

  lines.push(``, `Consecutive Failures: ${healthResult.consecutiveFailures}`);

  const metrics = metricsCollector.getMetrics(deployment.id);
  if (metrics) {
    lines.push(``, `Canary Metrics:`, `-------------`);
    lines.push(`Total Requests: ${metrics.canary.totalRequests}`);
    lines.push(`Error Rate: ${(metrics.canary.errorRate * 100).toFixed(2)}%`);
    lines.push(`P95 Latency: ${metrics.canary.p95LatencyMs.toFixed(0)}ms`);

    lines.push(``, `Baseline Metrics:`, `----------------`);
    lines.push(`Total Requests: ${metrics.baseline.totalRequests}`);
    lines.push(`Error Rate: ${(metrics.baseline.errorRate * 100).toFixed(2)}%`);
    lines.push(`P95 Latency: ${metrics.baseline.p95LatencyMs.toFixed(0)}ms`);
  }

  return lines.join('\n');
}
