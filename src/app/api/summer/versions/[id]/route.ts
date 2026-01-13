/**
 * API: /api/summer/versions/:id
 *
 * GET - Get version details
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  NotFoundErrors,
  ServerErrors,
} from '@/lib/api-error';
import {
  getVersionById,
  verifyCollectionAccess,
} from '@/lib/summer/versioning';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/summer/versions/:id - Get version details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: versionId } = await params;

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const endpoint = `/api/summer/versions/${versionId}`;

    // Get version
    const version = await getVersionById(versionId);
    if (!version) {
      await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 404);
      return NotFoundErrors.resource('Version', versionId);
    }

    // Verify collection access
    const hasAccess = await verifyCollectionAccess(version.collectionId, userId);
    if (!hasAccess) {
      await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 404);
      return NotFoundErrors.resource('Version', versionId);
    }

    await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 200);

    return NextResponse.json({
      success: true,
      version: {
        id: version.id,
        collection_id: version.collectionId,
        version: version.version,
        semantic_version: {
          major: version.semanticVersion.major,
          minor: version.semanticVersion.minor,
          patch: version.semanticVersion.patch,
        },
        created_at: version.createdAt.toISOString(),
        created_by: version.createdBy,
        change_summary: version.changeSummary,
        document_count: version.documentCount,
        chunk_count: version.chunkCount,
        embedding_dimensions: version.embeddingDimensions,
        embedding_provider: version.embeddingProvider,
        embedding_model: version.embeddingModel,
        previous_version_id: version.previousVersionId,
        is_active: version.isActive,
        tags: version.tags,
        metadata: version.metadata,
      },
    });
  } catch (err) {
    console.error('Summer version GET error:', err);
    return ServerErrors.internal('version retrieval');
  }
}
