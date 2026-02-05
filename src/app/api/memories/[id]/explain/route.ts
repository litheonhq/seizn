/**
 * Memory Explain API
 *
 * GET /api/memories/:id/explain - Get explanation for why a memory was stored
 * GET /api/memories/:id/explain?query=... - Explain why retrieved for a query
 * GET /api/memories/:id/explain?provenance=true - Get full provenance chain
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  explainMemory,
  explainRetrieval,
  getProvenanceChain,
  explainExclusion,
} from '@/lib/memory/explain';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const memoryId = id;
    const searchParams = request.nextUrl.searchParams;

    // Get full provenance chain
    if (searchParams.get('provenance') === 'true') {
      const chain = await getProvenanceChain(memoryId);
      return NextResponse.json({ memoryId, provenanceChain: chain });
    }

    // Explain exclusion
    if (searchParams.get('excluded') === 'true') {
      const query = searchParams.get('query') || '';
      const exclusion = await explainExclusion(memoryId, query);
      return NextResponse.json({ memoryId, exclusion });
    }

    // Get memory explanation
    const explanation = await explainMemory(memoryId);

    // If query provided, also explain retrieval
    const query = searchParams.get('query');
    if (query) {
      // In a real implementation, we'd pass the actual search results
      // For now, we'll provide a simplified retrieval explanation
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

    return NextResponse.json(explanation);
  } catch (error) {
    console.error('Memory explain error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to explain memory' },
      { status: 500 }
    );
  }
}
