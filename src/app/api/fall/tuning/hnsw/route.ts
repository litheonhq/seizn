/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { recommendHnswIndex, recommendEfSearch } from '@/lib/summer/tuning/hnsw';

// GET /api/fall/tuning/hnsw?vector_count=100000&dim=1536&workload=balanced&top_k=20
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { plan } = authResult;

    const url = new URL(request.url);

    const vectorCount = Number(url.searchParams.get('vector_count') ?? 0);
    const dim = Number(url.searchParams.get('dim') ?? 0);
    const workload = (url.searchParams.get('workload') ?? 'balanced') as any;

    const topK = Number(url.searchParams.get('top_k') ?? 20);

    const indexRec = recommendHnswIndex({
      vectorCount: Number.isFinite(vectorCount) && vectorCount > 0 ? vectorCount : 100_000,
      dim: Number.isFinite(dim) && dim > 0 ? dim : 1536,
      workload,
    });

    const searchRec = recommendEfSearch({ topK: Number.isFinite(topK) ? topK : 20, plan });

    return NextResponse.json(
      {
        success: true,
        index: indexRec,
        search: searchRec,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Fall tuning hnsw error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
