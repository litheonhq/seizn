import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { estimateRerankCost, getAvailableModels } from '@/lib/summer/reranker';
import type { RerankerModel } from '@/lib/summer/reranker';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/summer/rerank/estimate
 *
 * Estimate cost for a rerank operation
 *
 * Request Body:
 * {
 *   "model": "cohere" | "voyage" | "cross_encoder" | "bm25",
 *   "document_count": number
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "model": "string",
 *   "document_count": number,
 *   "estimated_cost_usd": number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const body = await request.json();
    const { model, document_count } = body;

    // Validate model
    const validModels: RerankerModel[] = ['cohere', 'voyage', 'cross_encoder', 'bm25'];
    if (!model || !validModels.includes(model)) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/estimate', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: `model must be one of: ${validModels.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate document count
    if (typeof document_count !== 'number' || document_count < 1) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rerank/estimate', method: 'POST', startTime }, 400);
      return NextResponse.json(
        { error: 'document_count must be a positive number' },
        { status: 400 }
      );
    }

    // Calculate estimated cost
    const estimatedCost = estimateRerankCost(model, document_count);

    // Get model info
    const models = getAvailableModels();
    const modelInfo = models.find((m) => m.id === model);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/rerank/estimate', method: 'POST', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        model,
        model_name: modelInfo?.name,
        document_count,
        estimated_cost_usd: estimatedCost,
        cost_breakdown: {
          per_query: modelInfo?.costPerQuery ?? 0,
          per_document: modelInfo?.costPerDocument ?? 0,
          total_document_cost: (modelInfo?.costPerDocument ?? 0) * document_count,
        },
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Summer rerank estimate error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/summer/rerank/estimate
 *
 * Get pricing information for all models
 *
 * Response:
 * {
 *   "success": true,
 *   "models": [
 *     {
 *       "id": "string",
 *       "name": "string",
 *       "description": "string",
 *       "costPerQuery": number,
 *       "costPerDocument": number
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Get all available models with pricing
    const models = getAvailableModels();

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/rerank/estimate', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        models,
        example_estimates: [
          {
            scenario: '10 documents',
            cohere: estimateRerankCost('cohere', 10),
            voyage: estimateRerankCost('voyage', 10),
            cross_encoder: estimateRerankCost('cross_encoder', 10),
            bm25: estimateRerankCost('bm25', 10),
          },
          {
            scenario: '50 documents',
            cohere: estimateRerankCost('cohere', 50),
            voyage: estimateRerankCost('voyage', 50),
            cross_encoder: estimateRerankCost('cross_encoder', 50),
            bm25: estimateRerankCost('bm25', 50),
          },
          {
            scenario: '100 documents',
            cohere: estimateRerankCost('cohere', 100),
            voyage: estimateRerankCost('voyage', 100),
            cross_encoder: estimateRerankCost('cross_encoder', 100),
            bm25: estimateRerankCost('bm25', 100),
          },
        ],
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Summer rerank estimate GET error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
