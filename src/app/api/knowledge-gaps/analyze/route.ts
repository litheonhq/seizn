import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  analyzeKnowledgeGap,
  findSimilarGap,
  createKnowledgeGap,
  recordGapOccurrence,
  type GapAnalysisInput,
  type GapAnalysisResponse,
  DEFAULT_GAP_CONFIG,
} from '@/lib/knowledge-gap';
import { getEmbeddingProvider } from '@/lib/summer/embedding';

/**
 * POST /api/knowledge-gaps/analyze
 * Analyze a query for knowledge gaps
 *
 * This endpoint is typically called automatically when retrieval produces
 * poor results, but can also be called manually for analysis.
 *
 * Body:
 * {
 *   "query": "string",
 *   "query_embedding"?: number[],  // Optional, will be computed if not provided
 *   "retrieval_result": {
 *     "results": [...],
 *     "total_results": number,
 *     "filtered_by_permission"?: number
 *   },
 *   "collection_id"?: "uuid",
 *   "trace_id"?: "string",
 *   "session_id"?: "string",
 *   "auto_create"?: boolean,  // Whether to create gap record (default: true)
 *   "deduplicate"?: boolean   // Whether to find existing similar gaps (default: true)
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const body = await request.json();

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return ValidationErrors.missingField('query');
    }

    if (!body.retrieval_result || typeof body.retrieval_result !== 'object') {
      return ValidationErrors.missingField('retrieval_result');
    }

    if (!Array.isArray(body.retrieval_result.results)) {
      return ValidationErrors.missingField('retrieval_result.results');
    }

    // Get or compute query embedding
    let queryEmbedding: number[];
    if (body.query_embedding && Array.isArray(body.query_embedding)) {
      queryEmbedding = body.query_embedding;
    } else {
      const embedder = getEmbeddingProvider();
      const [embedding] = await embedder.embed([body.query], 'query');
      queryEmbedding = embedding;
    }

    // Check for existing similar gap if deduplication enabled
    const shouldDedupe = body.deduplicate !== false;
    let existingGap = null;

    if (shouldDedupe) {
      existingGap = await findSimilarGap(
        userId,
        queryEmbedding,
        DEFAULT_GAP_CONFIG.deduplicationThreshold
      );
    }

    // Prepare analysis input
    const analysisInput: GapAnalysisInput = {
      query: body.query,
      queryEmbedding,
      retrievalResult: {
        results: body.retrieval_result.results.map((r: Record<string, unknown>) => ({
          chunkId: r.chunk_id || r.chunkId,
          documentId: r.document_id || r.documentId,
          text: r.text || r.content,
          similarity: r.similarity || r.score || 0,
          metadata: r.metadata || {},
        })),
        totalResults: body.retrieval_result.total_results ?? body.retrieval_result.results.length,
        filteredByPermission: body.retrieval_result.filtered_by_permission,
      },
      collectionId: body.collection_id,
      userId,
    };

    // Run analysis
    const analysis = await analyzeKnowledgeGap(analysisInput);

    // Build response
    const response: GapAnalysisResponse = {
      analysis,
      existingGap: existingGap || undefined,
    };

    // Create gap record if appropriate
    const shouldAutoCreate = body.auto_create !== false;

    if (existingGap) {
      // Record occurrence on existing gap
      await recordGapOccurrence(
        existingGap.id,
        body.query,
        queryEmbedding,
        body.trace_id,
        body.session_id
      );
    } else if (shouldAutoCreate && analysis.shouldCreateGap) {
      // Create new gap
      const newGap = await createKnowledgeGap({
        userId,
        collectionId: body.collection_id,
        queryText: body.query,
        queryEmbedding,
        gapType: analysis.gapType,
        missingEntities: analysis.missingEntities,
        suggestedSources: analysis.suggestedSources,
        relatedDocs: analysis.relatedDocs,
        confidence: analysis.confidence,
        analysisMetadata: {
          traceId: body.trace_id,
          sessionId: body.session_id,
          retrievalResultCount: analysisInput.retrievalResult.totalResults,
        },
      });

      response.gapCreated = newGap;
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/knowledge-gaps/analyze', method: 'POST', startTime },
      200
    );

    const httpResponse = NextResponse.json(
      {
        success: true,
        ...response,
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => httpResponse.headers.set(k, v));
    }

    return httpResponse;
  } catch (err) {
    console.error('Analyze knowledge gap error:', err);
    return ServerErrors.internal('analyze_knowledge_gap');
  }
}
