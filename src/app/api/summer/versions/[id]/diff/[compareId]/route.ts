/**
 * API: /api/summer/versions/:id/diff/:compareId
 *
 * GET - Compare two versions and return diff
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
  createApiError,
  ErrorCodes,
} from '@/lib/api-error';
import {
  getVersionPair,
  generateVersionDiff,
  verifyCollectionAccess,
} from '@/lib/summer/versioning';

interface RouteParams {
  params: Promise<{ id: string; compareId: string }>;
}

// GET /api/summer/versions/:id/diff/:compareId - Compare versions
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: sourceId, compareId: targetId } = await params;

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const endpoint = `/api/summer/versions/${sourceId}/diff/${targetId}`;

    // Get query params
    const { searchParams } = new URL(request.url);
    const includeChunkDiffs = searchParams.get('include_chunks') === 'true';
    const maxChunksPerDoc = Math.min(
      parseInt(searchParams.get('max_chunks_per_doc') ?? '50', 10),
      100
    );

    // Get version pair
    let versionPair;
    try {
      versionPair = await getVersionPair(sourceId, targetId);
    } catch (err) {
      await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 400);
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: err instanceof Error ? err.message : 'Invalid version comparison',
        status: 400,
        details: { source_id: sourceId, target_id: targetId },
      });
    }

    if (!versionPair) {
      await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 404);
      return NotFoundErrors.resource('Version', `${sourceId} or ${targetId}`);
    }

    // Verify collection access
    const hasAccess = await verifyCollectionAccess(versionPair.source.collectionId, userId);
    if (!hasAccess) {
      await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 404);
      return NotFoundErrors.collection(versionPair.source.collectionId);
    }

    // Generate diff
    const diff = await generateVersionDiff(sourceId, targetId, {
      includeChunkDiffs,
      maxChunkDiffsPerDocument: maxChunksPerDoc,
    });

    await logRequest({ userId, keyId, endpoint, method: 'GET', startTime }, 200);

    return NextResponse.json({
      success: true,
      diff: {
        source: {
          id: diff.sourceVersionId,
          version: diff.sourceVersion,
        },
        target: {
          id: diff.targetVersionId,
          version: diff.targetVersion,
        },
        collection_id: diff.collectionId,
        generated_at: diff.generatedAt.toISOString(),
        summary: {
          documents_added: diff.summary.documentsAdded,
          documents_removed: diff.summary.documentsRemoved,
          documents_modified: diff.summary.documentsModified,
          documents_unchanged: diff.summary.documentsUnchanged,
          total_chunks_added: diff.summary.totalChunksAdded,
          total_chunks_removed: diff.summary.totalChunksRemoved,
          total_chunks_modified: diff.summary.totalChunksModified,
        },
        documents: diff.documents.map((doc) => ({
          document_id: doc.documentId,
          title: doc.title,
          change_type: doc.changeType,
          previous_hash: doc.previousHash,
          current_hash: doc.currentHash,
          chunks_changed: doc.chunksChanged,
          ...(doc.chunkDiffs && {
            chunk_diffs: doc.chunkDiffs.map((chunk) => ({
              chunk_index: chunk.chunkIndex,
              change_type: chunk.changeType,
              previous_content: chunk.previousContent,
              current_content: chunk.currentContent,
              previous_hash: chunk.previousHash,
              current_hash: chunk.currentHash,
            })),
          }),
        })),
      },
    });
  } catch (err) {
    console.error('Summer version diff error:', err);
    return ServerErrors.internal('version comparison');
  }
}
