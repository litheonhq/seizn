/**
 * Secure Retrieve API
 *
 * POST /api/v1/secure/retrieve - Retrieve secure chunks with access control
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createConfidentialRAGService,
  createAccessControlService,
  type AccessContext,
  type AccessReason,
} from '@/lib/confidential/rag-mode';

interface RetrieveRequest {
  collection_id: string;
  chunk_ids: string[];
  reason?: AccessReason;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const body = (await request.json()) as RetrieveRequest;

    if (!body.collection_id || !body.chunk_ids || body.chunk_ids.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'collection_id and chunk_ids are required' },
        { status: 400 }
      );
    }

    // Get user clearance
    const accessControl = createAccessControlService();
    const clearance = auth.userId
      ? await accessControl.getUserClearance(auth.userId, auth.organizationId!)
      : { level: 'public' as const, compartments: [], roles: ['anonymous'] };

    // Build access context
    const context: AccessContext = {
      userId: auth.userId || 'anonymous',
      organizationId: auth.organizationId!,
      roles: clearance.roles,
      clearanceLevel: clearance.level,
      compartments: clearance.compartments,
      mfaVerified: false, // Would come from auth provider
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    };

    // Retrieve with access control
    const service = createConfidentialRAGService();
    const result = await service.retrieveSecure({
      collectionId: body.collection_id,
      context,
      chunkIds: body.chunk_ids,
      reason: body.reason || 'retrieval',
    });

    return NextResponse.json({
      chunks: result.chunks.map((c) => ({
        id: c.id,
        content: c.accessDecision.allowed ? c.content : null,
        classification: c.classification,
        access_granted: c.accessDecision.allowed,
        access_reason: c.accessDecision.reason,
      })),
      access_log: result.accessLog,
      user_clearance: {
        level: clearance.level,
        roles: clearance.roles,
      },
    });
  } catch (error) {
    console.error('[SecureRetrieve] POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
