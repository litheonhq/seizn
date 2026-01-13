/**
 * Flight Recorder Store
 *
 * Supabase-backed storage for traces with query, list, and comparison operations.
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import type {
  StoredTrace,
  TraceListParams,
  TraceListResult,
  TraceComparisonResult,
  TraceHandle,
  TraceSummary,
  TraceConfig,
  TraceCost,
} from './types';

// ============================================
// Helper Functions
// ============================================

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Map database row to StoredTrace type
 */
function mapRowToStoredTrace(row: Record<string, unknown>): StoredTrace {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    userId: row.user_id as string,
    apiKeyId: row.api_key_id as string | undefined,
    plan: row.plan as string,
    collectionId: row.collection_id as string | undefined,
    collectionIds: row.collection_ids as string[] | undefined,
    queryText: row.query_text as string | undefined,
    queryHash: row.query_hash as string | undefined,
    autopilotReason: row.autopilot_reason as string | undefined,
    effectiveConfig: (row.effective_config || {}) as TraceConfig,
    timingsMs: (row.timings_ms || {}) as Record<string, number>,
    resultsCount: (row.results_count || 0) as number,
    error: row.error as string | undefined,
    sampled: row.sampled as boolean,
    experimentId: row.experiment_id as string | undefined,
    armId: row.arm_id as string | undefined,
    trace: row.trace as StoredTrace['trace'],
    createdAt: row.created_at as string,
    replayOf: row.replay_of as string | undefined,
  };
}

// ============================================
// Trace Store Class
// ============================================

export class TraceStore {
  private readonly tableName = 'fall_retrieval_traces';

  /**
   * Save a trace to the database
   */
  async saveTrace(handle: TraceHandle, summary?: TraceSummary): Promise<string> {
    const supabase = createServerClient();

    const queryText = handle.base.queryText;
    const queryHash = queryText ? sha256(queryText) : null;
    const endedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - handle.startedAtMs;

    // Build the trace JSONB
    const traceData = {
      trace_id: handle.traceId,
      started_at: new Date(handle.startedAtMs).toISOString(),
      ended_at: endedAt,
      total_duration_ms: totalDurationMs,
      autopilot: {
        enabled: handle.base.autopilotEnabled ?? true,
        reason: summary?.autopilotReason,
      },
      config: summary?.effectiveConfig || handle.base.config || {},
      spans: handle.spans || [],
      events: handle.events,
      result_stats: summary?.resultStats,
      cost: summary?.cost,
    };

    const payload = {
      request_id: handle.requestId,
      user_id: handle.base.userId,
      api_key_id: handle.base.apiKeyId ?? null,
      plan: handle.base.plan ?? 'free',
      collection_id: handle.base.collectionId ?? null,
      collection_ids: handle.base.collectionIds ?? null,
      query_text: queryText ?? null,
      query_hash: queryHash,
      autopilot_reason: summary?.autopilotReason ?? null,
      effective_config: summary?.effectiveConfig ?? {},
      timings_ms: summary?.timingsMs ?? {},
      results_count: summary?.resultsCount ?? 0,
      error: summary?.error ?? null,
      sampled: true,
      experiment_id: summary?.experimentId ?? null,
      arm_id: summary?.armId ?? null,
      trace: traceData,
    };

    const { data, error } = await supabase
      .from(this.tableName)
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error('[TraceStore] Failed to save trace:', error);
      throw error;
    }

    return data.id;
  }

  /**
   * Get a trace by ID
   */
  async getTrace(traceId: string, userId: string): Promise<StoredTrace | null> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', traceId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return mapRowToStoredTrace(data);
  }

  /**
   * Get a trace by request ID
   */
  async getTraceByRequestId(requestId: string, userId: string): Promise<StoredTrace | null> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('request_id', requestId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return mapRowToStoredTrace(data);
  }

  /**
   * List traces with filters and pagination
   */
  async listTraces(params: TraceListParams): Promise<TraceListResult> {
    const supabase = createServerClient();
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = params.offset ?? 0;

    let query = supabase
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('user_id', params.userId);

    // Apply filters
    if (params.collectionId) {
      query = query.eq('collection_id', params.collectionId);
    }

    if (params.startDate) {
      query = query.gte('created_at', params.startDate.toISOString());
    }

    if (params.endDate) {
      query = query.lte('created_at', params.endDate.toISOString());
    }

    if (params.hasError !== undefined) {
      if (params.hasError) {
        query = query.not('error', 'is', null);
      } else {
        query = query.is('error', null);
      }
    }

    if (params.experimentId) {
      query = query.eq('experiment_id', params.experimentId);
    }

    if (params.searchQuery) {
      query = query.ilike('query_text', `%${params.searchQuery}%`);
    }

    // Apply sorting
    const orderColumn = params.orderBy === 'latency'
      ? 'timings_ms->total'
      : params.orderBy === 'cost'
        ? 'trace->cost->total'
        : 'created_at';

    query = query.order(orderColumn, {
      ascending: params.orderDirection === 'asc',
    });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[TraceStore] Failed to list traces:', error);
      throw error;
    }

    const traces = (data || []).map(mapRowToStoredTrace);
    const total = count ?? traces.length;

    return {
      traces,
      total,
      hasMore: offset + traces.length < total,
    };
  }

  /**
   * Delete a trace
   */
  async deleteTrace(traceId: string, userId: string): Promise<boolean> {
    const supabase = createServerClient();

    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('id', traceId)
      .eq('user_id', userId);

    if (error) {
      console.error('[TraceStore] Failed to delete trace:', error);
      return false;
    }

    return true;
  }

  /**
   * Compare two traces
   */
  async compareTraces(
    traceIdA: string,
    traceIdB: string,
    userId: string
  ): Promise<TraceComparisonResult | null> {
    const [traceA, traceB] = await Promise.all([
      this.getTrace(traceIdA, userId),
      this.getTrace(traceIdB, userId),
    ]);

    if (!traceA || !traceB) {
      return null;
    }

    return calculateComparison(traceA, traceB);
  }

  /**
   * Get traces for replay (original + replays)
   */
  async getReplayChain(traceId: string, userId: string): Promise<StoredTrace[]> {
    const supabase = createServerClient();

    // Get the original trace
    const original = await this.getTrace(traceId, userId);
    if (!original) {
      return [];
    }

    // Find the root trace ID
    let rootId = traceId;
    if (original.replayOf) {
      // This trace is a replay, find the original
      const parent = await this.getTrace(original.replayOf, userId);
      if (parent) {
        rootId = parent.replayOf || parent.id;
      }
    }

    // Get all traces in this replay chain
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .or(`id.eq.${rootId},replay_of.eq.${rootId}`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[TraceStore] Failed to get replay chain:', error);
      return [];
    }

    return (data || []).map(mapRowToStoredTrace);
  }

  /**
   * Get aggregated statistics for a user
   */
  async getTraceStats(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalTraces: number;
    avgLatencyMs: number;
    totalCostUsd: number;
    errorRate: number;
    topCollections: Array<{ id: string; count: number }>;
  }> {
    const supabase = createServerClient();

    let query = supabase
      .from(this.tableName)
      .select('id, timings_ms, trace, error, collection_id')
      .eq('user_id', userId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error || !data) {
      return {
        totalTraces: 0,
        avgLatencyMs: 0,
        totalCostUsd: 0,
        errorRate: 0,
        topCollections: [],
      };
    }

    const totalTraces = data.length;
    const errorCount = data.filter((t) => t.error).length;

    let totalLatency = 0;
    let totalCost = 0;
    const collectionCounts: Record<string, number> = {};

    for (const trace of data) {
      const timings = trace.timings_ms as Record<string, number> | null;
      const traceData = trace.trace as { cost?: TraceCost } | null;

      if (timings?.total) {
        totalLatency += timings.total;
      }

      if (traceData?.cost?.total) {
        totalCost += traceData.cost.total;
      }

      if (trace.collection_id) {
        collectionCounts[trace.collection_id] = (collectionCounts[trace.collection_id] || 0) + 1;
      }
    }

    const topCollections = Object.entries(collectionCounts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalTraces,
      avgLatencyMs: totalTraces > 0 ? totalLatency / totalTraces : 0,
      totalCostUsd: totalCost,
      errorRate: totalTraces > 0 ? errorCount / totalTraces : 0,
      topCollections,
    };
  }
}

// ============================================
// Comparison Logic
// ============================================

function calculateComparison(
  traceA: StoredTrace,
  traceB: StoredTrace
): TraceComparisonResult {
  // Get result document IDs
  const idsA = traceA.trace.resultStats?.documentIds || [];
  const idsB = traceB.trace.resultStats?.documentIds || [];
  const setA = new Set(idsA);
  const setB = new Set(idsB);

  const overlap = idsA.filter((id) => setB.has(id));
  const onlyInA = idsA.filter((id) => !setB.has(id));
  const onlyInB = idsB.filter((id) => !setA.has(id));

  // Calculate ranking changes
  const rankingChanges = overlap.map((id) => {
    const rankA = idsA.indexOf(id) + 1;
    const rankB = idsB.indexOf(id) + 1;
    return {
      id,
      rankA,
      rankB,
      delta: rankA - rankB,
    };
  });

  // Latency comparison
  const timingsA = traceA.timingsMs || {};
  const timingsB = traceB.timingsMs || {};

  const calcLatencyDiff = (key: string) => {
    const a = timingsA[key] || 0;
    const b = timingsB[key] || 0;
    return {
      a,
      b,
      delta: b - a,
      deltaPercent: a > 0 ? ((b - a) / a) * 100 : 0,
    };
  };

  const latencyDiff = {
    embedding: calcLatencyDiff('embedding'),
    search: calcLatencyDiff('search'),
    rerank: {
      a: timingsA.rerank || 0,
      b: timingsB.rerank || 0,
      delta: (timingsB.rerank || 0) - (timingsA.rerank || 0),
    },
    total: calcLatencyDiff('total'),
  };

  // Cost comparison
  const costA = traceA.trace.cost?.total || 0;
  const costB = traceB.trace.cost?.total || 0;
  const costDiff = {
    a: costA,
    b: costB,
    delta: costB - costA,
    deltaPercent: costA > 0 ? ((costB - costA) / costA) * 100 : 0,
  };

  // Config comparison
  const configA = traceA.effectiveConfig || {};
  const configB = traceB.effectiveConfig || {};
  const allKeys = new Set([...Object.keys(configA), ...Object.keys(configB)]);

  const configDiff: Record<string, { a: unknown; b: unknown; changed: boolean }> = {};
  for (const key of allKeys) {
    const a = configA[key as keyof TraceConfig];
    const b = configB[key as keyof TraceConfig];
    configDiff[key] = {
      a,
      b,
      changed: JSON.stringify(a) !== JSON.stringify(b),
    };
  }

  // Summary
  const resultsImproved = rankingChanges.filter((r) => r.delta > 0).length;
  const resultsDegraded = rankingChanges.filter((r) => r.delta < 0).length;

  return {
    results: {
      overlapCount: overlap.length,
      overlapPercent: Math.max(idsA.length, idsB.length) > 0
        ? (overlap.length / Math.max(idsA.length, idsB.length)) * 100
        : 0,
      onlyInA,
      onlyInB,
      rankingChanges,
    },
    latency: latencyDiff,
    cost: costDiff,
    config: configDiff,
    summary: {
      resultsImproved,
      resultsDegraded,
      latencyImproved: latencyDiff.total.delta < 0,
      costImproved: costDiff.delta < 0,
    },
  };
}

// ============================================
// Singleton Export
// ============================================

let storeInstance: TraceStore | null = null;

export function getTraceStore(): TraceStore {
  if (!storeInstance) {
    storeInstance = new TraceStore();
  }
  return storeInstance;
}

export { calculateComparison };
