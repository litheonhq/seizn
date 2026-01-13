import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, ServerErrors } from '@/lib/api-error';

/**
 * POST /api/traces/compare - Compare two traces
 *
 * Compares two traces and returns a detailed diff including:
 * - Top-K overlap and ranking changes
 * - Latency differences
 * - Cost differences
 * - Config differences
 * - Answer contract pass/fail differences
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { trace_id_a, trace_id_b } = body;

    if (!trace_id_a || !trace_id_b) {
      return ValidationErrors.missingField('trace_id_a and trace_id_b are required');
    }

    const supabase = createServerClient();

    // Fetch both traces
    const [traceAResult, traceBResult] = await Promise.all([
      supabase
        .from('traces')
        .select('*')
        .eq('id', trace_id_a)
        .eq('user_id', authResult.userId)
        .single(),
      supabase
        .from('traces')
        .select('*')
        .eq('id', trace_id_b)
        .eq('user_id', authResult.userId)
        .single(),
    ]);

    if (traceAResult.error || !traceAResult.data) {
      return ValidationErrors.invalidFormat('trace_id_a', 'Trace A not found');
    }

    if (traceBResult.error || !traceBResult.data) {
      return ValidationErrors.invalidFormat('trace_id_b', 'Trace B not found');
    }

    const traceA = traceAResult.data;
    const traceB = traceBResult.data;

    // Calculate diff
    const diff = calculateTraceDiff(traceA, traceB);

    return NextResponse.json({
      success: true,
      diff,
      trace_a: {
        id: traceA.id,
        query: traceA.query,
        created_at: traceA.created_at,
      },
      trace_b: {
        id: traceB.id,
        query: traceB.query,
        created_at: traceB.created_at,
      },
    });
  } catch (error) {
    console.error('Trace compare error:', error);
    return ServerErrors.internal('trace_compare');
  }
}

interface TraceData {
  id: string;
  query: string;
  results: Array<{ id: string; score: number; content: string }>;
  config: {
    search_type?: string;
    hybrid_alpha?: number;
    rerank?: boolean;
    rerank_model?: string;
    top_k?: number;
  };
  latency: {
    embedding_ms: number;
    search_ms: number;
    rerank_ms?: number;
    total_ms: number;
  };
  cost_usd: number;
  answer_contract?: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean }>;
  };
  created_at: string;
}

function calculateTraceDiff(traceA: TraceData, traceB: TraceData) {
  // Calculate result overlap
  const resultsA = traceA.results || [];
  const resultsB = traceB.results || [];
  const idsA = new Set(resultsA.map((r) => r.id));
  const idsB = new Set(resultsB.map((r) => r.id));

  const overlap = [...idsA].filter((id) => idsB.has(id));
  const onlyInA = [...idsA].filter((id) => !idsB.has(id));
  const onlyInB = [...idsB].filter((id) => !idsA.has(id));

  // Calculate ranking changes
  const rankingChanges = overlap.map((id) => {
    const rankA = resultsA.findIndex((r) => r.id === id) + 1;
    const rankB = resultsB.findIndex((r) => r.id === id) + 1;
    return {
      id,
      rank_a: rankA,
      rank_b: rankB,
      delta: rankA - rankB, // Negative = improved in B
    };
  });

  // Latency diff
  const latencyA = traceA.latency || { embedding_ms: 0, search_ms: 0, total_ms: 0 };
  const latencyB = traceB.latency || { embedding_ms: 0, search_ms: 0, total_ms: 0 };

  const latencyDiff = {
    embedding_ms: {
      a: latencyA.embedding_ms,
      b: latencyB.embedding_ms,
      delta: latencyB.embedding_ms - latencyA.embedding_ms,
      delta_percent: latencyA.embedding_ms
        ? ((latencyB.embedding_ms - latencyA.embedding_ms) / latencyA.embedding_ms) * 100
        : 0,
    },
    search_ms: {
      a: latencyA.search_ms,
      b: latencyB.search_ms,
      delta: latencyB.search_ms - latencyA.search_ms,
      delta_percent: latencyA.search_ms
        ? ((latencyB.search_ms - latencyA.search_ms) / latencyA.search_ms) * 100
        : 0,
    },
    rerank_ms: {
      a: latencyA.rerank_ms || 0,
      b: latencyB.rerank_ms || 0,
      delta: (latencyB.rerank_ms || 0) - (latencyA.rerank_ms || 0),
    },
    total_ms: {
      a: latencyA.total_ms,
      b: latencyB.total_ms,
      delta: latencyB.total_ms - latencyA.total_ms,
      delta_percent: latencyA.total_ms
        ? ((latencyB.total_ms - latencyA.total_ms) / latencyA.total_ms) * 100
        : 0,
    },
  };

  // Cost diff
  const costDiff = {
    a: traceA.cost_usd || 0,
    b: traceB.cost_usd || 0,
    delta: (traceB.cost_usd || 0) - (traceA.cost_usd || 0),
    delta_percent: traceA.cost_usd
      ? ((traceB.cost_usd - traceA.cost_usd) / traceA.cost_usd) * 100
      : 0,
  };

  // Config diff
  const configA = traceA.config || {};
  const configB = traceB.config || {};
  const configDiff = {
    search_type: { a: configA.search_type, b: configB.search_type, changed: configA.search_type !== configB.search_type },
    hybrid_alpha: { a: configA.hybrid_alpha, b: configB.hybrid_alpha, changed: configA.hybrid_alpha !== configB.hybrid_alpha },
    rerank: { a: configA.rerank, b: configB.rerank, changed: configA.rerank !== configB.rerank },
    rerank_model: { a: configA.rerank_model, b: configB.rerank_model, changed: configA.rerank_model !== configB.rerank_model },
    top_k: { a: configA.top_k, b: configB.top_k, changed: configA.top_k !== configB.top_k },
  };

  // Answer contract diff
  const contractA = traceA.answer_contract;
  const contractB = traceB.answer_contract;
  const contractDiff = contractA && contractB ? {
    passed: { a: contractA.passed, b: contractB.passed, changed: contractA.passed !== contractB.passed },
    checks: contractA.checks?.map((checkA, i) => {
      const checkB = contractB.checks?.[i];
      return {
        name: checkA.name,
        a: checkA.passed,
        b: checkB?.passed,
        changed: checkA.passed !== checkB?.passed,
      };
    }),
  } : null;

  return {
    results: {
      overlap_count: overlap.length,
      overlap_percent: Math.max(resultsA.length, resultsB.length)
        ? (overlap.length / Math.max(resultsA.length, resultsB.length)) * 100
        : 0,
      only_in_a: onlyInA,
      only_in_b: onlyInB,
      ranking_changes: rankingChanges,
    },
    latency: latencyDiff,
    cost: costDiff,
    config: configDiff,
    answer_contract: contractDiff,
    summary: {
      results_improved: rankingChanges.filter((r) => r.delta > 0).length,
      results_degraded: rankingChanges.filter((r) => r.delta < 0).length,
      latency_improved: latencyDiff.total_ms.delta < 0,
      cost_improved: costDiff.delta < 0,
    },
  };
}
