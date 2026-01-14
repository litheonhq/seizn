/**
 * Seizn Vector Cost Engineering - Analytics
 *
 * Analyzes usage patterns, identifies hot spots, and provides
 * insights for cost optimization decisions.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  UsageAnalytics,
  TierDistribution,
  HotSpot,
  CacheEffectiveness,
  CacheStats,
} from './types';

/**
 * Usage Analytics Manager
 *
 * Collects and analyzes usage patterns for cost optimization.
 */
export class UsageAnalyticsManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Get comprehensive usage analytics
   */
  async getAnalytics(
    periodDays: number = 30,
    collectionId?: string
  ): Promise<UsageAnalytics> {
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    // Gather all analytics in parallel
    const [
      queryStats,
      tierDistribution,
      hotSpots,
      cacheEffectiveness,
    ] = await Promise.all([
      this.getQueryStats(periodStart, periodEnd, collectionId),
      this.getTierAccessDistribution(collectionId),
      this.getHotSpots(periodStart, periodEnd, collectionId),
      this.getCacheEffectiveness(periodStart, periodEnd, collectionId),
    ]);

    const coldDataPercent = tierDistribution.total > 0
      ? (tierDistribution.cold / tierDistribution.total) * 100
      : 0;

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalQueries: queryStats.totalQueries,
      queriesByHour: queryStats.queriesByHour,
      avgLatencyMs: queryStats.avgLatencyMs,
      p95LatencyMs: queryStats.p95LatencyMs,
      tierAccessDistribution: tierDistribution,
      hotSpots,
      coldDataPercent,
      cacheEffectiveness,
    };
  }

  /**
   * Get query statistics
   */
  async getQueryStats(
    periodStart: Date,
    periodEnd: Date,
    collectionId?: string
  ): Promise<{
    totalQueries: number;
    queriesByHour: Record<number, number>;
    avgLatencyMs: number;
    p95LatencyMs: number;
  }> {
    const supabase = createServerClient();

    let query = supabase
      .from('query_logs')
      .select('created_at, latency_ms')
      .eq('user_id', this.userId)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data: queries, error } = await query;

    if (error || !queries || queries.length === 0) {
      return {
        totalQueries: 0,
        queriesByHour: {},
        avgLatencyMs: 0,
        p95LatencyMs: 0,
      };
    }

    // Calculate hourly distribution
    const queriesByHour: Record<number, number> = {};
    const latencies: number[] = [];

    for (const q of queries) {
      const hour = new Date(q.created_at).getHours();
      queriesByHour[hour] = (queriesByHour[hour] || 0) + 1;
      if (q.latency_ms) {
        latencies.push(q.latency_ms);
      }
    }

    // Calculate latency metrics
    latencies.sort((a, b) => a - b);
    const avgLatencyMs =
      latencies.length > 0
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
        : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies[p95Index] || 0;

    return {
      totalQueries: queries.length,
      queriesByHour,
      avgLatencyMs,
      p95LatencyMs,
    };
  }

  /**
   * Get tier access distribution
   */
  async getTierAccessDistribution(
    collectionId?: string
  ): Promise<TierDistribution> {
    const supabase = createServerClient();

    let query = supabase
      .from('chunk_access_stats')
      .select('tier, access_count')
      .eq('user_id', this.userId);

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return { hot: 0, warm: 0, cold: 0, total: 0 };
    }

    // Weight by access count for distribution
    const distribution = { hot: 0, warm: 0, cold: 0, total: 0 };

    for (const item of data) {
      const accessCount = item.access_count || 1;
      const tier = item.tier as 'hot' | 'warm' | 'cold';
      distribution[tier] += accessCount;
      distribution.total += accessCount;
    }

    return distribution;
  }

  /**
   * Identify frequently accessed chunks (hot spots)
   */
  async getHotSpots(
    periodStart: Date,
    periodEnd: Date,
    collectionId?: string,
    limit: number = 10
  ): Promise<HotSpot[]> {
    const supabase = createServerClient();

    // Get chunks with highest access counts
    const { data, error } = await supabase.rpc('get_hot_spots', {
      p_user_id: this.userId,
      p_collection_id: collectionId,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
      p_limit: limit,
    });

    if (error || !data) {
      // Fallback to simple query
      let fallbackQuery = supabase
        .from('chunk_access_stats')
        .select('chunk_id, collection_id, access_count')
        .eq('user_id', this.userId)
        .order('access_count', { ascending: false })
        .limit(limit);

      if (collectionId) {
        fallbackQuery = fallbackQuery.eq('collection_id', collectionId);
      }

      const { data: fallbackData } = await fallbackQuery;

      if (!fallbackData) return [];

      const totalAccess = fallbackData.reduce(
        (sum, d) => sum + (d.access_count || 0),
        0
      );

      return fallbackData.map((item) => ({
        chunkId: item.chunk_id,
        collectionId: item.collection_id,
        accessCount: item.access_count,
        queryPercent: totalAccess > 0
          ? ((item.access_count || 0) / totalAccess) * 100
          : 0,
      }));
    }

    return data.map((item: any) => ({
      chunkId: item.chunk_id,
      collectionId: item.collection_id,
      accessCount: item.access_count,
      queryPercent: item.query_percent,
    }));
  }

  /**
   * Calculate cache effectiveness
   */
  async getCacheEffectiveness(
    periodStart: Date,
    periodEnd: Date,
    collectionId?: string
  ): Promise<CacheEffectiveness> {
    const supabase = createServerClient();

    // Get cache metrics
    const { data: metrics, error } = await supabase
      .from('cost_cache_metrics')
      .select('*')
      .eq('user_id', this.userId)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    if (error || !metrics || metrics.length === 0) {
      return this.emptyEffectiveness();
    }

    // Aggregate metrics
    let totalHits = 0;
    let totalMisses = 0;
    let totalLatencySaved = 0;
    let totalCostSaved = 0;
    let hitLatencySum = 0;
    let missLatencySum = 0;

    for (const m of metrics) {
      totalHits += m.hit_count || 0;
      totalMisses += m.miss_count || 0;
      totalLatencySaved += m.latency_saved_ms || 0;
      totalCostSaved += m.cost_saved_usd || 0;
      hitLatencySum += (m.avg_hit_latency_ms || 5) * (m.hit_count || 0);
      missLatencySum += (m.avg_miss_latency_ms || 100) * (m.miss_count || 0);
    }

    const totalQueries = totalHits + totalMisses;
    const hitRate = totalQueries > 0 ? totalHits / totalQueries : 0;
    const avgHitLatency = totalHits > 0 ? hitLatencySum / totalHits : 5;
    const avgMissLatency = totalMisses > 0 ? missLatencySum / totalMisses : 100;
    const latencyImprovement =
      avgMissLatency > 0
        ? ((avgMissLatency - avgHitLatency) / avgMissLatency) * 100
        : 0;

    return {
      hitRate,
      avgLatencyWithCacheMs: totalQueries > 0
        ? (hitLatencySum + missLatencySum) / totalQueries
        : 0,
      avgLatencyWithoutCacheMs: avgMissLatency,
      latencyImprovementPercent: latencyImprovement,
      costSavingsUsd: totalCostSaved,
    };
  }

  /**
   * Get query trend over time
   */
  async getQueryTrend(
    periodDays: number = 30,
    granularity: 'hour' | 'day' | 'week' = 'day'
  ): Promise<Array<{ timestamp: string; count: number; avgLatency: number }>> {
    const supabase = createServerClient();
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase.rpc('get_query_trend', {
      p_user_id: this.userId,
      p_period_start: periodStart.toISOString(),
      p_granularity: granularity,
    });

    if (error || !data) {
      return [];
    }

    return data.map((item: any) => ({
      timestamp: item.bucket,
      count: item.query_count,
      avgLatency: item.avg_latency_ms,
    }));
  }

  /**
   * Get cost trend over time
   */
  async getCostTrend(
    periodDays: number = 30
  ): Promise<Array<{ date: string; storageCost: number; queryCost: number; totalCost: number }>> {
    const supabase = createServerClient();
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('daily_cost_summary')
      .select('date, storage_cost_usd, query_cost_usd, total_cost_usd')
      .eq('user_id', this.userId)
      .gte('date', periodStart.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((item) => ({
      date: item.date,
      storageCost: item.storage_cost_usd,
      queryCost: item.query_cost_usd,
      totalCost: item.total_cost_usd,
    }));
  }

  /**
   * Identify optimization opportunities
   */
  async identifyOpportunities(collectionId?: string): Promise<{
    cachingOpportunity: number;
    tieringOpportunity: number;
    batchingOpportunity: number;
    description: string[];
  }> {
    const analytics = await this.getAnalytics(30, collectionId);
    const opportunities = {
      cachingOpportunity: 0,
      tieringOpportunity: 0,
      batchingOpportunity: 0,
      description: [] as string[],
    };

    // Check caching opportunity
    if (analytics.cacheEffectiveness.hitRate < 0.5) {
      opportunities.cachingOpportunity = 0.5 - analytics.cacheEffectiveness.hitRate;
      opportunities.description.push(
        `Cache hit rate is ${(analytics.cacheEffectiveness.hitRate * 100).toFixed(1)}%. ` +
        `Improving to 50% could save ~${(opportunities.cachingOpportunity * 20).toFixed(0)}% on query costs.`
      );
    }

    // Check tiering opportunity
    const hotPercent = analytics.tierAccessDistribution.total > 0
      ? (analytics.tierAccessDistribution.hot / analytics.tierAccessDistribution.total)
      : 0;
    if (hotPercent > 0.3) {
      opportunities.tieringOpportunity = hotPercent - 0.3;
      opportunities.description.push(
        `${(hotPercent * 100).toFixed(0)}% of accessed data is in hot storage. ` +
        `Moving inactive data to cold tier could save ~${(opportunities.tieringOpportunity * 50).toFixed(0)}% on storage costs.`
      );
    }

    // Check batching opportunity based on query patterns
    const peakHour = Object.entries(analytics.queriesByHour)
      .sort(([, a], [, b]) => b - a)[0];
    if (peakHour && analytics.queriesByHour[Number(peakHour[0])] > analytics.totalQueries * 0.2) {
      opportunities.batchingOpportunity = 0.2;
      opportunities.description.push(
        `Query traffic is concentrated at hour ${peakHour[0]}. ` +
        `Batch processing during peak times could improve efficiency.`
      );
    }

    return opportunities;
  }

  /**
   * Track access to chunks
   */
  async trackAccess(
    chunkIds: string[],
    collectionId: string,
    latencyMs?: number
  ): Promise<void> {
    if (chunkIds.length === 0) return;

    const supabase = createServerClient();
    const now = new Date().toISOString();

    // Batch upsert access stats
    const upserts = chunkIds.map((chunkId) => ({
      chunk_id: chunkId,
      collection_id: collectionId,
      user_id: this.userId,
      access_count: 1,
      last_accessed_at: now,
    }));

    // Use on_conflict for upsert
    for (const upsert of upserts) {
      await supabase.rpc('increment_chunk_access', {
        p_chunk_id: upsert.chunk_id,
        p_collection_id: upsert.collection_id,
        p_user_id: upsert.user_id,
      });
    }

    // Log query for analytics
    await supabase.from('query_logs').insert({
      user_id: this.userId,
      collection_id: collectionId,
      chunk_count: chunkIds.length,
      latency_ms: latencyMs,
      created_at: now,
    });
  }

  /**
   * Record cache event
   */
  async recordCacheEvent(
    hit: boolean,
    latencyMs: number,
    latencySavedMs?: number,
    costSavedUsd?: number
  ): Promise<void> {
    const supabase = createServerClient();
    const today = new Date().toISOString().split('T')[0];

    // Upsert daily cache metrics
    const { error } = await supabase.rpc('record_cache_event', {
      p_user_id: this.userId,
      p_date: today,
      p_hit: hit,
      p_latency_ms: latencyMs,
      p_latency_saved_ms: latencySavedMs,
      p_cost_saved_usd: costSavedUsd,
    });

    if (error) {
      console.error('Failed to record cache event:', error);
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private emptyEffectiveness(): CacheEffectiveness {
    return {
      hitRate: 0,
      avgLatencyWithCacheMs: 0,
      avgLatencyWithoutCacheMs: 0,
      latencyImprovementPercent: 0,
      costSavingsUsd: 0,
    };
  }
}

/**
 * Calculate percentile from sorted array
 */
export function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in ms to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// Re-export with original name for backwards compatibility
export { UsageAnalyticsManager as UsageAnalytics };
