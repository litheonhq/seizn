import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { batchRerank } from '@/lib/summer/reranker';
import type { RerankerModel, RerankDocument } from '@/lib/summer/reranker';

/**
 * POST /api/summer/rerank/batch
 *
 * Batch rerank multiple query-document sets
 *
 * Request Body:
 * {
 *   "requests": [
 *     {
 *       "query": "string",
 *       "documents": [{ "id": "string", "content": "string", "metadata"?: object }]
 *     }
 *   ],
 *   "options"?: {
 *     "model"?: "cohere" | "voyage" | "cross_encoder" | "bm25",
 *     "top_k"?: number
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "results": [ RerankResponse, ... ],
 *   "total_latency_ms": number,
 *   "total_cost_usd": number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    const body = await request.json();
    const { requests, options } = body;

    // Validate requests array
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: 'requests (non-empty array) is required' },
        { status: 400 }
      );
    }

    // Validate each request in the batch
    const validatedRequests: Array<{ query: string; documents: RerankDocument[] }> = [];

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];

      if (!req.query || typeof req.query !== 'string') {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
        return NextResponse.json(
          { error: `requests[${i}].query (string) is required` },
          { status: 400 }
        );
      }

      if (!req.documents || !Array.isArray(req.documents) || req.documents.length === 0) {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
        return NextResponse.json(
          { error: `requests[${i}].documents (non-empty array) is required` },
          { status: 400 }
        );
      }

      // Validate documents
      const validatedDocs: RerankDocument[] = [];
      for (let j = 0; j < req.documents.length; j++) {
        const doc = req.documents[j];
        if (!doc || typeof doc !== 'object') {
          await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
          return NextResponse.json(
            { error: `requests[${i}].documents[${j}] must be an object` },
            { status: 400 }
          );
        }

        if (!doc.id || typeof doc.id !== 'string') {
          await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
          return NextResponse.json(
            { error: `requests[${i}].documents[${j}].id (string) is required` },
            { status: 400 }
          );
        }

        if (!doc.content || typeof doc.content !== 'string') {
          await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
          return NextResponse.json(
            { error: `requests[${i}].documents[${j}].content (string) is required` },
            { status: 400 }
          );
        }

        validatedDocs.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
        });
      }

      validatedRequests.push({
        query: req.query,
        documents: validatedDocs,
      });
    }

    // Check batch limits based on plan
    const maxBatchSize =
      plan === 'enterprise' ? 100 :
      plan === 'pro' ? 50 :
      plan === 'plus' ? 20 : 5;

    if (validatedRequests.length > maxBatchSize) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 403);
      return NextResponse.json(
        {
          error: `Batch size (${validatedRequests.length}) exceeds plan limit (${maxBatchSize} for ${plan} plan)`,
          docs_url: 'https://seizn.com/docs#pricing',
        },
        { status: 403 }
      );
    }

    // Validate options
    const validModels: RerankerModel[] = ['cohere', 'voyage', 'cross_encoder', 'bm25'];
    if (options?.model && !validModels.includes(options.model)) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: `options.model must be one of: ${validModels.join(', ')}` },
        { status: 400 }
      );
    }

    // Total document count for free plan limit check
    const totalDocs = validatedRequests.reduce((sum, req) => sum + req.documents.length, 0);
    const model = options?.model ?? 'cohere';

    if ((model === 'cohere' || model === 'voyage') && plan === 'free' && totalDocs > 50) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime }, 403);
      return NextResponse.json(
        {
          error: 'Free plan is limited to 50 total documents per batch request. Upgrade for higher limits.',
          docs_url: 'https://seizn.com/docs#pricing',
        },
        { status: 403 }
      );
    }

    // Perform batch reranking
    const result = await batchRerank({
      userId,
      apiKeyId: keyId,
      plan,
      requests: validatedRequests,
      options: {
        model,
        top_k: options?.top_k,
        skipCache: options?.skipCache ?? false,
      },
    });

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/rerank/batch', method: 'POST', startTime },
      200,
      { embedding: totalDocs } // Track total docs for billing
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        results: result.results,
        total_latency_ms: result.total_latency_ms,
        total_cost_usd: result.total_cost_usd,
        batch_size: validatedRequests.length,
        total_documents: totalDocs,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Summer rerank batch error:', err);

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
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
