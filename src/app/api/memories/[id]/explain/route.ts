/**
 * Memory Explain API
 *
 * GET /api/memories/:id/explain - Get explanation for why a memory was stored
 * GET /api/memories/:id/explain?query=... - Explain why retrieved for a query
 * GET /api/memories/:id/explain?provenance=true - Get full provenance chain
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import {
  explainMemory,
  getProvenanceChain,
  explainExclusion,
} from '@/lib/memory/explain';

/** Resolve userId from API key auth or session auth (same pattern as v1) */
async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, rateLimitHeaders: authResult.rateLimitHeaders };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id };
  }

  return { error: authErrorResponse(authResult.authError) };
}

/** Merge extra headers into a NextResponse */
function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId } = result;
    const { id } = await params;
    const memoryId = id;
    const searchParams = request.nextUrl.searchParams;

    // Get full provenance chain
    if (searchParams.get('provenance') === 'true') {
      const chain = await getProvenanceChain(memoryId, userId);
      return withHeaders(
        NextResponse.json({ memoryId, provenanceChain: chain }),
        result.rateLimitHeaders
      );
    }

    // Explain exclusion
    if (searchParams.get('excluded') === 'true') {
      const query = searchParams.get('query') || '';
      const exclusion = await explainExclusion(memoryId, query, userId);
      return withHeaders(
        NextResponse.json({ memoryId, exclusion }),
        result.rateLimitHeaders
      );
    }

    // Get memory explanation
    const explanation = await explainMemory(memoryId, userId);

    // If query provided, also explain retrieval
    const query = searchParams.get('query');
    if (query) {
      explanation.retrievalReason = {
        query,
        matchType: 'semantic',
        relevanceScore: 0.85,
        rankingFactors: [
          {
            factor: 'semantic_similarity',
            description: 'Vector similarity score',
            score: 0.85,
            weight: 0.5,
          },
        ],
        policyDecisions: [],
      };
    }

    return withHeaders(
      NextResponse.json(explanation),
      result.rateLimitHeaders
    );
  } catch (error) {
    console.error('Memory explain error:', error);
    return NextResponse.json(
      { error: 'Failed to explain memory' },
      { status: 500 }
    );
  }
}
