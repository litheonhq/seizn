import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { retrieve } from '@/lib/summer';
import { estimateTokens } from '@/lib/summer/utils/tokens';

// POST /api/summer/retrieve
// Body:
// {
//   "collection_id": "uuid",
//   "query": "string",
//   "autopilot"?: boolean,
//   "override"?: Partial<RetrievalConfig>,
//   "include_trace"?: boolean,
//   "federated"?: boolean,
//   "experiment_id"?: "uuid"
// }
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    const body = await request.json();
    const collectionId = body?.collection_id;
    const query = body?.query;

    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/retrieve', method: 'POST', startTime }, 400);
      return NextResponse.json({ error: 'collection_id (string) is required' }, { status: 400 });
    }

    if (!query || typeof query !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/retrieve', method: 'POST', startTime }, 400);
      return NextResponse.json({ error: 'query (string) is required' }, { status: 400 });
    }

    const result = await retrieve({
      userId,
      apiKeyId: keyId,
      plan,
      collectionId,
      query,
      autopilot: body?.autopilot ?? true,
      override: body?.override,
      federated: body?.federated ?? false,
      experimentId: body?.experiment_id,
      includeTrace: body?.include_trace ?? false,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/retrieve', method: 'POST', startTime },
      200,
      { embedding: estimateTokens(query) }
    );

    const response = NextResponse.json(
      {
        success: true,
        plan,
        config: result.config,
        results: result.results,
        trace: result.trace,
      },
      { status: 200 }
    );

    // Preserve rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Summer retrieve error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
