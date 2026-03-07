import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { logServerError } from '@/lib/server/logger';
import { explanationStore } from '../route';

/**
 * GET /api/summer/explain/:queryId
 *
 * Retrieve a previously generated explanation by query ID.
 *
 * Path Parameters:
 * - queryId: The query ID returned from POST /api/summer/explain
 *
 * Response:
 * {
 *   "success": true,
 *   "query_id": "qry_...",
 *   "query": "original search query",
 *   "collection_id": "uuid",
 *   "explanations": [ ... ],
 *   "visualizations": { ... },
 *   "created_at": "2024-01-15T10:30:00Z",
 *   "expires_at": "2024-01-16T10:30:00Z"
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ queryId: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Get query ID from params
    const { queryId } = await params;

    if (!queryId) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'GET', startTime }, 400);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Query ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Look up the stored explanation
    const explanation = explanationStore.get(queryId);

    if (!explanation) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'GET', startTime }, 404);
      return NotFoundErrors.resource('Explanation', queryId);
    }

    // Check if the explanation belongs to this user
    if (explanation.userId !== userId) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'GET', startTime }, 403);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this explanation',
          },
        },
        { status: 403 }
      );
    }

    // Check if explanation has expired
    if (explanation.expiresAt.getTime() < Date.now()) {
      explanationStore.delete(queryId);
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'GET', startTime }, 404);
      return NotFoundErrors.resource('Explanation', queryId);
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        query_id: explanation.queryId,
        query: explanation.query,
        collection_id: explanation.collectionId,
        explanations: explanation.explanations,
        visualizations: explanation.visualizations,
        created_at: explanation.createdAt.toISOString(),
        expires_at: explanation.expiresAt.toISOString(),
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Summer explain retrieve error', err);
    return ServerErrors.internal('explain-retrieve');
  }
}

/**
 * DELETE /api/summer/explain/:queryId
 *
 * Delete a stored explanation.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ queryId: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Get query ID from params
    const { queryId } = await params;

    if (!queryId) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'DELETE', startTime }, 400);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Query ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Look up the stored explanation
    const explanation = explanationStore.get(queryId);

    if (!explanation) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'DELETE', startTime }, 404);
      return NotFoundErrors.resource('Explanation', queryId);
    }

    // Check if the explanation belongs to this user
    if (explanation.userId !== userId) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'DELETE', startTime }, 403);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this explanation',
          },
        },
        { status: 403 }
      );
    }

    // Delete the explanation
    explanationStore.delete(queryId);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/explain/:queryId', method: 'DELETE', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        message: 'Explanation deleted successfully',
        query_id: queryId,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Summer explain delete error', err);
    return ServerErrors.internal('explain-delete');
  }
}
