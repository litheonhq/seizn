import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding } from '@/lib/ai';

interface PlaygroundQueryRequest {
  query: string;
  namespace?: string;
  topK?: number;
  threshold?: number;
  mode?: 'vector' | 'hybrid' | 'keyword';
  rerank?: boolean;
}

/**
 * POST /api/playground/query
 * Execute a debug query with full tracing
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: PlaygroundQueryRequest = await request.json();
    const {
      query,
      namespace = 'default',
      topK = 5,
      threshold = 0.7,
      mode = 'vector',
      rerank = false,
    } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (query.length > 1000) {
      return NextResponse.json({ error: 'Query too long (max 1000 chars)' }, { status: 400 });
    }

    const supabase = createServerClient();
    const userId = session.user.id;

    // Execute search based on mode
    let results: SearchResult[] = [];
    let searchError: Error | null = null;

    if (mode === 'keyword') {
      const { data, error } = await supabase.rpc('keyword_search_memories', {
        query_text: query.trim(),
        match_user_id: userId,
        match_count: topK,
        match_namespace: namespace,
      });
      results = data || [];
      searchError = error;
    } else if (mode === 'hybrid') {
      const queryEmbedding = await createQueryEmbedding(query.trim());
      const { data, error } = await supabase.rpc('hybrid_search_memories', {
        query_text: query.trim(),
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: topK,
        match_threshold: threshold,
        match_namespace: namespace,
        keyword_weight: 0.3,
        vector_weight: 0.7,
      });
      results = data || [];
      searchError = error;
    } else {
      // Default: vector search
      const queryEmbedding = await createQueryEmbedding(query.trim());
      const { data, error } = await supabase.rpc('search_memories', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: topK,
        match_threshold: threshold,
        match_namespace: namespace,
      });
      results = data || [];
      searchError = error;
    }

    if (searchError) {
      console.error('Playground search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    // Apply reranking if enabled (simulated - in production, use actual cross-encoder)
    if (rerank && results.length > 0) {
      results = results.map(r => ({
        ...r,
        rerank_score: simulateRerankScore(query, r.content, r.similarity),
      }));
      // Re-sort by rerank score
      results.sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));
    }

    const latencyMs = Date.now() - startTime;

    // Calculate estimated cost
    const embeddingCost = mode !== 'keyword' ? 0.00002 : 0;
    const searchCost = 0.00001 * topK;
    const rerankCost = rerank ? 0.00005 * results.length : 0;
    const totalCost = embeddingCost + searchCost + rerankCost;

    return NextResponse.json({
      success: true,
      results: results.map(r => ({
        id: r.id,
        content: r.content,
        memory_type: r.memory_type,
        similarity: r.similarity,
        rerank_score: r.rerank_score,
      })),
      count: results.length,
      trace: {
        latency_ms: latencyMs,
        mode,
        namespace,
        topK,
        threshold,
        rerank_enabled: rerank,
        embedding_model: mode !== 'keyword' ? 'text-embedding-3-small' : null,
        estimated_cost: `$${totalCost.toFixed(5)}`,
      },
    });
  } catch (error) {
    console.error('Playground query error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface SearchResult {
  id: string;
  content: string;
  memory_type?: string;
  similarity: number;
  rerank_score?: number;
}

/**
 * Simulate rerank score - in production, this would call a cross-encoder model
 */
function simulateRerankScore(query: string, content: string, vectorScore: number): number {
  // Simple simulation: boost exact matches, penalize very short content
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();

  let boost = 0;

  // Exact phrase match bonus
  if (contentLower.includes(queryLower)) {
    boost += 0.15;
  }

  // Word overlap bonus
  const queryWords = queryLower.split(/\s+/);
  const contentWords = new Set(contentLower.split(/\s+/));
  const overlap = queryWords.filter(w => contentWords.has(w)).length / queryWords.length;
  boost += overlap * 0.1;

  // Length penalty for very short content
  if (content.length < 50) {
    boost -= 0.1;
  }

  // Add some randomness to simulate model variance
  const noise = (Math.random() - 0.5) * 0.05;

  return Math.min(1, Math.max(0, vectorScore + boost + noise));
}
