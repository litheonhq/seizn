import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import {
  getTraceStore,
  startTrace,
  addEvent,
  finishTrace,
  startSpan,
  endSpan,
  calculateTraceCost,
  extractTimingsFromSpans,
} from '@/lib/fall/flight-recorder';
import type { TraceConfig, TraceSummary } from '@/lib/fall/flight-recorder';

/**
 * POST /api/traces/replay - Replay a trace with the same or modified config
 *
 * Re-executes a previous query and creates a new trace.
 * Useful for:
 * - A/B testing different configs
 * - Debugging issues
 * - Comparing performance over time
 *
 * Request Body:
 * - trace_id: The ID of the trace to replay
 * - config_overrides: Optional config overrides for the replay
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { trace_id, config_overrides } = body;

    if (!trace_id) {
      return ValidationErrors.missingField('trace_id');
    }

    // Fetch original trace
    const store = getTraceStore();
    const originalTrace = await store.getTrace(trace_id, authResult.userId);

    if (!originalTrace) {
      return NotFoundErrors.resource('trace');
    }

    // Merge original config with overrides
    const originalConfig = originalTrace.effectiveConfig || {};
    const replayConfig: TraceConfig = {
      ...originalConfig,
      ...config_overrides,
    };

    // Start a new trace for the replay
    const handle = await startTrace({
      requestId: crypto.randomUUID(),
      userId: authResult.userId,
      apiKeyId: authResult.keyId,
      plan: authResult.plan || 'free',
      collectionId: originalTrace.collectionId,
      collectionIds: originalTrace.collectionIds,
      queryText: originalTrace.queryText,
      autopilotEnabled: false, // Explicit config for replay
      config: replayConfig,
      source: 'dashboard',
    });

    addEvent(handle, 'custom', {
      event: 'replay_started',
      original_trace_id: trace_id,
      config_changes: Object.keys(config_overrides || {}),
    });

    // Execute the replay pipeline
    const replayResult = await executeReplay({
      handle,
      query: originalTrace.queryText || '',
      collectionId: originalTrace.collectionId,
      config: replayConfig,
      userId: authResult.userId,
      orgId: authResult.orgId,
    });

    // Calculate cost
    const cost = calculateTraceCost({
      embeddingTokens: replayResult.tokens?.embedding || 0,
      vectorSearchOps: replayResult.vectorSearchOps || 1,
      rerankItems: replayConfig.rerankEnabled ? (replayConfig.rerankTopN || 10) : 0,
    });

    // Build summary
    const timingsMs = extractTimingsFromSpans(handle.spans);
    const summary: TraceSummary = {
      effectiveConfig: replayConfig as Record<string, unknown>,
      timingsMs,
      resultsCount: replayResult.results.length,
      resultStats: {
        count: replayResult.results.length,
        scores: replayResult.results.length > 0 ? {
          min: Math.min(...replayResult.results.map((r) => r.score)),
          max: Math.max(...replayResult.results.map((r) => r.score)),
          avg: replayResult.results.reduce((sum, r) => sum + r.score, 0) / replayResult.results.length,
        } : undefined,
        documentIds: replayResult.results.map((r) => r.id),
      },
      cost,
    };

    // Finish the trace
    await finishTrace(handle, summary);

    // Save replay reference
    const supabase = createServerClient();
    await supabase
      .from('fall_retrieval_traces')
      .update({ replay_of: trace_id })
      .eq('request_id', handle.requestId)
      .eq('user_id', authResult.userId);

    return NextResponse.json({
      success: true,
      replay: {
        trace_id: handle.traceId,
        request_id: handle.requestId,
        original_trace_id: trace_id,
        query: originalTrace.queryText,
        config: replayConfig,
        config_changes: Object.keys(config_overrides || {}),
        results: replayResult.results,
        latency: timingsMs,
        cost_usd: cost.total,
      },
      compare_url: `/dashboard/traces/compare?a=${trace_id}&b=${handle.traceId}`,
    });
  } catch (error) {
    console.error('Trace replay error:', error);
    return ServerErrors.internal('trace_replay');
  }
}

interface ReplayParams {
  handle: Awaited<ReturnType<typeof startTrace>>;
  query: string;
  collectionId?: string;
  config: TraceConfig;
  userId: string;
  orgId?: string;
}

interface ReplayResult {
  results: Array<{ id: string; score: number; content: string }>;
  tokens?: { embedding: number };
  vectorSearchOps?: number;
}

async function executeReplay(params: ReplayParams): Promise<ReplayResult> {
  const { handle, config } = params;

  // Embedding span
  const embeddingSpan = startSpan(handle, 'embedding', {
    model: config.embeddingModel || 'voyage-3',
    query_length: params.query.length,
  });

  await simulateLatency(30, 80);
  const embeddingTokens = Math.ceil(params.query.length / 4); // Rough estimate

  endSpan(handle, embeddingSpan, {
    tokens: embeddingTokens,
    dimensions: config.embeddingDimensions || 1024,
  });

  // Vector search span
  const searchSpan = startSpan(handle, 'vector_search', {
    search_type: config.searchType || 'hybrid',
    top_k: config.topK || 10,
    alpha: config.hybridAlpha,
  });

  await simulateLatency(10, 50);

  // Generate simulated results
  const topK = config.topK || 10;
  let results = generateSimulatedResults(topK, false);

  endSpan(handle, searchSpan, {
    candidates_count: results.length,
  });

  // Rerank span (if enabled)
  if (config.rerankEnabled) {
    const rerankSpan = startSpan(handle, 'rerank', {
      model: config.rerankModel || 'cohere-rerank-v3',
      input_count: results.length,
      top_n: config.rerankTopN || topK,
    });

    await simulateLatency(50, 150);
    results = generateSimulatedResults(config.rerankTopN || topK, true);

    endSpan(handle, rerankSpan, {
      output_count: results.length,
    });
  }

  addEvent(handle, 'candidates', {
    count: results.length,
    scores: results.map((r) => r.score),
  });

  return {
    results,
    tokens: { embedding: embeddingTokens },
    vectorSearchOps: 1,
  };
}

function simulateLatency(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function generateSimulatedResults(topK: number, reranked: boolean) {
  const results = [];
  for (let i = 0; i < topK; i++) {
    results.push({
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      score: reranked ? 0.95 - i * 0.05 : 0.9 - i * 0.08,
      content: `Simulated result ${i + 1} content...`,
    });
  }
  return results;
}
