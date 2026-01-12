/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { indexDocuments } from '@/lib/summer';
import { estimateTokens } from '@/lib/summer/utils/tokens';

// POST /api/summer/index
// Body:
// {
//  "collection_id": "uuid",
//  "documents": [{"external_id"?: string, "title"?: string, "source"?: string, "content": string, "metadata"?: object}],
//  "chunking"?: { "maxTokens"?: number, "overlapTokens"?: number }
// }
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan } = authResult;
    const body = await request.json();

    const collectionId = body?.collection_id;
    const documents = body?.documents;

    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return NextResponse.json({ error: 'collection_id (string) is required' }, { status: 400 });
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return NextResponse.json({ error: 'documents (array) is required' }, { status: 400 });
    }

    // Index
    const result = await indexDocuments({
      userId,
      collectionId,
      documents,
      chunking: body?.chunking,
    });

    // Usage estimate: embeddings for all content (rough)
    const approxEmbeddingTokens = documents
      .map((d: any) => estimateTokens(String(d?.content ?? '')))
      .reduce((a: number, b: number) => a + b, 0);

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
      200,
      { embedding: approxEmbeddingTokens }
    );

    return NextResponse.json({
      success: true,
      plan,
      indexed: result,
    });
  } catch (err) {
    console.error('Summer index error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
