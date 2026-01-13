/**
 * RetOps Metrics Collector
 *
 * Collects, aggregates, and provides retrieval operation metrics.
 */

import type {
  RetOpsMetrics,
  RetrievalStats,
  LatencyMetrics,
  CacheMetrics,
  ErrorMetrics,
  QueryVolumeStats,
  SearchTypeStats,
  TopQuery,
  CollectionStats,
  EmbeddingUsageStats,
  RerankUsageStats,
  TimeSeriesPoint,
  TimeSeriesData,
  TimePeriod,
  TimeGranularity,
  MetricsQueryParams,
  StatsQueryParams,
} from './types';

// ============================================
// Constants
// ============================================

const PERIOD_TO_MS: Record<TimePeriod, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const GRANULARITY_TO_MS: Record<TimeGranularity, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

// ============================================
// In-Memory Metrics Store (for demonstration)
// In production, use Redis/TimescaleDB/ClickHouse
// ============================================

interface MetricDataPoint {
  timestamp: number;
  latencyMs: number;
  searchType: 'vector' | 'keyword' | 'hybrid' | 'federated';
  cacheHit: boolean;
  error?: string;
  collectionId: string;
  queryHash: string;
  resultCount: number;
  embeddingLatencyMs?: number;
  rerankLatencyMs?: number;
}

class MetricsStore {
  private dataPoints: Map<string, MetricDataPoint[]> = new Map();
  private maxPointsPerUser = 100000;

  addDataPoint(userId: string, point: MetricDataPoint): void {
    if (!this.dataPoints.has(userId)) {
      this.dataPoints.set(userId, []);
    }

    const points = this.dataPoints.get(userId)!;
    points.push(point);

    // Trim old data points
    if (points.length > this.maxPointsPerUser) {
      points.splice(0, points.length - this.maxPointsPerUser);
    }
  }

  getDataPoints(userId: string, startTime: number, endTime: number): MetricDataPoint[] {
    const points = this.dataPoints.get(userId) || [];
    return points.filter(p => p.timestamp >= startTime && p.timestamp <= endTime);
  }

  clear(userId: string): void {
    this.dataPoints.delete(userId);
  }
}

const metricsStore = new MetricsStore();

// ============================================
// Metrics Collection Functions
// ============================================

/**
 * Record a retrieval operation for metrics collection
 */
export async function recordRetrievalOperation(params: {
  userId: string;
  collectionId: string;
  queryHash: string;
  latencyMs: number;
  searchType: 'vector' | 'keyword' | 'hybrid' | 'federated';
  cacheHit: boolean;
  resultCount: number;
  error?: string;
  embeddingLatencyMs?: number;
  rerankLatencyMs?: number;
}): Promise<void> {
  const dataPoint: MetricDataPoint = {
    timestamp: Date.now(),
    latencyMs: params.latencyMs,
    searchType: params.searchType,
    cacheHit: params.cacheHit,
    error: params.error,
    collectionId: params.collectionId,
    queryHash: params.queryHash,
    resultCount: params.resultCount,
    embeddingLatencyMs: params.embeddingLatencyMs,
    rerankLatencyMs: params.rerankLatencyMs,
  };

  metricsStore.addDataPoint(params.userId, dataPoint);
}

// ============================================
// Metrics Aggregation Functions
// ============================================

/**
 * Calculate latency percentiles from an array of latency values
 */
function calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
  if (latencies.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, avg: 0, max: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const len = sorted.length;

  const percentile = (p: number): number => {
    const index = Math.ceil(len * (p / 100)) - 1;
    return sorted[Math.max(0, Math.min(index, len - 1))];
  };

  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    avg: Math.round(sum / len),
    max: sorted[len - 1],
  };
}

/**
 * Calculate cache metrics from data points
 */
function calculateCacheMetrics(points: MetricDataPoint[]): CacheMetrics {
  if (points.length === 0) {
    return { hits: 0, misses: 0, hitRate: 0, semanticHitRate: 0, avgTimeSavedMs: 0 };
  }

  const hits = points.filter(p => p.cacheHit).length;
  const misses = points.length - hits;
  const hitRate = hits / points.length;

  // Estimate time saved (cache hits are typically 10x faster)
  const avgLatency = points.reduce((sum, p) => sum + p.latencyMs, 0) / points.length;
  const avgTimeSavedMs = Math.round(avgLatency * 0.9);

  return {
    hits,
    misses,
    hitRate: Math.round(hitRate * 1000) / 1000,
    semanticHitRate: Math.round(hitRate * 0.8 * 1000) / 1000, // Estimate semantic cache
    avgTimeSavedMs,
  };
}

/**
 * Calculate error metrics from data points
 */
function calculateErrorMetrics(points: MetricDataPoint[]): ErrorMetrics {
  const errors = points.filter(p => p.error);
  const total = errors.length;
  const rate = points.length > 0 ? total / points.length : 0;

  const byType: Record<string, number> = {};
  errors.forEach(p => {
    const type = p.error || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });

  const recentSamples = errors.slice(-5).map(p => ({
    timestamp: new Date(p.timestamp).toISOString(),
    code: p.error || 'UNKNOWN',
    message: p.error || 'Unknown error',
    traceId: `trc_${p.timestamp.toString(36)}`,
  }));

  return {
    total,
    rate: Math.round(rate * 10000) / 10000,
    byType,
    recentSamples,
  };
}

// ============================================
// Public API Functions
// ============================================

/**
 * Get current RetOps metrics snapshot
 */
export async function getMetrics(
  userId: string,
  params: MetricsQueryParams = {}
): Promise<RetOpsMetrics> {
  const period = params.period || '1h';
  const now = Date.now();
  const startTime = now - PERIOD_TO_MS[period];

  const points = metricsStore.getDataPoints(userId, startTime, now);

  // Filter by collection if specified
  const filteredPoints = params.collectionId
    ? points.filter(p => p.collectionId === params.collectionId)
    : points;

  // Calculate QPS (queries per second)
  const durationSeconds = PERIOD_TO_MS[period] / 1000;
  const qps = filteredPoints.length > 0 ? filteredPoints.length / durationSeconds : 0;

  // Calculate latency metrics
  const latencies = filteredPoints.map(p => p.latencyMs);
  const latency = calculateLatencyMetrics(latencies);

  // Calculate cache metrics
  const cache = calculateCacheMetrics(filteredPoints);

  // Calculate error metrics
  const errors = calculateErrorMetrics(filteredPoints);

  // Quality metrics (placeholder - would need feedback data)
  const quality = {
    mrr: 0.75,
    ndcg: 0.68,
    precisionAtK: { p1: 0.85, p3: 0.72, p5: 0.65, p10: 0.55 },
    recallAtK: { r1: 0.35, r3: 0.55, r5: 0.68, r10: 0.82 },
    groundedness: 0.88,
    rerankImprovement: 0.12,
  };

  return {
    timestamp: new Date().toISOString(),
    userId,
    collectionId: params.collectionId,
    qps: Math.round(qps * 1000) / 1000,
    totalQueries: filteredPoints.length,
    latency,
    cache,
    errors,
    quality,
  };
}

/**
 * Get retrieval statistics
 */
export async function getStats(
  userId: string,
  params: StatsQueryParams = {}
): Promise<RetrievalStats> {
  const period = params.period || '24h';
  const now = Date.now();
  const startTime = now - PERIOD_TO_MS[period];

  const points = metricsStore.getDataPoints(userId, startTime, now);

  // Filter by collection if specified
  const filteredPoints = params.collectionId
    ? points.filter(p => p.collectionId === params.collectionId)
    : points;

  // Calculate query volume stats
  const queryVolume = calculateQueryVolumeStats(filteredPoints, startTime, now);

  // Calculate search type breakdown
  const searchTypes = calculateSearchTypeStats(filteredPoints);

  // Get top queries
  const topQueries = params.includeTopQueries !== false
    ? calculateTopQueries(filteredPoints, params.topQueriesLimit || 10)
    : [];

  // Collection breakdown
  const collectionBreakdown = calculateCollectionBreakdown(filteredPoints);

  // Embedding usage
  const embeddingUsage = calculateEmbeddingUsage(filteredPoints);

  // Rerank usage
  const rerankUsage = calculateRerankUsage(filteredPoints);

  return {
    period,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(now).toISOString(),
    queryVolume,
    searchTypes,
    topQueries,
    collectionBreakdown,
    embeddingUsage,
    rerankUsage,
  };
}

/**
 * Get time series data for metrics
 */
export async function getTimeSeries(
  userId: string,
  params: MetricsQueryParams = {}
): Promise<TimeSeriesData> {
  const period = params.period || '1h';
  const granularity = params.granularity || getDefaultGranularity(period);
  const now = Date.now();
  const startTime = now - PERIOD_TO_MS[period];

  const points = metricsStore.getDataPoints(userId, startTime, now);

  // Filter by collection if specified
  const filteredPoints = params.collectionId
    ? points.filter(p => p.collectionId === params.collectionId)
    : points;

  // Group points by time bucket
  const bucketMs = GRANULARITY_TO_MS[granularity];
  const buckets = new Map<number, MetricDataPoint[]>();

  filteredPoints.forEach(point => {
    const bucketStart = Math.floor(point.timestamp / bucketMs) * bucketMs;
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(point);
  });

  // Generate time series arrays
  const timestamps: string[] = [];
  const qps: number[] = [];
  const latencyP50: number[] = [];
  const latencyP99: number[] = [];
  const errorRate: number[] = [];
  const cacheHitRate: number[] = [];

  // Fill in all buckets (including empty ones)
  for (let t = startTime; t <= now; t += bucketMs) {
    const bucketStart = Math.floor(t / bucketMs) * bucketMs;
    const bucketPoints = buckets.get(bucketStart) || [];

    timestamps.push(new Date(bucketStart).toISOString());

    // QPS for this bucket
    const bucketQps = bucketPoints.length / (bucketMs / 1000);
    qps.push(Math.round(bucketQps * 1000) / 1000);

    // Latency percentiles
    const latencies = bucketPoints.map(p => p.latencyMs);
    if (latencies.length > 0) {
      const sorted = [...latencies].sort((a, b) => a - b);
      const p50Idx = Math.floor(sorted.length * 0.5);
      const p99Idx = Math.floor(sorted.length * 0.99);
      latencyP50.push(sorted[p50Idx] || 0);
      latencyP99.push(sorted[p99Idx] || sorted[sorted.length - 1] || 0);
    } else {
      latencyP50.push(0);
      latencyP99.push(0);
    }

    // Error rate
    const errors = bucketPoints.filter(p => p.error).length;
    errorRate.push(bucketPoints.length > 0 ? errors / bucketPoints.length : 0);

    // Cache hit rate
    const hits = bucketPoints.filter(p => p.cacheHit).length;
    cacheHitRate.push(bucketPoints.length > 0 ? hits / bucketPoints.length : 0);
  }

  return {
    timestamps,
    qps,
    latencyP50,
    latencyP99,
    errorRate,
    cacheHitRate,
  };
}

// ============================================
// Helper Functions
// ============================================

function getDefaultGranularity(period: TimePeriod): TimeGranularity {
  switch (period) {
    case '1h':
      return '1m';
    case '6h':
      return '5m';
    case '24h':
      return '15m';
    case '7d':
      return '1h';
    case '30d':
      return '1d';
    default:
      return '15m';
  }
}

function calculateQueryVolumeStats(
  points: MetricDataPoint[],
  startTime: number,
  endTime: number
): QueryVolumeStats {
  const durationSeconds = (endTime - startTime) / 1000;
  const avgQps = points.length / durationSeconds;

  // Calculate time series for QPS
  const bucketMs = 60 * 1000; // 1 minute buckets
  const buckets = new Map<number, number>();

  points.forEach(point => {
    const bucketStart = Math.floor(point.timestamp / bucketMs) * bucketMs;
    buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + 1);
  });

  const timeSeries: TimeSeriesPoint[] = [];
  let peakQps = 0;

  for (let t = startTime; t <= endTime; t += bucketMs) {
    const bucketStart = Math.floor(t / bucketMs) * bucketMs;
    const count = buckets.get(bucketStart) || 0;
    const qps = count / (bucketMs / 1000);

    timeSeries.push({
      timestamp: new Date(bucketStart).toISOString(),
      value: Math.round(qps * 1000) / 1000,
    });

    if (qps > peakQps) {
      peakQps = qps;
    }
  }

  return {
    total: points.length,
    avgQps: Math.round(avgQps * 1000) / 1000,
    peakQps: Math.round(peakQps * 1000) / 1000,
    timeSeries,
  };
}

function calculateSearchTypeStats(points: MetricDataPoint[]): SearchTypeStats {
  const stats: SearchTypeStats = {
    vector: 0,
    keyword: 0,
    hybrid: 0,
    federated: 0,
  };

  points.forEach(point => {
    stats[point.searchType]++;
  });

  return stats;
}

function calculateTopQueries(
  points: MetricDataPoint[],
  limit: number
): TopQuery[] {
  const queryMap = new Map<string, {
    count: number;
    totalLatency: number;
    totalResults: number;
    cacheHits: number;
    lastTimestamp: number;
  }>();

  points.forEach(point => {
    const existing = queryMap.get(point.queryHash);
    if (existing) {
      existing.count++;
      existing.totalLatency += point.latencyMs;
      existing.totalResults += point.resultCount;
      existing.cacheHits += point.cacheHit ? 1 : 0;
      existing.lastTimestamp = Math.max(existing.lastTimestamp, point.timestamp);
    } else {
      queryMap.set(point.queryHash, {
        count: 1,
        totalLatency: point.latencyMs,
        totalResults: point.resultCount,
        cacheHits: point.cacheHit ? 1 : 0,
        lastTimestamp: point.timestamp,
      });
    }
  });

  // Sort by count descending
  const sorted = Array.from(queryMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  return sorted.map(([queryHash, stats]) => ({
    queryHash,
    count: stats.count,
    avgLatencyMs: Math.round(stats.totalLatency / stats.count),
    avgResultCount: Math.round(stats.totalResults / stats.count),
    cacheHitRate: Math.round((stats.cacheHits / stats.count) * 1000) / 1000,
    lastExecuted: new Date(stats.lastTimestamp).toISOString(),
  }));
}

function calculateCollectionBreakdown(points: MetricDataPoint[]): CollectionStats[] {
  const collectionMap = new Map<string, {
    queryCount: number;
    totalLatency: number;
  }>();

  points.forEach(point => {
    const existing = collectionMap.get(point.collectionId);
    if (existing) {
      existing.queryCount++;
      existing.totalLatency += point.latencyMs;
    } else {
      collectionMap.set(point.collectionId, {
        queryCount: 1,
        totalLatency: point.latencyMs,
      });
    }
  });

  return Array.from(collectionMap.entries())
    .map(([collectionId, stats]) => ({
      collectionId,
      collectionName: `Collection ${collectionId.slice(0, 8)}`,
      queryCount: stats.queryCount,
      avgLatencyMs: Math.round(stats.totalLatency / stats.queryCount),
      documentCount: 0, // Would need DB query
      chunkCount: 0, // Would need DB query
    }))
    .sort((a, b) => b.queryCount - a.queryCount);
}

function calculateEmbeddingUsage(points: MetricDataPoint[]): EmbeddingUsageStats {
  const withEmbedding = points.filter(p => p.embeddingLatencyMs !== undefined);

  const totalEmbeddings = withEmbedding.length;
  const tokensUsed = totalEmbeddings * 512; // Estimate average query tokens

  const avgLatencyMs = withEmbedding.length > 0
    ? Math.round(withEmbedding.reduce((sum, p) => sum + (p.embeddingLatencyMs || 0), 0) / withEmbedding.length)
    : 0;

  return {
    totalEmbeddings,
    tokensUsed,
    byModel: {
      'voyage-3': totalEmbeddings,
    },
    avgLatencyMs,
  };
}

function calculateRerankUsage(points: MetricDataPoint[]): RerankUsageStats {
  const withRerank = points.filter(p => p.rerankLatencyMs !== undefined);

  const totalCalls = withRerank.length;
  const documentsReranked = totalCalls * 10; // Estimate average docs per rerank

  return {
    totalCalls,
    documentsReranked,
    avgImprovement: 0.15, // Placeholder
    byProvider: {
      'cohere': totalCalls,
    },
  };
}

// ============================================
// Export Store for Testing
// ============================================

export { metricsStore };
