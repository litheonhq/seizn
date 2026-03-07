/**
 * API: /api/summer/versions
 *
 * POST - Create a new version
 * GET - List versions for a collection
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
} from '@/lib/api-error';
import {
  createVersion,
  listVersions,
  verifyCollectionAccess,
  VersionType,
} from '@/lib/summer/versioning';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';

// POST /api/summer/versions - Create new version
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse body
    let body: {
      collection_id?: string;
      change_summary?: string;
      version_type?: VersionType;
      tags?: string[];
      metadata?: Record<string, unknown>;
    };

    try {
      body = await request.json();
    } catch {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    const collectionId = body?.collection_id?.trim();
    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('collection_id');
    }

    const changeSummary = body?.change_summary?.trim();
    if (!changeSummary) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('change_summary');
    }

    // Validate version type
    const versionType = body?.version_type ?? 'patch';
    if (!['major', 'minor', 'patch'].includes(versionType)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField('version_type', 'Must be major, minor, or patch');
    }

    // Verify collection access
    const hasAccess = await verifyCollectionAccess(collectionId, userId);
    if (!hasAccess) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'POST', startTime },
        404
      );
      return NotFoundErrors.collection(collectionId);
    }

    // Create version
    const version = await createVersion({
      collectionId,
      userId,
      changeSummary,
      versionType: versionType as VersionType,
      tags: body?.tags,
      metadata: body?.metadata,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/versions', method: 'POST', startTime },
      201
    );

    return NextResponse.json(
      {
        success: true,
        version: {
          id: version.id,
          collection_id: version.collectionId,
          version: version.version,
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
      },
      { status: 201 }
    );
  } catch (err) {
    logServerError('Summer versions POST error', err);
    return ServerErrors.internal('version creation');
  }
}

// GET /api/summer/versions - List versions
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Get query params
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id');
    const limit = boundedInt(searchParams.get('limit'), 20, 1, 100);
    const offset = boundedInt(searchParams.get('offset'), 0, 0, 100_000);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'GET', startTime },
        400
      );
      return ValidationErrors.missingField('collection_id');
    }

    // Verify collection access
    const hasAccess = await verifyCollectionAccess(collectionId, userId);
    if (!hasAccess) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/versions', method: 'GET', startTime },
        404
      );
      return NotFoundErrors.collection(collectionId);
    }

    // List versions
    const { versions, total } = await listVersions(collectionId, {
      limit,
      offset,
      includeInactive,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/versions', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      versions: versions.map((v) => ({
        id: v.id,
        collection_id: v.collectionId,
        version: v.version,
        created_at: v.createdAt.toISOString(),
        created_by: v.createdBy,
        change_summary: v.changeSummary,
        document_count: v.documentCount,
        chunk_count: v.chunkCount,
        embedding_dimensions: v.embeddingDimensions,
        is_active: v.isActive,
        tags: v.tags,
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + versions.length < total,
      },
    });
  } catch (err) {
    logServerError('Summer versions GET error', err);
    return ServerErrors.internal('version listing');
  }
}
