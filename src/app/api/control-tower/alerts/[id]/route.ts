/**
 * Control Tower Alert Actions API
 *
 * PATCH /api/control-tower/alerts/[id] - Update alert (acknowledge, resolve, silence)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import {
  acknowledgeAlert,
  resolveAlert,
  silenceAlert,
} from '@/lib/control-tower';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: alertId } = await params;
    const body = await request.json();

    const action = body.action;
    const validActions = ['acknowledge', 'resolve', 'silence'];

    if (!action || !validActions.includes(action)) {
      return ValidationErrors.invalidField('action', `Must be one of: ${validActions.join(', ')}`);
    }

    let alert;

    switch (action) {
      case 'acknowledge':
        alert = await acknowledgeAlert(alertId, userId);
        break;

      case 'resolve':
        alert = await resolveAlert(alertId);
        break;

      case 'silence':
        if (!body.until || typeof body.until !== 'string') {
          return ValidationErrors.invalidField('until', 'Silence end time is required');
        }
        alert = await silenceAlert(alertId, body.until);
        break;

      default:
        return ValidationErrors.invalidField('action', 'Invalid action');
    }

    if (!alert) {
      return NextResponse.json({
        error: {
          code: 'ALERT_NOT_FOUND',
          message: 'Alert not found or action failed',
        },
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: alert,
    });
  } catch (err) {
    console.error('Control Tower alert action error:', err);
    return ServerErrors.internal('control_tower_alert_action');
  }
}
