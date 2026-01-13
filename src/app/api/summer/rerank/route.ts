import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { rerank, getAvailableModels } from '@/lib/summer/reranker';
import type { RerankerModel, RerankDocument } from '@/lib/summer/reranker';

// ============================================
// POST /api/summer/rerank
// ============================================

/**
 * Rerank documents based on query relevance
 *
 * Request Body:
 * {
 *   "query": "string",
 *   "documents": [{ "id": "string", "content": "string", "metadata"?: object }],
 *   "options"?: {
 *     "model"?: "cohere" | "voyage" | "cross_encoder" | "bm25",
 *     "top_k"?: number,
 *     "customModelId"?: "string",
 *     "skipCache"?: boolean,
 *     "includeTrace"?: boolean
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "results": [
 *     {
 *       "id": "string",
 *       "content": "string",
 *       "score": number,
 *       "original_rank": number,
 *       "new_rank": number,
 *       "metadata"?: object
 *     }
 *   ],
 *   "latency_ms": number,
 *   "model": "string",
 *   "cost_usd"?: number,
 *   "cache_hit"?: boolean,
 *   "trace"?: { "traceId": "string", "requestId": "string" }
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
    const body = await request.json();

    // Validate required fields
    const { query, documents, options } = body;

    if (!query || typeof query !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: 'query (string) is required' },
        { status: 400 }
      );
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: 'documents (non-empty array) is required' },
        { status: 400 }
      );
    }

    // Validate documents structure
    const validatedDocs: RerankDocument[] = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      if (!doc || typeof doc !== 'object') {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
        return NextResponse.json(
          { error: `documents[${i}] must be an object` },
          { status: 400 }
        );
      }

      if (!doc.id || typeof doc.id !== 'string') {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
        return NextResponse.json(
          { error: `documents[${i}].id (string) is required` },
          { status: 400 }
        );
      }

      if (!doc.content || typeof doc.content !== 'string') {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
        return NextResponse.json(
          { error: `documents[${i}].content (string) is required` },
          { status: 400 }
        );
      }

      validatedDocs.push({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
      });
    }

    // Validate options
    const validModels: RerankerModel[] = ['cohere', 'voyage', 'cross_encoder', 'bm25'];
    const model = options?.model ?? 'cohere';

    if (options?.model && !validModels.includes(options.model)) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: `options.model must be one of: ${validModels.join(', ')}` },
        { status: 400 }
      );
    }

    const topK = options?.top_k ?? Math.min(validatedDocs.length, 10);
    if (typeof topK !== 'number' || topK < 1 || topK > validatedDocs.length) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: `options.top_k must be between 1 and ${validatedDocs.length}` },
        { status: 400 }
      );
    }

    // Check plan limits for premium models
    if ((model === 'cohere' || model === 'voyage') && plan === 'free') {
      // Free plan gets limited to smaller document sets
      if (validatedDocs.length > 20) {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime }, 403);
        return NextResponse.json(
          {
            error: 'Free plan is limited to 20 documents per rerank request. Upgrade for higher limits.',
            docs_url: 'https://seizn.com/docs#pricing',
          },
          { status: 403 }
        );
      }
    }

    // Perform reranking
    const result = await rerank({
      userId,
      apiKeyId: keyId,
      plan,
      query,
      documents: validatedDocs,
      options: {
        model,
        top_k: topK,
        customModelId: options?.customModelId,
        skipCache: options?.skipCache ?? false,
        includeTrace: options?.includeTrace ?? false,
      },
    });

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/rerank', method: 'POST', startTime },
      200,
      { embedding: validatedDocs.length } // Track as embedding tokens for billing
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        results: result.results,
        latency_ms: result.latency_ms,
        model: result.model,
        cost_usd: result.cost_usd,
        cache_hit: result.cache_hit,
        trace: result.trace,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Summer rerank error:', err);

    // Check for specific error types
    if (err instanceof Error) {
      if (err.message.includes('API_KEY not configured')) {
        return NextResponse.json(
          {
            error: 'Rerank provider not configured',
            message: err.message,
          },
          { status: 503 }
        );
      }

      if (err.message.includes('error:')) {
        return NextResponse.json(
          {
            error: 'Rerank provider error',
            message: err.message,
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// GET /api/summer/rerank
// ============================================

/**
 * Get available reranker models and pricing info
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    // Get available models
    const models = getAvailableModels();

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/rerank', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        plan,
        models,
        limits: {
          free: { max_documents: 20 },
          plus: { max_documents: 100 },
          pro: { max_documents: 500 },
          enterprise: { max_documents: 1000 },
        },
        docs_url: 'https://seizn.com/docs/summer/rerank',
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Summer rerank GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
