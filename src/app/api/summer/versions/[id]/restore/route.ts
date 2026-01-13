/**
 * API: /api/summer/versions/:id/restore
 *
 * POST - Restore (rollback) to a specific version
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  ValidationErrors,
  NotFoundErrors,
  ServerErrors,
  createApiError,
  ErrorCodes,
} from '@/lib/api-error';
import {
  getVersionById,
  restoreVersion,
  verifyCollectionAccess,
} from '@/lib/summer/versioning';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/summer/versions/:id/restore - Restore version
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: versionId } = await params;

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const endpoint = `/api/summer/versions/${versionId}/restore`;

    // Parse body (optional)
    let body: { reason?: string } = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Empty body is acceptable
    }

    // Get version
    const version = await getVersionById(versionId);
    if (!version) {
      await logRequest({ userId, keyId, endpoint, method: 'POST', startTime }, 404);
      return NotFoundErrors.resource('Version', versionId);
    }

    // Verify collection access
    const hasAccess = await verifyCollectionAccess(version.collectionId, userId);
    if (!hasAccess) {
      await logRequest({ userId, keyId, endpoint, method: 'POST', startTime }, 404);
      return NotFoundErrors.resource('Version', versionId);
    }

    // Check if version is already active
    if (version.isActive) {
      await logRequest({ userId, keyId, endpoint, method: 'POST', startTime }, 400);
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Version is already active. No restoration needed.',
        status: 400,
        details: { version_id: versionId, version: version.version },
      });
    }

    // Restore version
    const restoredVersion = await restoreVersion({
      versionId,
      userId,
      reason: body?.reason,
    });

    await logRequest({ userId, keyId, endpoint, method: 'POST', startTime }, 200);

    return NextResponse.json({
      success: true,
      message: `Successfully restored from v${version.version}`,
      restored_from: {
        id: version.id,
        version: version.version,
      },
      new_version: {
        id: restoredVersion.id,
        collection_id: restoredVersion.collectionId,
        version: restoredVersion.version,
        created_at: restoredVersion.createdAt.toISOString(),
        created_by: restoredVersion.createdBy,
        change_summary: restoredVersion.changeSummary,
        document_count: restoredVersion.documentCount,
        chunk_count: restoredVersion.chunkCount,
        is_active: restoredVersion.isActive,
        tags: restoredVersion.tags,
        metadata: restoredVersion.metadata,
      },
    });
  } catch (err) {
    console.error('Summer version restore error:', err);
    const message = err instanceof Error ? err.message : 'version restoration';
    return ServerErrors.internal(message);
  }
}
