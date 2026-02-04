import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { getSemanticCache } from '@/lib/summer/cache';

/**
 * DELETE /api/summer/cache/invalidate
 *
 * Cache Invalidation API
 *
 * Invalidate cache entries by various criteria.
 *
 * Request Body:
 * {
 *   "entry_id": "cache_uuid",            // Optional: specific entry ID
 *   "collection_id": "uuid",             // Optional: invalidate all for collection
 *   "expired_only": false                // Optional: only expired entries
 * }
 *
 * At least one of entry_id, collection_id, or expired_only must be provided.
 *
 * Response:
 * {
 *   "success": true,
 *   "invalidated_count": 15,
 *   "invalidated_ids": ["cache_1", "cache_2", ...],
 *   "duration_ms": 45
 * }
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional for some operations
    }

    // Parse invalidation parameters
    const entryId = body?.entry_id as string | undefined;
    const collectionId = body?.collection_id as string | undefined;
    const expiredOnly = body?.expired_only === true;

    // Validate at least one parameter is provided
    if (!entryId && !collectionId && !expiredOnly) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/cache/invalidate', method: 'DELETE', startTime },
        400
      );
      return ValidationErrors.invalidBody(
        'At least one of entry_id, collection_id, or expired_only must be provided'
      );
    }

    // Perform invalidation
    const cache = getSemanticCache();
    const result = await cache.invalidate({
      entryId,
      collectionId,
      userId, // Always scope to user's own entries
      expiredOnly,
    });

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/cache/invalidate', method: 'DELETE', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        invalidated_count: result.invalidatedCount,
        invalidated_ids: result.invalidatedIds,
        duration_ms: result.durationMs,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Cache invalidation error:', err);
    return ServerErrors.internal('cache_invalidate');
  }
}

/**
 * POST /api/summer/cache/invalidate
 *
 * Alternative method for cache invalidation (for clients that don't support DELETE with body)
 */
export async function POST(request: NextRequest) {
  return DELETE(request);
}

/**
 * GET /api/summer/cache/invalidate
 *
 * Returns API documentation for the cache invalidation endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/summer/cache/invalidate',
    methods: ['DELETE', 'POST'],
    description: 'Cache Invalidation - Remove cache entries by various criteria',
    authentication: 'Authorization: Bearer <api-key> header required',
    note: 'Invalidation is always scoped to the authenticated user\'s entries',
    request_body: {
      entry_id: {
        type: 'string',
        required: false,
        description: 'Specific cache entry ID to invalidate',
      },
      collection_id: {
        type: 'string (UUID)',
        required: false,
        description: 'Invalidate all cache entries for a collection',
      },
      expired_only: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Only invalidate expired entries (cleanup)',
      },
    },
    validation: 'At least one of entry_id, collection_id, or expired_only must be provided',
    response: {
      success: 'boolean',
      invalidated_count: 'Number of entries invalidated',
      invalidated_ids: 'Array of invalidated entry IDs',
      duration_ms: 'Operation duration in milliseconds',
    },
    examples: {
      specific_entry: {
        entry_id: 'cache_abc123',
      },
      collection: {
        collection_id: 'collection-uuid-here',
      },
      cleanup_expired: {
        expired_only: true,
      },
      combined: {
        collection_id: 'collection-uuid-here',
        expired_only: true,
      },
    },
    use_cases: [
      {
        scenario: 'Document updated',
        action: 'Invalidate collection cache to ensure fresh results',
        example: { collection_id: 'doc-collection-uuid' },
      },
      {
        scenario: 'Periodic cleanup',
        action: 'Remove expired entries to free memory',
        example: { expired_only: true },
      },
      {
        scenario: 'Debug/testing',
        action: 'Remove specific cached response',
        example: { entry_id: 'cache_specific_id' },
      },
    ],
  });
}
