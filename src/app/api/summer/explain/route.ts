import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  createApiError,
  ErrorCodes,
  ValidationErrors,
  ServerErrors,
} from '@/lib/api-error';
import { explainRetrieval } from '@/lib/summer/explain';
import type { ExplainRequest, ExplainResponse, StoredExplanation } from '@/lib/summer/explain/types';

// In-memory storage for explanations (would be Redis/DB in production)
const explanationStore = new Map<string, StoredExplanation>();

// TTL for stored explanations (24 hours)
const EXPLANATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/summer/explain
 *
 * Generate explanations for search results.
 *
 * Request Body:
 * {
 *   "query": "string",                    // The search query
 *   "collection_id": "uuid",              // Collection ID
 *   "results": [                          // Search results to explain
 *     {
 *       "chunkId": "string",
 *       "documentId": "string",
 *       "content": "string",
 *       "score": 0.85,
 *       "vectorScore": 0.9,               // Optional
 *       "keywordRank": 2,                 // Optional
 *       "metadata": { ... }               // Optional
 *     }
 *   ],
 *   "result_ids": ["id1", "id2"],         // Optional: specific results to explain
 *   "search_options": {                    // Optional: search config used
 *     "search_type": "hybrid",
 *     "hybrid_alpha": 0.7,
 *     "threshold": 0.5,
 *     "rerank_enabled": false
 *   },
 *   "include_comparisons": true,          // Include ranking comparisons
 *   "include_visualization": true         // Include viz data
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "query_id": "qry_...",
 *   "explanations": [ ... ],
 *   "visualizations": { ... },
 *   "meta": {
 *     "total_results": 10,
 *     "explained_results": 10,
 *     "processing_time_ms": 125
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate required fields
    const query = body?.query;
    const collectionId = body?.collection_id;
    const results = body?.results;

    if (!query || typeof query !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('query');
    }

    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('collection_id');
    }

    if (!results || !Array.isArray(results) || results.length === 0) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('results');
    }

    // Validate results array
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result.chunkId || !result.documentId || !result.content || result.score === undefined) {
        return ValidationErrors.invalidField(
          `results[${i}]`,
          'Each result must have chunkId, documentId, content, and score'
        );
      }
    }

    // Parse options
    const resultIds = body?.result_ids as string[] | undefined;
    const rawSearchOptions = body?.search_options as {
      search_type?: 'vector' | 'keyword' | 'hybrid';
      hybrid_alpha?: number;
      threshold?: number;
      rerank_enabled?: boolean;
    } | undefined;
    const includeComparisons = body?.include_comparisons !== false;
    const includeVisualization = body?.include_visualization !== false;

    // Build explain request
    const explainRequest: ExplainRequest = {
      query,
      collectionId,
      results: results.map((r: Record<string, unknown>) => ({
        chunkId: r.chunkId as string,
        documentId: r.documentId as string,
        content: r.content as string,
        score: r.score as number,
        metadata: r.metadata as Record<string, unknown> | undefined,
        vectorScore: r.vectorScore as number | undefined,
        keywordRank: r.keywordRank as number | undefined,
      })),
      resultIds,
      searchOptions: rawSearchOptions
        ? {
            searchType: rawSearchOptions.search_type || 'hybrid',
            hybridAlpha: rawSearchOptions.hybrid_alpha,
            threshold: rawSearchOptions.threshold,
            rerankEnabled: rawSearchOptions.rerank_enabled,
          }
        : undefined,
      includeComparisons,
      includeVisualization,
    };

    // Generate explanations
    const response = await explainRetrieval(explainRequest, {
      includeComparisons,
      includeVisualization,
      maxComparisons: 3,
    });

    // Store the explanation for later retrieval
    const storedExplanation: StoredExplanation = {
      id: `exp_${randomUUID().replace(/-/g, '').substring(0, 24)}`,
      queryId: response.queryId,
      userId,
      collectionId,
      query,
      explanations: response.explanations,
      visualizations: response.visualizations,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + EXPLANATION_TTL_MS),
    };

    explanationStore.set(response.queryId, storedExplanation);

    // Clean up expired explanations
    cleanupExpiredExplanations();

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/explain', method: 'POST', startTime },
      200
    );

    // Build response
    const apiResponse = NextResponse.json(
      {
        success: true,
        query_id: response.queryId,
        explanations: response.explanations,
        visualizations: response.visualizations,
        meta: {
          total_results: response.meta.totalResults,
          explained_results: response.meta.explainedResults,
          processing_time_ms: response.meta.processingTimeMs,
        },
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => apiResponse.headers.set(k, v));
    }

    return apiResponse;
  } catch (err) {
    console.error('Summer explain error:', err);

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const isUserError = errorMessage.includes('not found') || errorMessage.includes('invalid');

    if (isUserError) {
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: errorMessage,
        status: 400,
      });
    }

    return ServerErrors.internal('explain');
  }
}

/**
 * GET /api/summer/explain
 *
 * Returns API documentation for the explain endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/summer/explain',
    method: 'POST',
    description: 'Generate explanations for search results',
    authentication: 'x-api-key header required',
    request_body: {
      query: {
        type: 'string',
        required: true,
        description: 'The search query used',
      },
      collection_id: {
        type: 'string (UUID)',
        required: true,
        description: 'Collection ID that was searched',
      },
      results: {
        type: 'array',
        required: true,
        description: 'Search results to explain',
        item_schema: {
          chunkId: 'Chunk ID (required)',
          documentId: 'Document ID (required)',
          content: 'Chunk content (required)',
          score: 'Result score (required)',
          vectorScore: 'Vector similarity score (optional)',
          keywordRank: 'Keyword search rank (optional)',
          metadata: 'Chunk metadata (optional)',
        },
      },
      result_ids: {
        type: 'array of strings',
        required: false,
        description: 'Specific chunk IDs to explain (explains all if not provided)',
      },
      search_options: {
        type: 'object',
        required: false,
        properties: {
          search_type: 'vector | keyword | hybrid',
          hybrid_alpha: 'Vector weight for hybrid (0-1)',
          threshold: 'Similarity threshold used',
          rerank_enabled: 'Whether reranking was used',
        },
      },
      include_comparisons: {
        type: 'boolean',
        default: true,
        description: 'Include ranking comparisons with other results',
      },
      include_visualization: {
        type: 'boolean',
        default: true,
        description: 'Include visualization data for UI rendering',
      },
    },
    response: {
      success: 'boolean',
      query_id: 'Unique query ID for later retrieval',
      explanations: {
        type: 'array',
        description: 'Detailed explanations for each result',
        item_schema: {
          id: 'Explanation ID',
          scoreBreakdown: 'Score component breakdown',
          attribution: 'Source attribution info',
          comparisons: 'Ranking comparisons',
        },
      },
      visualizations: 'Visualization data keyed by chunk ID',
      meta: {
        total_results: 'Total results provided',
        explained_results: 'Number of results explained',
        processing_time_ms: 'Processing time',
      },
    },
    related_endpoints: {
      retrieve_saved: 'GET /api/summer/explain/:queryId',
    },
  });
}

/**
 * Clean up expired explanations from the store
 */
function cleanupExpiredExplanations() {
  const now = Date.now();
  for (const [queryId, explanation] of explanationStore.entries()) {
    if (explanation.expiresAt.getTime() < now) {
      explanationStore.delete(queryId);
    }
  }
}

// Export the store for the dynamic route
export { explanationStore };
