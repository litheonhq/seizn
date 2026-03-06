import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';
import type { TraceListParams } from '@/lib/fall/flight-recorder';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/traces - List user's traces
 *
 * Returns paginated list of traces for the authenticated user.
 * Supports filtering by collection, date range, errors, and search query.
 *
 * Query Parameters:
 * - limit: Number of traces to return (max 100, default 20)
 * - offset: Pagination offset (default 0)
 * - collection: Filter by collection ID
 * - start_date: Filter by start date (ISO string)
 * - end_date: Filter by end date (ISO string)
 * - has_error: Filter by error presence (true/false)
 * - experiment_id: Filter by experiment ID
 * - search: Search query text
 * - order_by: Sort field (created_at, latency, cost)
 * - order_dir: Sort direction (asc, desc)
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

    // Optional filters
    const collection = searchParams.get('collection');
    if (collection) {
      params.collectionId = collection;
    }

    const startDate = searchParams.get('start_date');
    if (startDate) {
      params.startDate = new Date(startDate);
    }

    const endDate = searchParams.get('end_date');
    if (endDate) {
      params.endDate = new Date(endDate);
    }

    const hasError = searchParams.get('has_error');
    if (hasError !== null) {
      params.hasError = hasError === 'true';
    }

    const experimentId = searchParams.get('experiment_id');
    if (experimentId) {
      params.experimentId = experimentId;
    }

    const search = searchParams.get('search');
    if (search) {
      params.searchQuery = search;
    }

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

    // Map to API response format
    const traces = result.traces.map((trace) => ({
      id: trace.id,
      request_id: trace.requestId,
      query: trace.queryText,
      collection_id: trace.collectionId,
      config: trace.effectiveConfig,
      latency: trace.timingsMs,
      cost_usd: trace.trace.cost?.total || 0,
      results_count: trace.resultsCount,
      error: trace.error,
      created_at: trace.createdAt,
      replay_of: trace.replayOf,
      experiment_id: trace.experimentId,
    }));

    return NextResponse.json({
      success: true,
      traces,
      pagination: {
        limit: params.limit,
        offset: params.offset,
        total: result.total,
        has_more: result.hasMore,
      },
    });
  } catch (error) {
    logServerError('Traces list error', error);
    return ServerErrors.internal('traces_list');
  }
}

