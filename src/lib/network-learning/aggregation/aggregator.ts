/**
 * Aggregator for Network Learning
 *
 * Aggregates anonymized signals into insights.
 * All aggregation is done on anonymized data only.
 */

import { createServerClient } from '@/lib/supabase';
import { randomUUID } from 'crypto';
import { getSignals } from '../collection/signal-collector';
import type {
  AggregationPeriod,
  AggregatedInsight,
  InsightRecord,
  AnonymizedSignal,
  NetworkLearningConfig,
} from '../types';
import { DEFAULT_NETWORK_LEARNING_CONFIG } from '../types';

// ============================================
// Period Calculation
// ============================================

interface PeriodBounds {
  start: string;
  end: string;
}

/**
 * Calculate period bounds for aggregation
 */
function getPeriodBounds(period: AggregationPeriod, referenceDate?: Date): PeriodBounds {
  const ref = referenceDate ?? new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'daily':
      start = new Date(ref);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      break;
    case 'weekly':
      start = new Date(ref);
      start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
      break;
    case 'monthly':
      start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Get previous period bounds for comparison
 */
function getPreviousPeriodBounds(period: AggregationPeriod, referenceDate?: Date): PeriodBounds {
  const ref = referenceDate ?? new Date();
  let previousRef: Date;

  switch (period) {
    case 'daily':
      previousRef = new Date(ref);
      previousRef.setDate(previousRef.getDate() - 1);
      break;
    case 'weekly':
      previousRef = new Date(ref);
      previousRef.setDate(previousRef.getDate() - 7);
      break;
    case 'monthly':
      previousRef = new Date(ref);
      previousRef.setMonth(previousRef.getMonth() - 1);
      break;
  }

  return getPeriodBounds(period, previousRef);
}

// ============================================
// Aggregation Functions
// ============================================

/**
 * Aggregate signals into insights for a given period
 */
export async function aggregateSignals(
  period: AggregationPeriod,
  referenceDate?: Date,
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<AggregatedInsight[]> {
  const bounds = getPeriodBounds(period, referenceDate);

  // Fetch signals for the period
  const signals = await getSignals({
    startDate: bounds.start,
    endDate: bounds.end,
    limit: 10000, // Reasonable limit for aggregation
  });

  if (signals.length < config.minSampleSize) {
    // Not enough samples for meaningful aggregation
    return [];
  }

  // Group by query cluster
  const clusterGroups = groupByCluster(signals);

  const insights: AggregatedInsight[] = [];

  for (const [cluster, clusterSignals] of Object.entries(clusterGroups)) {
    if (clusterSignals.length < config.minSampleSize) {
      continue; // Skip clusters with insufficient data
    }

    const insight = computeInsight(cluster, clusterSignals, period, bounds);
    insights.push(insight);
  }

  return insights;
}

/**
 * Group signals by query cluster
 */
function groupByCluster(signals: AnonymizedSignal[]): Record<string, AnonymizedSignal[]> {
  const groups: Record<string, AnonymizedSignal[]> = {};

  for (const signal of signals) {
    const cluster = signal.queryCluster;
    if (!groups[cluster]) {
      groups[cluster] = [];
    }
    groups[cluster].push(signal);
  }

  return groups;
}

/**
 * Compute aggregated insight for a cluster
 */
function computeInsight(
  cluster: string,
  signals: AnonymizedSignal[],
  period: AggregationPeriod,
  _bounds: PeriodBounds
): AggregatedInsight {
  // Calculate averages
  const totalLatency = signals.reduce((sum, s) => sum + s.metrics.latencyMs, 0);
  const totalResults = signals.reduce((sum, s) => sum + s.metrics.resultsCount, 0);

  const feedbackSignals = signals.filter((s) => s.metrics.feedbackScore !== undefined);
  const totalFeedback = feedbackSignals.reduce(
    (sum, s) => sum + (s.metrics.feedbackScore ?? 0),
    0
  );

  // Calculate plan path frequencies
  const pathCounts = computePlanPathFrequencies(signals);

  return {
    id: `insight_${randomUUID().replace(/-/g, '')}`,
    period,
    queryCluster: cluster,
    sampleCount: signals.length,
    avgLatencyMs: Math.round(totalLatency / signals.length),
    avgResultsCount: Math.round((totalResults / signals.length) * 100) / 100,
    avgFeedbackScore:
      feedbackSignals.length > 0
        ? Math.round((totalFeedback / feedbackSignals.length) * 100) / 100
        : undefined,
    topPlanPaths: pathCounts.slice(0, 5), // Top 5 paths
    createdAt: new Date().toISOString(),
  };
}

/**
 * Compute plan path frequencies
 */
function computePlanPathFrequencies(
  signals: AnonymizedSignal[]
): { path: string[]; count: number }[] {
  const pathCounts: Record<string, number> = {};

  for (const signal of signals) {
    const pathKey = signal.planPath.join('->');
    pathCounts[pathKey] = (pathCounts[pathKey] ?? 0) + 1;
  }

  return Object.entries(pathCounts)
    .map(([pathKey, count]) => ({
      path: pathKey.split('->'),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================
// Insight Storage & Retrieval
// ============================================

/**
 * Store aggregated insights
 */
export async function storeInsights(insights: AggregatedInsight[]): Promise<void> {
  if (insights.length === 0) return;

  const supabase = createServerClient();

  const records = insights.map((insight) => ({
    id: insight.id,
    period: insight.period,
    period_start: getPeriodBounds(insight.period).start,
    period_end: getPeriodBounds(insight.period).end,
    query_cluster: insight.queryCluster,
    sample_count: insight.sampleCount,
    avg_latency_ms: insight.avgLatencyMs,
    avg_results_count: insight.avgResultsCount,
    avg_feedback_score: insight.avgFeedbackScore ?? null,
    top_plan_paths: insight.topPlanPaths,
  }));

  const { error } = await supabase
    .from('network_learning_insights')
    .insert(records);

  if (error) {
    console.error('Failed to store insights:', error);
    throw error;
  }
}

/**
 * Get stored insights
 */
export async function getInsights(options: {
  period?: AggregationPeriod;
  queryCluster?: string;
  limit?: number;
}): Promise<AggregatedInsight[]> {
  const supabase = createServerClient();
  const { period, queryCluster, limit = 100 } = options;

  let query = supabase
    .from('network_learning_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (period) {
    query = query.eq('period', period);
  }

  if (queryCluster) {
    query = query.eq('query_cluster', queryCluster);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get insights:', error);
    throw error;
  }

  return (data ?? []).map(recordToInsight);
}

/**
 * Get latest insight for a query cluster
 */
export async function getLatestInsight(
  queryCluster: string,
  period: AggregationPeriod
): Promise<AggregatedInsight | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_insights')
    .select('*')
    .eq('query_cluster', queryCluster)
    .eq('period', period)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to get latest insight:', error);
    return null;
  }

  return data ? recordToInsight(data as InsightRecord) : null;
}

// ============================================
// Analysis Functions
// ============================================

export interface TrendAnalysis {
  cluster: string;
  currentPeriod: AggregatedInsight;
  previousPeriod: AggregatedInsight | null;
  latencyTrend: 'improving' | 'degrading' | 'stable';
  feedbackTrend: 'improving' | 'degrading' | 'stable' | 'unknown';
  latencyChangePercent: number;
  feedbackChangePercent: number | null;
}

/**
 * Analyze trends by comparing current and previous periods
 */
export async function analyzeTrends(
  period: AggregationPeriod,
  referenceDate?: Date
): Promise<TrendAnalysis[]> {
  const currentBounds = getPeriodBounds(period, referenceDate);
  const previousBounds = getPreviousPeriodBounds(period, referenceDate);

  const [currentInsights, previousInsights] = await Promise.all([
    getSignals({ startDate: currentBounds.start, endDate: currentBounds.end })
      .then((signals) => aggregateSignalsInMemory(signals, period)),
    getSignals({ startDate: previousBounds.start, endDate: previousBounds.end })
      .then((signals) => aggregateSignalsInMemory(signals, period)),
  ]);

  const previousByCluster = new Map(
    previousInsights.map((i) => [i.queryCluster, i])
  );

  const trends: TrendAnalysis[] = [];

  for (const current of currentInsights) {
    const previous = previousByCluster.get(current.queryCluster) ?? null;

    const latencyChange = previous
      ? ((current.avgLatencyMs - previous.avgLatencyMs) / previous.avgLatencyMs) * 100
      : 0;

    const feedbackChange =
      previous?.avgFeedbackScore && current.avgFeedbackScore
        ? ((current.avgFeedbackScore - previous.avgFeedbackScore) /
            previous.avgFeedbackScore) *
          100
        : null;

    trends.push({
      cluster: current.queryCluster,
      currentPeriod: current,
      previousPeriod: previous,
      latencyTrend:
        latencyChange < -5 ? 'improving' : latencyChange > 5 ? 'degrading' : 'stable',
      feedbackTrend:
        feedbackChange === null
          ? 'unknown'
          : feedbackChange > 5
            ? 'improving'
            : feedbackChange < -5
              ? 'degrading'
              : 'stable',
      latencyChangePercent: Math.round(latencyChange * 100) / 100,
      feedbackChangePercent:
        feedbackChange !== null ? Math.round(feedbackChange * 100) / 100 : null,
    });
  }

  return trends;
}

/**
 * Aggregate signals in memory (for trend analysis)
 */
function aggregateSignalsInMemory(
  signals: AnonymizedSignal[],
  period: AggregationPeriod
): AggregatedInsight[] {
  const groups = groupByCluster(signals);
  const insights: AggregatedInsight[] = [];
  const bounds = getPeriodBounds(period);

  for (const [cluster, clusterSignals] of Object.entries(groups)) {
    if (clusterSignals.length >= 10) {
      // Lower threshold for in-memory aggregation
      insights.push(computeInsight(cluster, clusterSignals, period, bounds));
    }
  }

  return insights;
}

// ============================================
// Helper Functions
// ============================================

function recordToInsight(record: InsightRecord): AggregatedInsight {
  return {
    id: record.id,
    period: record.period,
    queryCluster: record.query_cluster,
    sampleCount: record.sample_count,
    avgLatencyMs: record.avg_latency_ms,
    avgResultsCount: record.avg_results_count,
    avgFeedbackScore: record.avg_feedback_score ?? undefined,
    topPlanPaths: record.top_plan_paths,
    createdAt: record.created_at,
  };
}

// ============================================
// Scheduled Aggregation
// ============================================

/**
 * Run scheduled aggregation (called by cron job)
 */
export async function runScheduledAggregation(
  period: AggregationPeriod,
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<{ insightsCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let insightsCreated = 0;

  try {
    const insights = await aggregateSignals(period, undefined, config);

    if (insights.length > 0) {
      await storeInsights(insights);
      insightsCreated = insights.length;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Aggregation failed: ${message}`);
    console.error('Scheduled aggregation failed:', error);
  }

  return { insightsCreated, errors };
}
