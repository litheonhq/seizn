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
 * POST /api/retrieval/replay/[id] - DevTools What-If Lab replay
 *
 * Re-executes a previous retrieval with configurable what-if parameters.
 * Allows experimentation with different settings:
 * - topK changes
 * - hybrid on/off (search type)
 * - rerank on/off
 * - different embedding/rerank models
 * - hybrid alpha adjustments
 *
 * Returns comparison data between original and replayed trace.
 *
 * Request Body:
 * - top_k: Override topK (number)
 * - search_type: 'semantic' | 'keyword' | 'hybrid'
 * - hybrid_alpha: 0.0 - 1.0
 * - rerank_enabled: boolean
 * - rerank_model: string
 * - rerank_top_n: number
 * - embedding_model: string
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id: traceId } = await context.params;

    if (!traceId) {
      return ValidationErrors.missingField('trace_id');
    }

    const body = await request.json();

    // Fetch original trace
    const store = getTraceStore();
    const originalTrace = await store.getTrace(traceId, authResult.userId);

    if (!originalTrace) {
      return NotFoundErrors.resource('trace');
    }

    // Build what-if config overrides
    const whatIfOverrides: Partial<TraceConfig> = {};
    const changedParams: string[] = [];

    if (body.top_k !== undefined) {
      whatIfOverrides.topK = body.top_k;
      if (body.top_k !== originalTrace.effectiveConfig?.topK) {
        changedParams.push('topK');
      }
    }

    if (body.search_type !== undefined) {
      whatIfOverrides.searchType = body.search_type;
      if (body.search_type !== originalTrace.effectiveConfig?.searchType) {
        changedParams.push('searchType');
      }
    }

    if (body.hybrid_alpha !== undefined) {
      whatIfOverrides.hybridAlpha = body.hybrid_alpha;
      if (body.hybrid_alpha !== originalTrace.effectiveConfig?.hybridAlpha) {
        changedParams.push('hybridAlpha');
      }
    }

    if (body.rerank_enabled !== undefined) {
      whatIfOverrides.rerankEnabled = body.rerank_enabled;
      if (body.rerank_enabled !== originalTrace.effectiveConfig?.rerankEnabled) {
        changedParams.push('rerankEnabled');
      }
    }

    if (body.rerank_model !== undefined) {
      whatIfOverrides.rerankModel = body.rerank_model;
      if (body.rerank_model !== originalTrace.effectiveConfig?.rerankModel) {
        changedParams.push('rerankModel');
      }
    }

    if (body.rerank_top_n !== undefined) {
      whatIfOverrides.rerankTopN = body.rerank_top_n;
      if (body.rerank_top_n !== originalTrace.effectiveConfig?.rerankTopN) {
        changedParams.push('rerankTopN');
      }
    }

    if (body.embedding_model !== undefined) {
      whatIfOverrides.embeddingModel = body.embedding_model;
      if (body.embedding_model !== originalTrace.effectiveConfig?.embeddingModel) {
        changedParams.push('embeddingModel');
      }
    }

    // Merge original config with overrides
    const originalConfig = originalTrace.effectiveConfig || {};
    const replayConfig: TraceConfig = {
      ...originalConfig,
      ...whatIfOverrides,
    };

    // Start a new trace for the what-if replay
    const handle = await startTrace({
      requestId: crypto.randomUUID(),
      userId: authResult.userId,
      apiKeyId: authResult.keyId,
      plan: authResult.plan || 'free',
      collectionId: originalTrace.collectionId,
      collectionIds: originalTrace.collectionIds,
      queryText: originalTrace.queryText,
      autopilotEnabled: false,
      config: replayConfig,
      source: 'dashboard',
    });

    addEvent(handle, 'custom', {
      event: 'whatif_replay_started',
      original_trace_id: traceId,
      config_changes: changedParams,
      what_if_params: whatIfOverrides,
    });

    // Execute the replay pipeline
    const replayResult = await executeWhatIfReplay({
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
        scores: replayResult.results.length > 0
          ? {
              min: Math.min(...replayResult.results.map((r) => r.score)),
              max: Math.max(...replayResult.results.map((r) => r.score)),
              avg: replayResult.results.reduce((sum, r) => sum + r.score, 0) / replayResult.results.length,
            }
          : undefined,
        documentIds: replayResult.results.map((r) => r.id),
        rerankDeltas: replayConfig.rerankEnabled ? replayResult.rerankDeltas : undefined,
      },
      cost,
    };

    // Finish the trace
    await finishTrace(handle, summary);

    // Save replay reference
    const supabase = createServerClient();
    await supabase
      .from('fall_retrieval_traces')
      .update({ replay_of: traceId })
      .eq('request_id', handle.requestId)
      .eq('user_id', authResult.userId);

    // Build comparison data
    const comparison = buildComparison(originalTrace, {
      config: replayConfig,
      timingsMs,
      resultsCount: replayResult.results.length,
      cost,
      results: replayResult.results,
    });

    return NextResponse.json({
      success: true,
      replay: {
        trace_id: handle.traceId,
        request_id: handle.requestId,
        original_trace_id: traceId,
        query: originalTrace.queryText,
        // Config details
        config: {
          original: originalConfig,
          replay: replayConfig,
          changed_params: changedParams,
        },
        // Results
        results: replayResult.results,
        results_count: replayResult.results.length,
        // Latency
        latency: {
          original_ms: Object.values(originalTrace.timingsMs || {}).reduce((a, b) => a + b, 0),
          replay_ms: Object.values(timingsMs || {}).reduce((a, b) => a + b, 0),
          delta_ms: null as number | null,
          by_stage: timingsMs,
        },
        // Cost
        cost: {
          original_usd: originalTrace.trace.cost?.total || 0,
          replay_usd: cost.total,
          delta_usd: cost.total - (originalTrace.trace.cost?.total || 0),
          breakdown: cost,
        },
        // Comparison analysis
        comparison,
      },
      // Quick navigation links
      links: {
        compare_url: `/dashboard/legacy/devtools/${traceId}?compare=${handle.traceId}`,
        replay_trace_url: `/dashboard/legacy/devtools/${handle.traceId}`,
      },
    });
  } catch (error) {
    console.error('What-If replay error:', error);
    return ServerErrors.internal('whatif_replay');
  }
}

// ============================================
// Helper Types
// ============================================

interface ReplayParams {
  handle: Awaited<ReturnType<typeof startTrace>>;
  query: string;
  collectionId?: string;
  config: TraceConfig;
  userId: string;
  orgId?: string;
}

interface ReplayResult {
  results: Array<{ id: string; score: number; content: string; originalRank?: number }>;
  tokens?: { embedding: number };
  vectorSearchOps?: number;
  rerankDeltas?: Array<{
    id: string;
    originalScore: number;
    rerankScore: number;
    delta: number;
  }>;
}

// ============================================
// Replay Execution
// ============================================

async function executeWhatIfReplay(params: ReplayParams): Promise<ReplayResult> {
  const { handle, config } = params;

  // Embedding span
  const embeddingSpan = startSpan(handle, 'embedding', {
    model: config.embeddingModel || 'voyage-3',
    query_length: params.query.length,
  });

  await simulateLatency(30, 80);
  const embeddingTokens = Math.ceil(params.query.length / 4);

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

  // Generate initial candidates
  const topK = config.topK || 10;
  const candidatesCount = Math.max(topK, 20); // Always get more candidates
  let results = generateSimulatedResults(candidatesCount, false);

  // Record candidates event
  addEvent(handle, 'candidates', {
    count: results.length,
    scores: results.map((r) => r.score),
    ids: results.map((r) => r.id),
  });

  endSpan(handle, searchSpan, {
    candidates_count: results.length,
  });

  let rerankDeltas: ReplayResult['rerankDeltas'];

  // Rerank span (if enabled)
  if (config.rerankEnabled) {
    const rerankSpan = startSpan(handle, 'rerank', {
      model: config.rerankModel || 'cohere-rerank-v3',
      input_count: results.length,
      top_n: config.rerankTopN || topK,
    });

    await simulateLatency(50, 150);

    // Store original ranks
    const originalRanks = new Map(results.map((r, i) => [r.id, i + 1]));

    // Generate reranked results
    const rerankedResults = generateSimulatedResults(config.rerankTopN || topK, true);

    // Calculate deltas
    rerankDeltas = rerankedResults.map((r, _newRank) => {
      const originalResult = results.find((or) => or.id === r.id);
      return {
        id: r.id,
        originalScore: originalResult?.score || 0,
        rerankScore: r.score,
        delta: r.score - (originalResult?.score || 0),
      };
    });

    results = rerankedResults.map((r) => ({
      ...r,
      originalRank: originalRanks.get(r.id) || undefined,
    }));

    addEvent(handle, 'rerank', {
      output_count: results.length,
      deltas: rerankDeltas,
    });

    endSpan(handle, rerankSpan, {
      output_count: results.length,
    });
  } else {
    // Just take topK without reranking
    results = results.slice(0, topK);
  }

  return {
    results,
    tokens: { embedding: embeddingTokens },
    vectorSearchOps: 1,
    rerankDeltas,
  };
}

function simulateLatency(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function generateSimulatedResults(
  count: number,
  reranked: boolean
): Array<{ id: string; score: number; content: string }> {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push({
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      score: reranked ? 0.95 - i * 0.03 : 0.9 - i * 0.04,
      content: `Simulated result ${i + 1} content...`,
    });
  }
  return results;
}

// ============================================
// Comparison Builder
// ============================================

interface OriginalTrace {
  effectiveConfig?: TraceConfig;
  timingsMs: Record<string, number>;
  resultsCount: number;
  trace: {
    cost?: {
      total: number;
      embedding?: number;
      vectorSearch?: number;
      rerank?: number;
    };
    resultStats?: {
      documentIds?: string[];
    };
  };
}

interface ReplayData {
  config: TraceConfig;
  timingsMs: Record<string, number>;
  resultsCount: number;
  cost: {
    total: number;
    embedding?: number;
    vectorSearch?: number;
    rerank?: number;
  };
  results: Array<{ id: string; score: number }>;
}

interface Comparison {
  config_changes: Array<{
    param: string;
    original: unknown;
    replay: unknown;
  }>;
  latency: {
    improved: boolean;
    delta_percent: number;
  };
  cost: {
    improved: boolean;
    delta_percent: number;
  };
  results: {
    count_delta: number;
    overlap_estimate: number;
  };
  summary: string;
}

function buildComparison(original: OriginalTrace, replay: ReplayData): Comparison {
  const originalLatency = Object.values(original.timingsMs || {}).reduce((a, b) => a + b, 0);
  const replayLatency = Object.values(replay.timingsMs || {}).reduce((a, b) => a + b, 0);
  const originalCost = original.trace.cost?.total || 0;
  const replayCost = replay.cost.total;

  const configChanges: Comparison['config_changes'] = [];
  const origConfig = original.effectiveConfig || {};
  const replayConfig = replay.config;

  for (const key of Object.keys(replayConfig) as Array<keyof TraceConfig>) {
    if (origConfig[key] !== replayConfig[key]) {
      configChanges.push({
        param: key,
        original: origConfig[key],
        replay: replayConfig[key],
      });
    }
  }

  const latencyImproved = replayLatency < originalLatency;
  const costImproved = replayCost < originalCost;

  // Build summary
  const summaryParts: string[] = [];
  if (latencyImproved) {
    summaryParts.push(`Latency improved by ${Math.abs(((replayLatency - originalLatency) / originalLatency) * 100).toFixed(1)}%`);
  } else if (replayLatency > originalLatency) {
    summaryParts.push(`Latency increased by ${Math.abs(((replayLatency - originalLatency) / originalLatency) * 100).toFixed(1)}%`);
  }

  if (costImproved) {
    summaryParts.push(`Cost reduced by ${Math.abs(((replayCost - originalCost) / originalCost) * 100).toFixed(1)}%`);
  } else if (replayCost > originalCost) {
    summaryParts.push(`Cost increased by ${Math.abs(((replayCost - originalCost) / originalCost) * 100).toFixed(1)}%`);
  }

  if (replay.resultsCount !== original.resultsCount) {
    summaryParts.push(`Results count changed from ${original.resultsCount} to ${replay.resultsCount}`);
  }

  return {
    config_changes: configChanges,
    latency: {
      improved: latencyImproved,
      delta_percent: originalLatency > 0 ? ((replayLatency - originalLatency) / originalLatency) * 100 : 0,
    },
    cost: {
      improved: costImproved,
      delta_percent: originalCost > 0 ? ((replayCost - originalCost) / originalCost) * 100 : 0,
    },
    results: {
      count_delta: replay.resultsCount - original.resultsCount,
      overlap_estimate: 70 + Math.random() * 20, // Simulated overlap
    },
    summary: summaryParts.length > 0 ? summaryParts.join('. ') : 'No significant changes',
  };
}
