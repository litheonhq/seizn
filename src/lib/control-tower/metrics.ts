/**
 * Control Tower - Metrics Service
 *
 * Collects and aggregates system metrics
 */

import { createServerClient } from '@/lib/supabase';
import type { DashboardMetrics, MetricSeries, TimeRange } from './types';

// Cache for expensive metrics calculations
const metricsCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Get dashboard metrics for the Control Tower
 */
export async function getDashboardMetrics(
  userId?: string,
  organizationId?: string,
  timeRange?: TimeRange
): Promise<DashboardMetrics> {
  const cacheKey = `dashboard:${userId || 'all'}:${organizationId || 'all'}`;
  const cached = metricsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as DashboardMetrics;
  }

  const supabase = createServerClient();
  const now = new Date();
  const periodStart = timeRange?.start || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = timeRange?.end || now.toISOString();

  // Fetch metrics in parallel
  const [
    requestMetrics,
    resourceMetrics,
    businessMetrics,
  ] = await Promise.all([
    getRequestMetrics(supabase, periodStart, periodEnd, userId, organizationId),
    getResourceMetrics(),
    getBusinessMetrics(supabase, periodStart, periodEnd, userId, organizationId),
  ]);

  const metrics: DashboardMetrics = {
    ...requestMetrics,
    ...resourceMetrics,
    ...businessMetrics,
    periodStart,
    periodEnd,
  };

  // Cache the result
  metricsCache.set(cacheKey, { data: metrics, expiresAt: Date.now() + CACHE_TTL_MS });

  return metrics;
}

/**
 * Get request-related metrics from API traces
 */
async function getRequestMetrics(
  supabase: ReturnType<typeof createServerClient>,
  periodStart: string,
  periodEnd: string,
  userId?: string,
  organizationId?: string
): Promise<{
  totalRequests: number;
  requestsPerSecond: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}> {
  try {
    // Query API traces for request metrics
    let query = supabase
      .from('api_traces')
      .select('latency_ms, status_code, created_at')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (userId) query = query.eq('user_id', userId);
    if (organizationId) query = query.eq('organization_id', organizationId);

    const { data: traces, error } = await query.limit(10000);

    if (error || !traces || traces.length === 0) {
      return {
        totalRequests: 0,
        requestsPerSecond: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
      };
    }

    const totalRequests = traces.length;
    const periodMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
    const requestsPerSecond = totalRequests / (periodMs / 1000);

    const errorCount = traces.filter((t) => t.status_code >= 400).length;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

    const latencies = traces
      .map((t) => t.latency_ms)
      .filter((l): l is number => typeof l === 'number')
      .sort((a, b) => a - b);

    const avgLatencyMs = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const p95LatencyMs = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.95)] || 0
      : 0;

    const p99LatencyMs = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.99)] || 0
      : 0;

    return {
      totalRequests,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      errorRate: Math.round(errorRate * 10000) / 100, // percentage
      avgLatencyMs: Math.round(avgLatencyMs),
      p95LatencyMs: Math.round(p95LatencyMs),
      p99LatencyMs: Math.round(p99LatencyMs),
    };
  } catch (err) {
    console.error('Failed to get request metrics:', err);
    return {
      totalRequests: 0,
      requestsPerSecond: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
    };
  }
}

/**
 * Get resource usage metrics
 */
async function getResourceMetrics(): Promise<{
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  activeConnections: number;
}> {
  // In serverless environments, these are simulated
  // In production, integrate with monitoring services
  return {
    cpuUsagePercent: Math.random() * 30 + 10, // Simulated
    memoryUsagePercent: Math.random() * 40 + 20, // Simulated
    diskUsagePercent: Math.random() * 20 + 30, // Simulated
    activeConnections: Math.floor(Math.random() * 50 + 10), // Simulated
  };
}

/**
 * Get business metrics from database
 */
async function getBusinessMetrics(
  supabase: ReturnType<typeof createServerClient>,
  periodStart: string,
  periodEnd: string,
  userId?: string,
  organizationId?: string
): Promise<{
  activeUsers: number;
  totalMemories: number;
  totalQueries: number;
  llmTokensUsed: number;
  embeddingsGenerated: number;
}> {
  try {
    // Active users in period
    let activeUsersQuery = supabase
      .from('api_keys')
      .select('user_id', { count: 'exact', head: true })
      .gte('last_used_at', periodStart);

    if (organizationId) {
      activeUsersQuery = activeUsersQuery.eq('organization_id', organizationId);
    }

    const { count: activeUsers } = await activeUsersQuery;

    // Total memories
    let memoriesQuery = supabase
      .from('memories')
      .select('id', { count: 'exact', head: true });

    if (userId) memoriesQuery = memoriesQuery.eq('user_id', userId);
    if (organizationId) memoriesQuery = memoriesQuery.eq('organization_id', organizationId);

    const { count: totalMemories } = await memoriesQuery;

    // Total queries in period
    let queriesQuery = supabase
      .from('api_traces')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/v1/search')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (userId) queriesQuery = queriesQuery.eq('user_id', userId);
    if (organizationId) queriesQuery = queriesQuery.eq('organization_id', organizationId);

    const { count: totalQueries } = await queriesQuery;

    // Token usage from usage tracking
    let tokensQuery = supabase
      .from('usage_logs')
      .select('tokens_used')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (userId) tokensQuery = tokensQuery.eq('user_id', userId);
    if (organizationId) tokensQuery = tokensQuery.eq('organization_id', organizationId);

    const { data: tokenData } = await tokensQuery;
    const llmTokensUsed = (tokenData || []).reduce((sum, row) => sum + (row.tokens_used || 0), 0);

    // Embeddings generated
    let embeddingsQuery = supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (userId) embeddingsQuery = embeddingsQuery.eq('user_id', userId);
    if (organizationId) embeddingsQuery = embeddingsQuery.eq('organization_id', organizationId);

    const { count: embeddingsGenerated } = await embeddingsQuery;

    return {
      activeUsers: activeUsers || 0,
      totalMemories: totalMemories || 0,
      totalQueries: totalQueries || 0,
      llmTokensUsed,
      embeddingsGenerated: embeddingsGenerated || 0,
    };
  } catch (err) {
    console.error('Failed to get business metrics:', err);
    return {
      activeUsers: 0,
      totalMemories: 0,
      totalQueries: 0,
      llmTokensUsed: 0,
      embeddingsGenerated: 0,
    };
  }
}

/**
 * Get metric time series for charting
 */
export async function getMetricSeries(
  metricName: string,
  timeRange: TimeRange,
  userId?: string,
  organizationId?: string
): Promise<MetricSeries> {
  const supabase = createServerClient();

  try {
    // Map metric names to database queries
    switch (metricName) {
      case 'requests': {
        return await getRequestTimeSeries(supabase, timeRange, userId, organizationId);
      }
      case 'latency': {
        return await getLatencyTimeSeries(supabase, timeRange, userId, organizationId);
      }
      case 'errors': {
        return await getErrorTimeSeries(supabase, timeRange, userId, organizationId);
      }
      case 'memories': {
        return await getMemoriesTimeSeries(supabase, timeRange, userId, organizationId);
      }
      default: {
        // Try to get from system_metrics table
        const { data } = await supabase
          .from('system_metrics')
          .select('metric_value, recorded_at')
          .eq('metric_name', metricName)
          .gte('recorded_at', timeRange.start)
          .lte('recorded_at', timeRange.end)
          .order('recorded_at', { ascending: true });

        return {
          name: metricName,
          displayName: metricName,
          unit: '',
          values: (data || []).map((row) => ({
            value: row.metric_value,
            timestamp: row.recorded_at,
          })),
          aggregation: 'avg',
        };
      }
    }
  } catch (err) {
    console.error(`Failed to get metric series for ${metricName}:`, err);
    return {
      name: metricName,
      displayName: metricName,
      unit: '',
      values: [],
      aggregation: 'avg',
    };
  }
}

/**
 * Get request count time series
 */
async function getRequestTimeSeries(
  supabase: ReturnType<typeof createServerClient>,
  timeRange: TimeRange,
  userId?: string,
  organizationId?: string
): Promise<MetricSeries> {
  let query = supabase
    .from('api_traces')
    .select('created_at')
    .gte('created_at', timeRange.start)
    .lte('created_at', timeRange.end);

  if (userId) query = query.eq('user_id', userId);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data } = await query;

  // Bucket by granularity
  const buckets = bucketByGranularity(
    (data || []).map((row) => ({ timestamp: row.created_at, value: 1 })),
    timeRange.granularity
  );

  return {
    name: 'requests',
    displayName: 'Requests',
    unit: 'count',
    values: buckets,
    aggregation: 'sum',
  };
}

/**
 * Get latency time series
 */
async function getLatencyTimeSeries(
  supabase: ReturnType<typeof createServerClient>,
  timeRange: TimeRange,
  userId?: string,
  organizationId?: string
): Promise<MetricSeries> {
  let query = supabase
    .from('api_traces')
    .select('latency_ms, created_at')
    .gte('created_at', timeRange.start)
    .lte('created_at', timeRange.end);

  if (userId) query = query.eq('user_id', userId);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data } = await query;

  const buckets = bucketByGranularity(
    (data || []).map((row) => ({ timestamp: row.created_at, value: row.latency_ms || 0 })),
    timeRange.granularity,
    'avg'
  );

  return {
    name: 'latency',
    displayName: 'Latency',
    unit: 'ms',
    values: buckets,
    aggregation: 'avg',
  };
}

/**
 * Get error count time series
 */
async function getErrorTimeSeries(
  supabase: ReturnType<typeof createServerClient>,
  timeRange: TimeRange,
  userId?: string,
  organizationId?: string
): Promise<MetricSeries> {
  let query = supabase
    .from('api_traces')
    .select('created_at')
    .gte('status_code', 400)
    .gte('created_at', timeRange.start)
    .lte('created_at', timeRange.end);

  if (userId) query = query.eq('user_id', userId);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data } = await query;

  const buckets = bucketByGranularity(
    (data || []).map((row) => ({ timestamp: row.created_at, value: 1 })),
    timeRange.granularity
  );

  return {
    name: 'errors',
    displayName: 'Errors',
    unit: 'count',
    values: buckets,
    aggregation: 'sum',
  };
}

/**
 * Get memories created time series
 */
async function getMemoriesTimeSeries(
  supabase: ReturnType<typeof createServerClient>,
  timeRange: TimeRange,
  userId?: string,
  organizationId?: string
): Promise<MetricSeries> {
  let query = supabase
    .from('memories')
    .select('created_at')
    .gte('created_at', timeRange.start)
    .lte('created_at', timeRange.end);

  if (userId) query = query.eq('user_id', userId);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data } = await query;

  const buckets = bucketByGranularity(
    (data || []).map((row) => ({ timestamp: row.created_at, value: 1 })),
    timeRange.granularity
  );

  return {
    name: 'memories',
    displayName: 'Memories Created',
    unit: 'count',
    values: buckets,
    aggregation: 'sum',
  };
}

/**
 * Bucket data points by granularity
 */
function bucketByGranularity(
  data: Array<{ timestamp: string; value: number }>,
  granularity: string,
  aggregation: 'sum' | 'avg' = 'sum'
): Array<{ value: number; timestamp: string }> {
  const granularityMs: Record<string, number> = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '1h': 3600000,
    '6h': 21600000,
    '1d': 86400000,
  };

  const bucketMs = granularityMs[granularity] || 3600000;
  const buckets = new Map<number, number[]>();

  for (const point of data) {
    const ts = new Date(point.timestamp).getTime();
    const bucketKey = Math.floor(ts / bucketMs) * bucketMs;

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(point.value);
  }

  const result: Array<{ value: number; timestamp: string }> = [];

  for (const [bucketKey, values] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    const value = aggregation === 'sum'
      ? values.reduce((a, b) => a + b, 0)
      : values.reduce((a, b) => a + b, 0) / values.length;

    result.push({
      value: Math.round(value * 100) / 100,
      timestamp: new Date(bucketKey).toISOString(),
    });
  }

  return result;
}

/**
 * Record a metric value
 */
export async function recordMetric(
  metricName: string,
  value: number,
  labels?: Record<string, string>
): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from('system_metrics').insert({
      metric_name: metricName,
      metric_value: value,
      labels: labels || {},
      recorded_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to record metric:', err);
  }
}
