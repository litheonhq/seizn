import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';

/**
 * GET /api/retrieval/traces/[id] - DevTools single trace detail
 *
 * Returns full trace details with enhanced visualization data for DevTools.
 * Includes:
 * - Full pipeline timeline with spans
 * - Candidate scoring before/after rerank
 * - Cost breakdown by stage
 * - Config diff from defaults
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

    // Build timeline from spans
    const timeline = buildTimeline(trace.trace.spans, trace.trace.events);

    // Extract candidate data from events
    const candidates = extractCandidates(trace.trace.events);

    // Calculate stage breakdown
    const stageBreakdown = buildStageBreakdown(trace.trace.spans, trace.trace.cost);

    // Build config comparison with defaults
    const configAnalysis = analyzeConfig(trace.effectiveConfig as Record<string, unknown>);

    return NextResponse.json({
      success: true,
      trace: {
        // Identity
        id: trace.id,
        request_id: trace.requestId,
        user_id: trace.userId,
        api_key_id: trace.apiKeyId,
        plan: trace.plan,

        // Query
        query: {
          text: trace.queryText,
          hash: trace.queryHash,
        },

        // Collections
        collection: {
          primary: trace.collectionId,
          all: trace.collectionIds || [trace.collectionId].filter(Boolean),
        },

        // Configuration
        config: {
          effective: trace.effectiveConfig,
          analysis: configAnalysis,
        },

        // Autopilot
        autopilot: {
          enabled: !!trace.autopilotReason,
          reason: trace.autopilotReason,
        },

        // Timeline visualization
        timeline,

        // Candidate analysis
        candidates,

        // Results
        results: {
          count: trace.resultsCount,
          stats: trace.trace.resultStats,
        },

        // Cost breakdown
        cost: {
          total: trace.trace.cost?.total || 0,
          breakdown: trace.trace.cost,
          stage_breakdown: stageBreakdown,
        },

        // Latency
        latency: {
          total_ms: trace.trace.totalDurationMs || Object.values(trace.timingsMs || {}).reduce((a, b) => a + b, 0),
          by_stage: trace.timingsMs,
        },

        // Status
        status: {
          error: trace.error,
          has_error: !!trace.error,
          sampled: trace.sampled,
        },

        // Experiment
        experiment: trace.experimentId
          ? {
              id: trace.experimentId,
              arm_id: trace.armId,
            }
          : null,

        // Replay chain
        replay: {
          is_replay: !!trace.replayOf,
          original_trace_id: trace.replayOf,
        },

        // Timestamps
        timestamps: {
          started_at: trace.trace.startedAt,
          ended_at: trace.trace.endedAt,
          created_at: trace.createdAt,
        },

        // Raw data for advanced debugging
        raw: {
          spans: trace.trace.spans,
          events: trace.trace.events,
        },
      },
    });
  } catch (error) {
    console.error('DevTools trace get error:', error);
    return ServerErrors.internal('devtools_trace_get');
  }
}

// ============================================
// Helper Functions
// ============================================

interface TimelineStage {
  name: string;
  label: string;
  start_offset_ms: number;
  duration_ms: number;
  status: 'success' | 'error' | 'running';
  metadata?: Record<string, unknown>;
}

function buildTimeline(
  spans: Array<{
    name: string;
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    status: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }>,
  _events: Array<{
    type: string;
    ts: string;
    payload: Record<string, unknown>;
  }>
): TimelineStage[] {
  if (!spans || spans.length === 0) {
    return [];
  }

  const baseTime = new Date(spans[0].startedAt).getTime();

  const stageLabels: Record<string, string> = {
    embedding: 'Query Embedding',
    vector_search: 'Vector Search',
    keyword_search: 'Keyword Search',
    rerank: 'Reranking',
    llm_generation: 'LLM Generation',
    postprocess: 'Post-processing',
    cache_lookup: 'Cache Lookup',
  };

  return spans.map((span) => ({
    name: span.name,
    label: stageLabels[span.name] || span.name,
    start_offset_ms: new Date(span.startedAt).getTime() - baseTime,
    duration_ms: span.durationMs || 0,
    status: span.status as 'success' | 'error' | 'running',
    metadata: {
      input: span.input,
      output: span.output,
    },
  }));
}

interface CandidateData {
  before_rerank: Array<{
    id: string;
    score: number;
    rank: number;
  }>;
  after_rerank: Array<{
    id: string;
    score: number;
    rank: number;
    original_rank?: number;
    rank_delta?: number;
    score_delta?: number;
  }>;
  rerank_applied: boolean;
}

function extractCandidates(
  events: Array<{
    type: string;
    ts: string;
    payload: Record<string, unknown>;
  }>
): CandidateData {
  const result: CandidateData = {
    before_rerank: [],
    after_rerank: [],
    rerank_applied: false,
  };

  for (const event of events) {
    if (event.type === 'candidates') {
      const scores = event.payload.scores as number[] | undefined;
      const ids = event.payload.ids as string[] | undefined;

      if (scores) {
        result.before_rerank = scores.map((score, i) => ({
          id: ids?.[i] || `doc-${i}`,
          score,
          rank: i + 1,
        }));
      }
    }

    if (event.type === 'rerank') {
      result.rerank_applied = true;
      const scores = event.payload.scores as number[] | undefined;
      const ids = event.payload.ids as string[] | undefined;
      const deltas = event.payload.deltas as Array<{
        id: string;
        originalScore: number;
        rerankScore: number;
        delta: number;
      }> | undefined;

      if (deltas) {
        result.after_rerank = deltas.map((d, i) => ({
          id: d.id,
          score: d.rerankScore,
          rank: i + 1,
          original_rank: result.before_rerank.findIndex((c) => c.id === d.id) + 1 || undefined,
          rank_delta: undefined, // Will be calculated
          score_delta: d.delta,
        }));

        // Calculate rank deltas
        result.after_rerank = result.after_rerank.map((item) => ({
          ...item,
          rank_delta: item.original_rank ? item.original_rank - item.rank : undefined,
        }));
      } else if (scores) {
        result.after_rerank = scores.map((score, i) => ({
          id: ids?.[i] || `doc-${i}`,
          score,
          rank: i + 1,
        }));
      }
    }
  }

  return result;
}

interface StageBreakdown {
  name: string;
  label: string;
  cost_usd: number;
  latency_ms: number;
  percentage_cost: number;
  percentage_latency: number;
}

function buildStageBreakdown(
  spans: Array<{
    name: string;
    durationMs?: number;
  }>,
  cost?: {
    embedding?: number;
    vectorSearch?: number;
    rerank?: number;
    llm?: number;
    total: number;
  }
): StageBreakdown[] {
  const stages: StageBreakdown[] = [];
  const totalCost = cost?.total || 0;
  const totalLatency = spans.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  const costMapping: Record<string, number> = {
    embedding: cost?.embedding || 0,
    vector_search: cost?.vectorSearch || 0,
    keyword_search: 0,
    rerank: cost?.rerank || 0,
    llm_generation: cost?.llm || 0,
  };

  const labels: Record<string, string> = {
    embedding: 'Embedding',
    vector_search: 'Vector Search',
    keyword_search: 'Keyword Search',
    rerank: 'Reranking',
    llm_generation: 'LLM Generation',
    postprocess: 'Post-processing',
    cache_lookup: 'Cache',
  };

  for (const span of spans) {
    const stageCost = costMapping[span.name] || 0;
    stages.push({
      name: span.name,
      label: labels[span.name] || span.name,
      cost_usd: stageCost,
      latency_ms: span.durationMs || 0,
      percentage_cost: totalCost > 0 ? (stageCost / totalCost) * 100 : 0,
      percentage_latency: totalLatency > 0 ? ((span.durationMs || 0) / totalLatency) * 100 : 0,
    });
  }

  return stages;
}

interface ConfigAnalysis {
  deviations_from_default: Array<{
    key: string;
    value: unknown;
    default_value: unknown;
  }>;
  optimization_hints: string[];
}

function analyzeConfig(config: Record<string, unknown> | null | undefined): ConfigAnalysis {
  if (!config) {
    return { deviations_from_default: [], optimization_hints: [] };
  }

  const defaults: Record<string, unknown> = {
    searchType: 'hybrid',
    hybridAlpha: 0.6,
    topK: 10,
    rerankEnabled: false,
    rerankTopN: 5,
    embeddingModel: 'voyage-3',
    embeddingDimensions: 1024,
  };

  const deviations: Array<{ key: string; value: unknown; default_value: unknown }> = [];
  const hints: string[] = [];

  for (const [key, defaultValue] of Object.entries(defaults)) {
    const actualValue = config[key];
    if (actualValue !== undefined && actualValue !== defaultValue) {
      deviations.push({
        key,
        value: actualValue,
        default_value: defaultValue,
      });
    }
  }

  // Generate optimization hints
  if (!config.rerankEnabled && (config.topK as number) > 5) {
    hints.push('Consider enabling reranking for better precision with large topK');
  }

  if (config.searchType === 'semantic' && !config.rerankEnabled) {
    hints.push('Hybrid search may improve recall for semantic queries');
  }

  if ((config.hybridAlpha as number) < 0.4) {
    hints.push('Low hybrid alpha favors keyword search - consider increasing for semantic relevance');
  }

  return {
    deviations_from_default: deviations,
    optimization_hints: hints,
  };
}
