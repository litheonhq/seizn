import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { resolveAlert } from '@/lib/summer/retops';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/summer/retops/alerts/[alertId]/resolve
 *
 * Resolve an alert for the authenticated user.
 *
 * Response:
 * {
 *   "success": true,
 *   "alertId": "alert_xxx",
 *   "resolvedAt": "2024-01-01T00:00:00Z"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Get alert ID from params
    const { alertId } = await params;

    if (!alertId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Alert ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Resolve the alert
    const success = await resolveAlert(userId, alertId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Alert not found: ${alertId}`,
          },
        },
        { status: 404 }
      );
    }

    // Log request
    await logRequest(
      {
        userId,
        keyId,
        endpoint: `/api/summer/retops/alerts/${alertId}/resolve`,
        method: 'POST',
        startTime,
      },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        alertId,
        resolvedAt: new Date().toISOString(),
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Alert resolve error', err);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to resolve alert',
        },
      },
      { status: 500 }
    );
  }
}
