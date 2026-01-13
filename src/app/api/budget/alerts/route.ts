/**
 * Budget Alerts API
 *
 * GET /api/budget/alerts - Get budget alerts
 * POST /api/budget/alerts - Acknowledge alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import {
  getAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
} from '@/lib/budget-planner';

/**
 * GET /api/budget/alerts
 *
 * Get budget alerts for the authenticated user.
 *
 * Query parameters:
 * - unacknowledged_only: true/false (default: false)
 * - limit: Number of alerts to return (default: 50)
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  try {
    const { searchParams } = new URL(request.url);

    const unacknowledgedOnly = searchParams.get('unacknowledged_only') === 'true';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 50;

    const alerts = await getAlerts(auth.userId, {
      unacknowledgedOnly,
      limit,
    });

    return NextResponse.json({
      success: true,
      alerts: alerts.map(a => ({
        id: a.id,
        alert_type: a.alertType,
        threshold_pct: a.thresholdPct,
        current_spent_usd: a.currentSpent,
        budget_limit_usd: a.budgetLimit,
        title: a.title,
        message: a.message,
        acknowledged: a.acknowledged,
        acknowledged_at: a.acknowledgedAt,
        created_at: a.createdAt,
      })),
      total_count: alerts.length,
      unacknowledged_count: alerts.filter(a => !a.acknowledged).length,
    }, {
      headers: auth.rateLimitHeaders,
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ALERTS_ERROR',
          message: 'Failed to retrieve budget alerts',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/alerts
 *
 * Acknowledge budget alerts.
 *
 * Body:
 * {
 *   "alert_id": "uuid",        // Acknowledge specific alert
 *   "acknowledge_all": true    // Or acknowledge all alerts
 * }
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  try {
    const body = await request.json();

    if (body.acknowledge_all === true) {
      // Acknowledge all alerts
      const count = await acknowledgeAllAlerts(auth.userId);

      return NextResponse.json({
        success: true,
        acknowledged_count: count,
        message: `Acknowledged ${count} alert(s)`,
      }, {
        headers: auth.rateLimitHeaders,
      });
    }

    if (body.alert_id) {
      // Acknowledge specific alert
      await acknowledgeAlert(body.alert_id);

      return NextResponse.json({
        success: true,
        acknowledged_id: body.alert_id,
        message: 'Alert acknowledged',
      }, {
        headers: auth.rateLimitHeaders,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Provide either alert_id or acknowledge_all: true',
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error acknowledging alerts:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ALERTS_ERROR',
          message: 'Failed to acknowledge alerts',
        },
      },
      { status: 500 }
    );
  }
}
