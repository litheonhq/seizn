import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, ServerErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';

/**
 * POST /api/traces/compare - Compare two traces
 *
 * Compares two traces and returns a detailed diff including:
 * - Top-K overlap and ranking changes
 * - Latency differences
 * - Cost differences
 * - Config differences
 * - Answer contract pass/fail differences
 *
 * Request Body:
 * - trace_id_a: First trace ID
 * - trace_id_b: Second trace ID
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { trace_id_a, trace_id_b } = body;

    if (!trace_id_a || !trace_id_b) {
      return ValidationErrors.missingField('trace_id_a and trace_id_b are required');
    }

    const store = getTraceStore();
    const comparison = await store.compareTraces(trace_id_a, trace_id_b, authResult.userId);

    if (!comparison) {
      return ValidationErrors.invalidFormat('trace_id', 'One or both traces not found');
    }

    // Get trace metadata for context
    const [traceA, traceB] = await Promise.all([
      store.getTrace(trace_id_a, authResult.userId),
      store.getTrace(trace_id_b, authResult.userId),
    ]);

    // Map to snake_case for API consistency
    return NextResponse.json({
      success: true,
      diff: {
        results: {
          overlap_count: comparison.results.overlapCount,
          overlap_percent: comparison.results.overlapPercent,
          only_in_a: comparison.results.onlyInA,
          only_in_b: comparison.results.onlyInB,
          ranking_changes: comparison.results.rankingChanges.map((rc) => ({
            id: rc.id,
            rank_a: rc.rankA,
            rank_b: rc.rankB,
            delta: rc.delta,
          })),
        },
        latency: {
          embedding_ms: {
            a: comparison.latency.embedding.a,
            b: comparison.latency.embedding.b,
            delta: comparison.latency.embedding.delta,
            delta_percent: comparison.latency.embedding.deltaPercent,
          },
          search_ms: {
            a: comparison.latency.search.a,
            b: comparison.latency.search.b,
            delta: comparison.latency.search.delta,
            delta_percent: comparison.latency.search.deltaPercent,
          },
          rerank_ms: {
            a: comparison.latency.rerank.a,
            b: comparison.latency.rerank.b,
            delta: comparison.latency.rerank.delta,
          },
          total_ms: {
            a: comparison.latency.total.a,
            b: comparison.latency.total.b,
            delta: comparison.latency.total.delta,
            delta_percent: comparison.latency.total.deltaPercent,
          },
        },
        cost: {
          a: comparison.cost.a,
          b: comparison.cost.b,
          delta: comparison.cost.delta,
          delta_percent: comparison.cost.deltaPercent,
        },
        config: comparison.config,
        summary: {
          results_improved: comparison.summary.resultsImproved,
          results_degraded: comparison.summary.resultsDegraded,
          latency_improved: comparison.summary.latencyImproved,
          cost_improved: comparison.summary.costImproved,
        },
      },
      trace_a: traceA ? {
        id: traceA.id,
        query: traceA.queryText,
        collection_id: traceA.collectionId,
        created_at: traceA.createdAt,
        replay_of: traceA.replayOf,
      } : null,
      trace_b: traceB ? {
        id: traceB.id,
        query: traceB.queryText,
        collection_id: traceB.collectionId,
        created_at: traceB.createdAt,
        replay_of: traceB.replayOf,
      } : null,
    });
  } catch (error) {
    console.error('Trace compare error:', error);
    return ServerErrors.internal('trace_compare');
  }
}

/**
 * GET /api/traces/compare - Compare traces via query params
 *
 * Query Parameters:
 * - a: First trace ID
 * - b: Second trace ID
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const traceIdA = searchParams.get('a');
    const traceIdB = searchParams.get('b');

    if (!traceIdA || !traceIdB) {
      return ValidationErrors.missingField('a and b query parameters are required');
    }

    // Reuse POST handler logic
    const store = getTraceStore();
    const comparison = await store.compareTraces(traceIdA, traceIdB, authResult.userId);

    if (!comparison) {
      return ValidationErrors.invalidFormat('trace_id', 'One or both traces not found');
    }

    const [traceA, traceB] = await Promise.all([
      store.getTrace(traceIdA, authResult.userId),
      store.getTrace(traceIdB, authResult.userId),
    ]);

    return NextResponse.json({
      success: true,
      diff: {
        results: {
          overlap_count: comparison.results.overlapCount,
          overlap_percent: comparison.results.overlapPercent,
          only_in_a: comparison.results.onlyInA,
          only_in_b: comparison.results.onlyInB,
          ranking_changes: comparison.results.rankingChanges.map((rc) => ({
            id: rc.id,
            rank_a: rc.rankA,
            rank_b: rc.rankB,
            delta: rc.delta,
          })),
        },
        latency: {
          embedding_ms: {
            a: comparison.latency.embedding.a,
            b: comparison.latency.embedding.b,
            delta: comparison.latency.embedding.delta,
            delta_percent: comparison.latency.embedding.deltaPercent,
          },
          search_ms: {
            a: comparison.latency.search.a,
            b: comparison.latency.search.b,
            delta: comparison.latency.search.delta,
            delta_percent: comparison.latency.search.deltaPercent,
          },
          rerank_ms: {
            a: comparison.latency.rerank.a,
            b: comparison.latency.rerank.b,
            delta: comparison.latency.rerank.delta,
          },
          total_ms: {
            a: comparison.latency.total.a,
            b: comparison.latency.total.b,
            delta: comparison.latency.total.delta,
            delta_percent: comparison.latency.total.deltaPercent,
          },
        },
        cost: {
          a: comparison.cost.a,
          b: comparison.cost.b,
          delta: comparison.cost.delta,
          delta_percent: comparison.cost.deltaPercent,
        },
        config: comparison.config,
        summary: {
          results_improved: comparison.summary.resultsImproved,
          results_degraded: comparison.summary.resultsDegraded,
          latency_improved: comparison.summary.latencyImproved,
          cost_improved: comparison.summary.costImproved,
        },
      },
      trace_a: traceA ? {
        id: traceA.id,
        query: traceA.queryText,
        collection_id: traceA.collectionId,
        created_at: traceA.createdAt,
      } : null,
      trace_b: traceB ? {
        id: traceB.id,
        query: traceB.queryText,
        collection_id: traceB.collectionId,
        created_at: traceB.createdAt,
      } : null,
    });
  } catch (error) {
    console.error('Trace compare error:', error);
    return ServerErrors.internal('trace_compare');
  }
}
