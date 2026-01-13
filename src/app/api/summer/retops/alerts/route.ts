import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { getAlerts, detectAnomalies, checkThresholds } from '@/lib/summer/retops';
import type { AlertStatus, AlertSeverity } from '@/lib/summer/retops/types';

/**
 * GET /api/summer/retops/alerts
 *
 * Get alerts for the authenticated user.
 *
 * Query Parameters:
 * - status: Filter by alert status (active, acknowledged, resolved) - optional
 * - severity: Filter by severity (info, warning, critical) - optional
 * - limit: Number of alerts to return (1-100) - default: 50
 *
 * Response:
 * {
 *   "success": true,
 *   "alerts": [
 *     {
 *       "id": "alert_xxx",
 *       "type": "high_latency",
 *       "severity": "warning",
 *       "status": "active",
 *       "title": "[WARNING] High Latency Detected",
 *       "message": "latency_p99 is above threshold...",
 *       "metric": "latency_p99",
 *       "threshold": 500,
 *       "currentValue": 650,
 *       "createdAt": "2024-01-01T00:00:00Z",
 *       "updatedAt": "2024-01-01T00:00:00Z"
 *     },
 *     ...
 *   ],
 *   "activeCount": 3,
 *   "acknowledgedCount": 2
 * }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as AlertStatus | null;
    const severity = searchParams.get('severity') as AlertSeverity | null;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '50', 10))
    );

    // Validate status
    const validStatuses: AlertStatus[] = ['active', 'acknowledged', 'resolved'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Validate severity
    const validSeverities: AlertSeverity[] = ['info', 'warning', 'critical'];
    if (severity && !validSeverities.includes(severity)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Get alerts
    const result = await getAlerts(userId, {
      status: status || undefined,
      severity: severity || undefined,
      limit,
    });

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/retops/alerts', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        alerts: result.alerts,
        activeCount: result.activeCount,
        acknowledgedCount: result.acknowledgedCount,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('RetOps alerts error:', err);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve alerts',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/summer/retops/alerts
 *
 * Trigger alert detection for the authenticated user.
 * This runs anomaly detection and threshold checks.
 *
 * Request Body:
 * {
 *   "detectAnomalies": true,    // Run anomaly detection
 *   "checkThresholds": true     // Check threshold alerts
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "anomaliesDetected": 2,
 *   "alertsCreated": 1
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    const body = await request.json();
    const runAnomalyDetection = body?.detectAnomalies !== false;
    const runThresholdCheck = body?.checkThresholds !== false;

    let anomaliesDetected = 0;
    let alertsCreated = 0;

    // Run anomaly detection
    if (runAnomalyDetection) {
      const anomalies = await detectAnomalies(userId);
      anomaliesDetected = anomalies.length;
    }

    // Run threshold checks
    if (runThresholdCheck) {
      const alerts = await checkThresholds(userId);
      alertsCreated = alerts.length;
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/retops/alerts', method: 'POST', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        anomaliesDetected,
        alertsCreated,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('RetOps alert detection error:', err);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to run alert detection',
        },
      },
      { status: 500 }
    );
  }
}
