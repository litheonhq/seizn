/**
 * Redis-based Metrics Persistence
 *
 * Optional Redis storage for metrics persistence across server restarts.
 * Falls back to in-memory storage if Redis is not configured.
 */

import { getRedis } from '@/lib/redis';
import type { LatencyMetric, AggregatedMetrics } from './types';
import { METRICS_CONFIG } from './config';

// Redis key prefixes
const REDIS_KEYS = {
  METRICS_LIST: 'seizn:metrics:latency',
  METRICS_AGGREGATED: 'seizn:metrics:aggregated',
  SLO_STATUS: 'seizn:slo:status',
  ALERT_HISTORY: 'seizn:alerts:history',
};

// Default TTL: 1 hour (matches METRICS_CONFIG.retentionMs)
const DEFAULT_TTL = 3600;

/**
 * Redis Metrics Store
 */
export class RedisMetricsStore {
  private isAvailable: boolean = false;

  constructor() {
    this.checkAvailability();
  }

  /**
   * Check if Redis is available
   */
  private async checkAvailability(): Promise<void> {
    try {
      const redis = getRedis();
      this.isAvailable = redis !== null;
    } catch {
      this.isAvailable = false;
    }
  }

  /**
   * Check if Redis metrics store is available
   */
  get available(): boolean {
    return this.isAvailable;
  }

  /**
   * Store a metric data point
   */
  async recordMetric(metric: LatencyMetric): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      // Use sorted set with timestamp as score for efficient time-based queries
      await redis.zadd(REDIS_KEYS.METRICS_LIST, {
        score: metric.timestamp,
        member: JSON.stringify(metric),
      });

      // Set expiration on the key
      await redis.expire(REDIS_KEYS.METRICS_LIST, DEFAULT_TTL);

      // Cleanup old entries (keep only within retention period)
      const cutoff = Date.now() - METRICS_CONFIG.retentionMs;
      await redis.zremrangebyscore(REDIS_KEYS.METRICS_LIST, 0, cutoff);

      return true;
    } catch (error) {
      console.error('[Redis Metrics] Failed to record metric:', error);
      return false;
    }
  }

  /**
   * Get metrics within a time window
   */
  async getMetrics(windowMs: number = METRICS_CONFIG.aggregationWindowMs): Promise<LatencyMetric[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get all metrics within the time window using zrange with BYSCORE
      const results = await redis.zrange(
        REDIS_KEYS.METRICS_LIST,
        windowStart,
        now,
        { byScore: true }
      );

      return (results as unknown[]).map((item) => {
        if (typeof item === 'string') {
          return JSON.parse(item) as LatencyMetric;
        }
        return item as LatencyMetric;
      });
    } catch (error) {
      console.error('[Redis Metrics] Failed to get metrics:', error);
      return [];
    }
  }

  /**
   * Store aggregated metrics snapshot
   */
  async storeAggregatedMetrics(metrics: AggregatedMetrics): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      // Store with timestamp key for historical tracking
      const key = `${REDIS_KEYS.METRICS_AGGREGATED}:${Date.now()}`;
      await redis.set(key, JSON.stringify(metrics), { ex: DEFAULT_TTL });

      // Also update current snapshot
      await redis.set(
        `${REDIS_KEYS.METRICS_AGGREGATED}:current`,
        JSON.stringify(metrics),
        { ex: 300 } // 5 minute TTL for current snapshot
      );

      return true;
    } catch (error) {
      console.error('[Redis Metrics] Failed to store aggregated metrics:', error);
      return false;
    }
  }

  /**
   * Get current aggregated metrics snapshot
   */
  async getAggregatedMetrics(): Promise<AggregatedMetrics | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
      const result = await redis.get<AggregatedMetrics>(
        `${REDIS_KEYS.METRICS_AGGREGATED}:current`
      );
      return result;
    } catch (error) {
      console.error('[Redis Metrics] Failed to get aggregated metrics:', error);
      return null;
    }
  }

  /**
   * Store SLO status for monitoring
   */
  async storeSLOStatus(slos: Record<string, unknown>): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      await redis.set(REDIS_KEYS.SLO_STATUS, JSON.stringify({
        ...slos,
        timestamp: new Date().toISOString(),
      }), { ex: 300 });

      return true;
    } catch (error) {
      console.error('[Redis Metrics] Failed to store SLO status:', error);
      return false;
    }
  }

  /**
   * Get current SLO status
   */
  async getSLOStatus(): Promise<Record<string, unknown> | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
      const result = await redis.get<Record<string, unknown>>(REDIS_KEYS.SLO_STATUS);
      return result;
    } catch (error) {
      console.error('[Redis Metrics] Failed to get SLO status:', error);
      return null;
    }
  }

  /**
   * Store alert in history
   */
  async recordAlert(alert: {
    metric: string;
    type: string;
    severity: string;
    timestamp: string;
  }): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      await redis.zadd(REDIS_KEYS.ALERT_HISTORY, {
        score: Date.now(),
        member: JSON.stringify(alert),
      });

      // Keep only last 100 alerts
      await redis.zremrangebyrank(REDIS_KEYS.ALERT_HISTORY, 0, -101);

      return true;
    } catch (error) {
      console.error('[Redis Metrics] Failed to record alert:', error);
      return false;
    }
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit: number = 10): Promise<Array<Record<string, unknown>>> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      const results = await redis.zrange(
        REDIS_KEYS.ALERT_HISTORY,
        -limit,
        -1,
        { rev: true }
      );

      return results.map((item) => {
        if (typeof item === 'string') {
          return JSON.parse(item) as Record<string, unknown>;
        }
        return item as Record<string, unknown>;
      });
    } catch (error) {
      console.error('[Redis Metrics] Failed to get recent alerts:', error);
      return [];
    }
  }

  /**
   * Get metrics count
   */
  async getMetricsCount(): Promise<number> {
    const redis = getRedis();
    if (!redis) return 0;

    try {
      return await redis.zcard(REDIS_KEYS.METRICS_LIST);
    } catch (error) {
      console.error('[Redis Metrics] Failed to get metrics count:', error);
      return 0;
    }
  }

  /**
   * Clear all metrics (for testing)
   */
  async clear(): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      await redis.del(REDIS_KEYS.METRICS_LIST);
      await redis.del(`${REDIS_KEYS.METRICS_AGGREGATED}:current`);
      await redis.del(REDIS_KEYS.SLO_STATUS);
      return true;
    } catch (error) {
      console.error('[Redis Metrics] Failed to clear metrics:', error);
      return false;
    }
  }
}

// Singleton instance
export const redisMetricsStore = new RedisMetricsStore();

/**
 * Helper function to record metric with Redis fallback
 */
export async function recordMetricWithPersistence(
  metric: Omit<LatencyMetric, 'timestamp'>
): Promise<void> {
  const fullMetric: LatencyMetric = {
    ...metric,
    timestamp: Date.now(),
  };

  // Try Redis first
  const stored = await redisMetricsStore.recordMetric(fullMetric);

  if (!stored) {
    // Fallback: Redis not available, metric will only be in memory
    console.debug('[Metrics] Redis not available, metric stored in memory only');
  }
}

/**
 * Sync in-memory metrics to Redis (for hybrid mode)
 */
export async function syncMetricsToRedis(metrics: LatencyMetric[]): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  let syncedCount = 0;

  for (const metric of metrics) {
    const success = await redisMetricsStore.recordMetric(metric);
    if (success) syncedCount++;
  }

  return syncedCount;
}
