/**
 * Secure RAG API
 *
 * POST /api/v1/secure - Store secure chunk
 * GET /api/v1/secure - Get user clearance info
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createConfidentialRAGService,
  createAccessControlService,
  type SecurityLevel,
  type SecurityClassification,
} from '@/lib/confidential/rag-mode';

interface StoreSecureRequest {
  collection_id: string;
  content: string;
  classification?: SecurityClassification;
  auto_classify?: boolean;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    // Check admin permission for storing secure content
    const hasPermission =
      auth.scopes?.includes('admin') ||
      auth.scopes?.includes('secure:write') ||
      auth.scopes?.includes('*');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires admin or secure:write scope' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as StoreSecureRequest;

    if (!body.collection_id || !body.content) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'collection_id and content are required' },
        { status: 400 }
      );
    }

    const service = createConfidentialRAGService();

    // Auto-classify if requested and no classification provided
    let classification = body.classification;
    if (body.auto_classify && !classification) {
      classification = await service.classifyContent(body.content);
    }

    const chunk = await service.storeSecureChunk({
      collectionId: body.collection_id,
      organizationId: auth.organizationId!,
      content: body.content,
      classification: classification || { level: 'internal' },
      metadata: body.metadata,
    });

    return NextResponse.json({
      chunk: {
        id: chunk.id,
        collection_id: chunk.collectionId,
        classification: chunk.classification,
        content_hash: chunk.contentHash,
        created_at: chunk.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[Secure] POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const accessControl = createAccessControlService();

    if (auth.userId) {
      const clearance = await accessControl.getUserClearance(auth.userId, auth.organizationId!);

      return NextResponse.json({
        clearance: {
          level: clearance.level,
          compartments: clearance.compartments,
          roles: clearance.roles,
        },
        security_levels: ['public', 'internal', 'confidential', 'restricted', 'top_secret'],
      });
    }

    return NextResponse.json({
      message: 'Secure RAG API',
      endpoints: {
        'POST /api/v1/secure': 'Store secure chunk with encryption',
        'POST /api/v1/secure/retrieve': 'Retrieve secure chunks with access control',
        'GET /api/v1/secure/clearance': 'Get user clearance info',
        'POST /api/v1/secure/classify': 'Auto-classify content security level',
      },
    });
  } catch (error) {
    console.error('[Secure] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
