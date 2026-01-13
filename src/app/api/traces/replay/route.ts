import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';

/**
 * POST /api/traces/replay - Replay a trace with the same or modified config
 *
 * Re-executes a previous query and creates a new trace.
 * Useful for:
 * - A/B testing different configs
 * - Debugging issues
 * - Comparing performance over time
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

    const supabase = createServerClient();

    // Fetch original trace
    const { data: originalTrace, error } = await supabase
      .from('traces')
      .select('*')
      .eq('id', trace_id)
      .eq('user_id', authResult.userId)
      .single();

    if (error || !originalTrace) {
      return NotFoundErrors.resource('trace');
    }

    // Merge original config with overrides
    const originalConfig = originalTrace.config || {};
    const replayConfig = {
      ...originalConfig,
      ...config_overrides,
    };

    // Execute the query with the (potentially modified) config
    // This would call the actual retrieval pipeline
    const startTime = Date.now();

    // For now, we'll simulate the replay by calling the internal retrieve function
    // In production, this would call the actual pipeline
    const replayResult = await executeReplay({
      query: originalTrace.query,
      collection: originalTrace.collection,
      config: replayConfig,
      userId: authResult.userId,
      orgId: authResult.orgId,
    });

    const endTime = Date.now();

    // Create new trace record
    const newTraceId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('traces').insert({
      id: newTraceId,
      user_id: authResult.userId,
      org_id: authResult.orgId,
      query: originalTrace.query,
      collection: originalTrace.collection,
      config: replayConfig,
      results: replayResult.results,
      latency: replayResult.latency,
      cost_usd: replayResult.cost_usd,
      replay_of: trace_id,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('Failed to save replay trace:', insertError);
    }

    return NextResponse.json({
      success: true,
      replay: {
        trace_id: newTraceId,
        original_trace_id: trace_id,
        query: originalTrace.query,
        config: replayConfig,
        config_changes: Object.keys(config_overrides || {}),
        results: replayResult.results,
        latency: replayResult.latency,
        cost_usd: replayResult.cost_usd,
        execution_time_ms: endTime - startTime,
      },
      compare_url: `/api/traces/compare?a=${trace_id}&b=${newTraceId}`,
    });
  } catch (error) {
    console.error('Trace replay error:', error);
    return ServerErrors.internal('trace_replay');
  }
}

interface ReplayConfig {
  query: string;
  collection: string;
  config: {
    search_type?: string;
    hybrid_alpha?: number;
    rerank?: boolean;
    rerank_model?: string;
    top_k?: number;
  };
  userId: string;
  orgId?: string;
}

interface ReplayResult {
  results: Array<{ id: string; score: number; content: string }>;
  latency: {
    embedding_ms: number;
    search_ms: number;
    rerank_ms?: number;
    total_ms: number;
  };
  cost_usd: number;
}

async function executeReplay(params: ReplayConfig): Promise<ReplayResult> {
  // This is a simplified implementation
  // In production, this would call the actual Summer retrieval pipeline

  const { query, collection, config } = params;

  // Simulate pipeline execution
  const embeddingStart = Date.now();
  await simulateLatency(30, 80); // Embedding typically 30-80ms
  const embeddingMs = Date.now() - embeddingStart;

  const searchStart = Date.now();
  await simulateLatency(10, 50); // Vector search typically 10-50ms
  const searchMs = Date.now() - searchStart;

  let rerankMs = 0;
  if (config.rerank) {
    const rerankStart = Date.now();
    await simulateLatency(50, 150); // Reranking typically 50-150ms
    rerankMs = Date.now() - rerankStart;
  }

  const totalMs = embeddingMs + searchMs + rerankMs;

  // Calculate estimated cost
  const embeddingCost = 0.00001; // $0.01 per 1000 tokens
  const searchCost = 0.000005; // $0.005 per 1000 operations
  const rerankCost = config.rerank ? 0.00005 : 0; // $0.05 per 1000 reranks
  const costUsd = embeddingCost + searchCost + rerankCost;

  // Generate simulated results (in production, these would be real results)
  const results = generateSimulatedResults(config.top_k || 5, config.rerank || false);

  return {
    results,
    latency: {
      embedding_ms: embeddingMs,
      search_ms: searchMs,
      rerank_ms: rerankMs || undefined,
      total_ms: totalMs,
    },
    cost_usd: costUsd,
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
      id: `doc-${i + 1}`,
      score: reranked ? 0.95 - i * 0.05 : 0.9 - i * 0.1,
      content: `Simulated result ${i + 1} content...`,
    });
  }
  return results;
}
