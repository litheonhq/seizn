import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding } from '@/lib/ai';
import { logServerError } from '@/lib/server/logger';
import {
  runDegradedKeywordSearch,
  shouldUseDegradedKeywordSearchFallback,
} from '@/lib/memory/degraded-keyword-search';

interface ReplayRequest {
  originalLogId: string;
  // Override settings for comparison
  overrides?: {
    topK?: number;
    threshold?: number;
    mode?: 'vector' | 'hybrid' | 'keyword';
    rerank?: boolean;
  };
}

interface OriginalLog {
  id: string;
  endpoint: string;
  method: string;
  request_body: {
    query?: string;
    namespace?: string;
    topK?: number;
    threshold?: number;
    mode?: string;
  } | null;
  response_body: {
    results?: Array<{
      id: string;
      content: string;
      similarity: number;
    }>;
  } | null;
  latency_ms: number;
  cost_cents: number;
  created_at: string;
}

/**
 * POST /api/playground/replay
 * Replay a previous query with optional parameter changes for comparison
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const requestUser = await getRequestUser(request);
    if (!requestUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ReplayRequest = await request.json();
    const { originalLogId, overrides = {} } = body;

    if (!originalLogId) {
      return NextResponse.json({ error: 'Original log ID required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const userId = requestUser.id;

    // Fetch original log
    const { data: originalLog, error: logError } = await supabase
      .from('usage_logs')
      .select('id, endpoint, method, request_body, response_body, latency_ms, cost_cents, created_at')
      .eq('id', originalLogId)
      .eq('user_id', userId)
      .single();

    if (logError || !originalLog) {
      return NextResponse.json({ error: 'Original log not found' }, { status: 404 });
    }

    const typedLog = originalLog as OriginalLog;

    // Extract original parameters
    const requestBody = typedLog.request_body;
    if (!requestBody?.query) {
      return NextResponse.json({ error: 'Original query not found in log' }, { status: 400 });
    }

    const query = requestBody.query;
    const namespace = requestBody.namespace || 'default';
    const topK = overrides.topK ?? requestBody.topK ?? 5;
    const threshold = overrides.threshold ?? requestBody.threshold ?? 0.7;
    const mode = overrides.mode ?? (requestBody.mode as 'vector' | 'hybrid' | 'keyword') ?? 'vector';
    const rerank = overrides.rerank ?? false;
    let resolvedMode = mode;
    let fallback: {
      applied: boolean;
      from: typeof mode;
      to: 'keyword';
      reason: 'search_error';
    } | null = null;

    // Execute new search
    let newResults: SearchResult[] = [];
    let searchError: Error | null = null;

    if (mode === 'keyword') {
      const { data, error } = await supabase.rpc('keyword_search_memories', {
        query_text: query,
        match_user_id: userId,
        match_count: topK,
        match_namespace: namespace,
      });
      newResults = data || [];
      searchError = error;
    } else if (mode === 'hybrid') {
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('hybrid_search_memories', {
        query_text: query,
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: topK,
        match_threshold: threshold,
        match_namespace: namespace,
        keyword_weight: 0.3,
        vector_weight: 0.7,
      });
      newResults = data || [];
      searchError = error;
    } else {
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('search_memories', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: topK,
        match_threshold: threshold,
        match_namespace: namespace,
      });
      newResults = data || [];
      searchError = error;
    }

    if (searchError && shouldUseDegradedKeywordSearchFallback(searchError)) {
      const degraded = await runDegradedKeywordSearch({
        supabase,
        userId,
        queryText: query.trim(),
        namespaceParam: namespace,
        limit: topK,
      });

      if (!degraded.error) {
        newResults = degraded.results;
        resolvedMode = 'keyword';
        fallback = {
          applied: true,
          from: mode,
          to: 'keyword',
          reason: 'search_error',
        };
        searchError = null;
      } else {
        logServerError('Replay degraded keyword fallback failed', degraded.error, {
          userId,
          originalLogId,
          requestedMode: mode,
          namespace,
        });
      }
    }

    if (searchError) {
      logServerError('Replay search error', searchError, {
        userId,
        originalLogId,
        requestedMode: mode,
        namespace,
      });
      return NextResponse.json({ error: 'Replay search failed' }, { status: 500 });
    }

    const newLatency = Date.now() - startTime;

    // Calculate cost
    const embeddingCost = mode !== 'keyword' ? 0.00002 : 0;
    const searchCost = 0.00001 * topK;
    const rerankCost = rerank ? 0.00005 * newResults.length : 0;
    const newCostCents = (embeddingCost + searchCost + rerankCost) * 100;

    // Compare results
    const originalResults = typedLog.response_body?.results || [];
    const originalIds = new Set(originalResults.map(r => r.id));
    const newIds = new Set(newResults.map(r => r.id));

    // Calculate overlap metrics
    const intersection = [...originalIds].filter(id => newIds.has(id)).length;
    const hitAtK = {
      hit1: originalResults[0]?.id === newResults[0]?.id,
      hit3: intersection >= Math.min(3, originalResults.length, newResults.length),
      hit5: intersection >= Math.min(5, originalResults.length, newResults.length),
    };

    // Identify changes
    const added = newResults.filter(r => !originalIds.has(r.id)).map(r => ({
      id: r.id,
      content: r.content,
      similarity: r.similarity,
    }));

    const removed = originalResults.filter(r => !newIds.has(r.id)).map(r => ({
      id: r.id,
      content: r.content,
      similarity: r.similarity,
    }));

    // Calculate rank changes for common items
    const rankChanges: Array<{ id: string; content: string; oldRank: number; newRank: number; change: number }> = [];
    originalResults.forEach((orig, oldRank) => {
      const newRank = newResults.findIndex(n => n.id === orig.id);
      if (newRank !== -1 && newRank !== oldRank) {
        rankChanges.push({
          id: orig.id,
          content: orig.content,
          oldRank: oldRank + 1,
          newRank: newRank + 1,
          change: oldRank - newRank, // positive = improved, negative = dropped
        });
      }
    });

    return NextResponse.json({
      success: true,
      original: {
        logId: typedLog.id,
        timestamp: typedLog.created_at,
        latencyMs: typedLog.latency_ms,
        costCents: typedLog.cost_cents,
        resultCount: originalResults.length,
        settings: {
          query,
          namespace,
          topK: requestBody.topK ?? 5,
          threshold: requestBody.threshold ?? 0.7,
          mode: requestBody.mode ?? 'vector',
        },
      },
      replay: {
        latencyMs: newLatency,
        costCents: newCostCents,
        resultCount: newResults.length,
        settings: {
          query,
          namespace,
          topK,
          threshold,
          mode: resolvedMode,
          requestedMode: mode,
          rerank,
        },
        results: newResults.map(r => ({
          id: r.id,
          content: r.content,
          similarity: r.similarity,
        })),
        fallback,
      },
      diff: {
        latencyChange: newLatency - typedLog.latency_ms,
        costChange: newCostCents - typedLog.cost_cents,
        resultCountChange: newResults.length - originalResults.length,
        overlap: intersection,
        overlapPercent: originalResults.length > 0
          ? Math.round((intersection / originalResults.length) * 100)
          : 0,
        hitAtK,
        added,
        removed,
        rankChanges,
      },
    });
  } catch (error) {
    logServerError('Replay error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface SearchResult {
  id: string;
  content: string;
  memory_type?: string;
  similarity: number;
}
