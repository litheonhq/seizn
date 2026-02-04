/**
 * Hybrid Retrieval API
 *
 * POST /api/v1/retrieval/hybrid - Perform hybrid search
 *
 * Combines dense vector search with BM25 sparse search,
 * optionally with late-interaction reranking
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createHybridRetriever,
  type RetrievalConfig,
} from '@/lib/retrieval/late-interaction';

interface HybridSearchRequest {
  query: string;
  collection_id: string;
  top_k?: number;
  dense_weight?: number;
  sparse_weight?: number;
  late_interaction?: boolean;
  query_expansion?: boolean;
  min_score?: number;
  rrf_k?: number;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const body = (await request.json()) as HybridSearchRequest;

    if (!body.query || !body.collection_id) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'query and collection_id are required' },
        { status: 400 }
      );
    }

    const config: RetrievalConfig = {
      topK: body.top_k || 10,
      denseBias: body.dense_weight ?? 0.5,
      sparseBias: body.sparse_weight ?? 0.5,
      lateInteraction: body.late_interaction ?? false,
      queryExpansion: body.query_expansion ?? false,
      minScore: body.min_score,
      rrfK: body.rrf_k ?? 60,
    };

    // Validate weights
    if (config.denseBias! + config.sparseBias! !== 1) {
      // Normalize weights
      const total = config.denseBias! + config.sparseBias!;
      if (total > 0) {
        config.denseBias = config.denseBias! / total;
        config.sparseBias = config.sparseBias! / total;
      }
    }

    const retriever = createHybridRetriever();

    // Build BM25 index for the collection
    await retriever.buildIndex(body.collection_id);

    // Perform hybrid retrieval
    const result = await retriever.retrieve(body.query, body.collection_id, config);

    return NextResponse.json({
      query: result.query,
      expanded_queries: result.expandedQueries,
      documents: result.documents.map((doc) => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score: doc.score,
        dense_score: doc.denseScore,
        sparse_score: doc.sparseScore,
        late_interaction_score: doc.lateInteractionScore,
        rank: doc.rank,
      })),
      config: {
        top_k: config.topK,
        dense_weight: config.denseBias,
        sparse_weight: config.sparseBias,
        late_interaction: config.lateInteraction,
        query_expansion: config.queryExpansion,
        rrf_k: config.rrfK,
      },
      timing: result.timing,
    });
  } catch (error) {
    console.error('[HybridRetrieval] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/retrieval/hybrid - Get retrieval config info
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    return NextResponse.json({
      description: 'Hybrid retrieval combining dense and sparse search with optional late-interaction reranking',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query' },
        collection_id: { type: 'string', required: true, description: 'Collection to search' },
        top_k: { type: 'integer', default: 10, description: 'Number of results to return' },
        dense_weight: { type: 'number', default: 0.5, description: 'Weight for dense vector search (0-1)' },
        sparse_weight: { type: 'number', default: 0.5, description: 'Weight for BM25 sparse search (0-1)' },
        late_interaction: { type: 'boolean', default: false, description: 'Enable ColBERT-style reranking' },
        query_expansion: { type: 'boolean', default: false, description: 'Enable query expansion' },
        min_score: { type: 'number', description: 'Minimum score threshold' },
        rrf_k: { type: 'integer', default: 60, description: 'Reciprocal Rank Fusion constant' },
      },
      features: [
        'Dense vector search via pgvector',
        'BM25 sparse search',
        'Reciprocal Rank Fusion for combining rankings',
        'ColBERT-style late-interaction reranking (optional)',
        'Query expansion with synonyms (optional)',
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
