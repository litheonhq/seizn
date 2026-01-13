import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';

/**
 * GET /api/traces/[id] - Get a specific trace by ID
 *
 * Returns the full trace details including spans, events, and cost breakdown.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await context.params;

    if (!id) {
      return NotFoundErrors.resource('trace');
    }

    const store = getTraceStore();
    const trace = await store.getTrace(id, authResult.userId);

    if (!trace) {
      return NotFoundErrors.resource('trace');
    }

    // Map to API response format
    return NextResponse.json({
      success: true,
      trace: {
        id: trace.id,
        request_id: trace.requestId,
        user_id: trace.userId,
        api_key_id: trace.apiKeyId,
        plan: trace.plan,
        collection_id: trace.collectionId,
        collection_ids: trace.collectionIds,
        query_text: trace.queryText,
        query_hash: trace.queryHash,
        autopilot_reason: trace.autopilotReason,
        effective_config: trace.effectiveConfig,
        timings_ms: trace.timingsMs,
        results_count: trace.resultsCount,
        error: trace.error,
        sampled: trace.sampled,
        experiment_id: trace.experimentId,
        arm_id: trace.armId,
        replay_of: trace.replayOf,
        created_at: trace.createdAt,
        // Full trace data
        trace_data: {
          trace_id: trace.trace.traceId,
          started_at: trace.trace.startedAt,
          ended_at: trace.trace.endedAt,
          total_duration_ms: trace.trace.totalDurationMs,
          autopilot: trace.trace.autopilot,
          config: trace.trace.config,
          spans: trace.trace.spans,
          events: trace.trace.events,
          result_stats: trace.trace.resultStats,
          cost: trace.trace.cost,
        },
      },
    });
  } catch (error) {
    console.error('Trace get error:', error);
    return ServerErrors.internal('trace_get');
  }
}

/**
 * DELETE /api/traces/[id] - Delete a trace
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await context.params;

    if (!id) {
      return NotFoundErrors.resource('trace');
    }

    const store = getTraceStore();
    const deleted = await store.deleteTrace(id, authResult.userId);

    if (!deleted) {
      return NotFoundErrors.resource('trace');
    }

    return NextResponse.json({
      success: true,
      message: 'Trace deleted',
    });
  } catch (error) {
    console.error('Trace delete error:', error);
    return ServerErrors.internal('trace_delete');
  }
}
