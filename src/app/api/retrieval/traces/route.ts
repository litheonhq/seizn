import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';
import type { TraceListParams } from '@/lib/fall/flight-recorder';

/**
 * GET /api/retrieval/traces - DevTools trace list endpoint
 *
 * Returns paginated list of retrieval traces with enhanced filtering for DevTools.
 * Supports filtering by:
 * - user_id, collection_id, date range
 * - latency thresholds (min/max)
 * - cost thresholds (min/max)
 * - rerank enabled/disabled
 * - search type (semantic/keyword/hybrid)
 * - has_error flag
 *
 * Query Parameters:
 * - limit: Number of traces (max 100, default 20)
 * - offset: Pagination offset (default 0)
 * - collection_id: Filter by collection
 * - start_date, end_date: ISO date strings
 * - min_latency, max_latency: Latency thresholds in ms
 * - min_cost, max_cost: Cost thresholds in USD
 * - search_type: 'semantic' | 'keyword' | 'hybrid'
 * - rerank_enabled: 'true' | 'false'
 * - has_error: 'true' | 'false'
 * - search: Search query text
 * - order_by: 'created_at' | 'latency' | 'cost'
 * - order_dir: 'asc' | 'desc'
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);

    // Build query params
    const params: TraceListParams = {
      userId: authResult.userId,
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    // Collection filter
    const collectionId = searchParams.get('collection_id');
    if (collectionId) {
      params.collectionId = collectionId;
    }

    // Date range filters
    const startDate = searchParams.get('start_date');
    if (startDate) {
      params.startDate = new Date(startDate);
    }

    const endDate = searchParams.get('end_date');
    if (endDate) {
      params.endDate = new Date(endDate);
    }

    // Latency filters
    const minLatency = searchParams.get('min_latency');
    if (minLatency) {
      params.minLatencyMs = parseInt(minLatency);
    }

    // Error filter
    const hasError = searchParams.get('has_error');
    if (hasError !== null) {
      params.hasError = hasError === 'true';
    }

    // Search query
    const search = searchParams.get('search');
    if (search) {
      params.searchQuery = search;
    }

    // Sorting
    const orderBy = searchParams.get('order_by') as 'created_at' | 'latency' | 'cost' | null;
    if (orderBy && ['created_at', 'latency', 'cost'].includes(orderBy)) {
      params.orderBy = orderBy;
    }

    const orderDir = searchParams.get('order_dir') as 'asc' | 'desc' | null;
    if (orderDir && ['asc', 'desc'].includes(orderDir)) {
      params.orderDirection = orderDir;
    }

    // Fetch traces
    const store = getTraceStore();
    const result = await store.listTraces(params);

    // Additional client-side filters for DevTools
    const maxLatency = searchParams.get('max_latency')
      ? parseInt(searchParams.get('max_latency')!)
      : null;
    const minCost = searchParams.get('min_cost')
      ? parseFloat(searchParams.get('min_cost')!)
      : null;
    const maxCost = searchParams.get('max_cost')
      ? parseFloat(searchParams.get('max_cost')!)
      : null;
    const searchType = searchParams.get('search_type');
    const rerankEnabled = searchParams.get('rerank_enabled');

    // Filter traces
    let filteredTraces = result.traces;

    if (maxLatency !== null) {
      filteredTraces = filteredTraces.filter((t) => {
        const totalLatency = Object.values(t.timingsMs || {}).reduce((a, b) => a + b, 0);
        return totalLatency <= maxLatency;
      });
    }

    if (minCost !== null) {
      filteredTraces = filteredTraces.filter((t) => (t.trace.cost?.total || 0) >= minCost);
    }

    if (maxCost !== null) {
      filteredTraces = filteredTraces.filter((t) => (t.trace.cost?.total || 0) <= maxCost);
    }

    if (searchType) {
      filteredTraces = filteredTraces.filter((t) => t.effectiveConfig?.searchType === searchType);
    }

    if (rerankEnabled !== null) {
      const enabled = rerankEnabled === 'true';
      filteredTraces = filteredTraces.filter((t) => t.effectiveConfig?.rerankEnabled === enabled);
    }

    // Map to DevTools response format
    const traces = filteredTraces.map((trace) => ({
      id: trace.id,
      request_id: trace.requestId,
      query: trace.queryText,
      query_hash: trace.queryHash,
      collection_id: trace.collectionId,
      collection_ids: trace.collectionIds,
      // Config snapshot
      config: {
        search_type: trace.effectiveConfig?.searchType || 'hybrid',
        embedding_model: trace.effectiveConfig?.embeddingModel,
        hybrid_alpha: trace.effectiveConfig?.hybridAlpha,
        top_k: trace.effectiveConfig?.topK || 10,
        rerank_enabled: trace.effectiveConfig?.rerankEnabled || false,
        rerank_model: trace.effectiveConfig?.rerankModel,
        rerank_top_n: trace.effectiveConfig?.rerankTopN,
      },
      // Timings
      timings_ms: trace.timingsMs,
      total_latency_ms: Object.values(trace.timingsMs || {}).reduce((a, b) => a + b, 0),
      // Cost
      cost: trace.trace.cost,
      cost_usd: trace.trace.cost?.total || 0,
      // Results
      results_count: trace.resultsCount,
      result_stats: trace.trace.resultStats,
      // Status
      error: trace.error,
      has_error: !!trace.error,
      sampled: trace.sampled,
      // Autopilot
      autopilot_reason: trace.autopilotReason,
      // Experiment
      experiment_id: trace.experimentId,
      arm_id: trace.armId,
      // Replay
      replay_of: trace.replayOf,
      // Timestamps
      created_at: trace.createdAt,
    }));

    return NextResponse.json({
      success: true,
      traces,
      pagination: {
        limit: params.limit,
        offset: params.offset,
        total: result.total,
        has_more: result.hasMore,
        filtered_count: traces.length,
      },
      filters_applied: {
        collection_id: collectionId,
        start_date: startDate,
        end_date: endDate,
        min_latency: minLatency ? parseInt(minLatency) : null,
        max_latency: maxLatency,
        min_cost: minCost,
        max_cost: maxCost,
        search_type: searchType,
        rerank_enabled: rerankEnabled !== null ? rerankEnabled === 'true' : null,
        has_error: hasError !== null ? hasError === 'true' : null,
        search: search,
      },
    });
  } catch (error) {
    console.error('DevTools traces list error:', error);
    return ServerErrors.internal('devtools_traces_list');
  }
}
