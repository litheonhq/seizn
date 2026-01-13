/**
 * Metrics Collector
 * Collects and stores request metrics for SLO monitoring
 */

import type { LatencyMetric } from './types';
import { METRICS_CONFIG } from './config';

/**
 * In-memory metrics store
 * For production, consider using Redis or a time-series database
 */
class MetricsCollector {
  private latencyMetrics: LatencyMetric[] = [];
  private lastCleanup: number = Date.now();

  /**
   * Record a request metric
   */
  record(metric: Omit<LatencyMetric, 'timestamp'>): void {
    this.cleanup();

    this.latencyMetrics.push({
      ...metric,
      timestamp: Date.now(),
    });

    // Limit memory usage
    if (this.latencyMetrics.length > METRICS_CONFIG.maxDataPoints) {
      this.latencyMetrics = this.latencyMetrics.slice(-METRICS_CONFIG.maxDataPoints);
    }
  }

  /**
   * Get metrics within a time window
   */
  getMetrics(windowMs: number = METRICS_CONFIG.aggregationWindowMs): LatencyMetric[] {
    const now = Date.now();
    const windowStart = now - windowMs;
    return this.latencyMetrics.filter((m) => m.timestamp >= windowStart);
  }

  /**
   * Get all stored metrics (for debugging)
   */
  getAllMetrics(): LatencyMetric[] {
    return [...this.latencyMetrics];
  }

  /**
   * Calculate percentile from an array of numbers
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate aggregated metrics
   */
  aggregate(windowMs: number = METRICS_CONFIG.aggregationWindowMs) {
    const metrics = this.getMetrics(windowMs);
    const now = Date.now();
    const windowStart = now - windowMs;

    if (metrics.length === 0) {
      return {
        window: {
          start: windowStart,
          end: now,
          durationMs: windowMs,
        },
        latency: {
          p50: 0,
          p95: 0,
          p99: 0,
          avg: 0,
          count: 0,
        },
        errors: {
          total: 0,
          rate5xx: 0,
          count5xx: 0,
          count4xx: 0,
        },
        availability: {
          percentage: 100,
          totalRequests: 0,
          successfulRequests: 0,
        },
      };
    }

    const durations = metrics.map((m) => m.duration);
    const count5xx = metrics.filter((m) => m.statusCode >= 500).length;
    const count4xx = metrics.filter((m) => m.statusCode >= 400 && m.statusCode < 500).length;
    const successfulRequests = metrics.filter((m) => m.statusCode < 500).length;

    return {
      window: {
        start: windowStart,
        end: now,
        durationMs: windowMs,
      },
      latency: {
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        count: metrics.length,
      },
      errors: {
        total: count4xx + count5xx,
        rate5xx: metrics.length > 0 ? (count5xx / metrics.length) * 100 : 0,
        count5xx,
        count4xx,
      },
      availability: {
        percentage: metrics.length > 0 ? (successfulRequests / metrics.length) * 100 : 100,
        totalRequests: metrics.length,
        successfulRequests,
      },
    };
  }

  /**
   * Get endpoint-specific metrics
   */
  getEndpointMetrics(windowMs: number = METRICS_CONFIG.aggregationWindowMs) {
    const metrics = this.getMetrics(windowMs);
    const endpointMap = new Map<string, LatencyMetric[]>();

    for (const metric of metrics) {
      const key = `${metric.method} ${metric.endpoint}`;
      const existing = endpointMap.get(key) || [];
      existing.push(metric);
      endpointMap.set(key, existing);
    }

    const result: Record<string, {
      method: string;
      endpoint: string;
      count: number;
      avgLatency: number;
      p95Latency: number;
      errorRate: number;
    }> = {};

    for (const [key, endpointMetrics] of Array.from(endpointMap.entries())) {
      const durations = endpointMetrics.map((m) => m.duration);
      const errors = endpointMetrics.filter((m) => m.statusCode >= 500).length;

      result[key] = {
        method: endpointMetrics[0].method,
        endpoint: endpointMetrics[0].endpoint,
        count: endpointMetrics.length,
        avgLatency: durations.reduce((a, b) => a + b, 0) / durations.length,
        p95Latency: this.percentile(durations, 95),
        errorRate: (errors / endpointMetrics.length) * 100,
      };
    }

    return result;
  }

  /**
   * Cleanup old metrics
   */
  private cleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < METRICS_CONFIG.cleanupIntervalMs) {
      return;
    }

    this.lastCleanup = now;
    const cutoff = now - METRICS_CONFIG.retentionMs;
    this.latencyMetrics = this.latencyMetrics.filter((m) => m.timestamp >= cutoff);
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.latencyMetrics = [];
  }

  /**
   * Get metrics count
   */
  get count(): number {
    return this.latencyMetrics.length;
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

/**
 * Helper function to record a request metric
 */
export function recordMetric(
  endpoint: string,
  method: string,
  duration: number,
  statusCode: number
): void {
  // Skip excluded paths
  if (METRICS_CONFIG.excludedPaths.some((p) => endpoint.startsWith(p))) {
    return;
  }

  // Skip non-monitored methods
  if (!METRICS_CONFIG.monitoredMethods.includes(method)) {
    return;
  }

  metricsCollector.record({
    endpoint,
    method,
    duration,
    statusCode,
  });
}
