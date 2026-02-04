/**
 * Control Tower Alert Rule Management API
 *
 * PATCH /api/control-tower/alerts/rules/[id] - Update rule
 * DELETE /api/control-tower/alerts/rules/[id] - Delete rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { updateAlertRule, deleteAlertRule } from '@/lib/control-tower';
import type { AlertCondition } from '@/lib/control-tower/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { id: ruleId } = await params;
    const body = await request.json();

    // Validate severity if provided
    if (body.severity) {
      const validSeverities = ['info', 'warning', 'error', 'critical'];
      if (!validSeverities.includes(body.severity)) {
        return ValidationErrors.invalidField('severity', `Must be one of: ${validSeverities.join(', ')}`);
      }
    }

    // Validate condition if provided
    if (body.condition) {
      const condition = body.condition as Partial<AlertCondition>;

      if (condition.operator) {
        const validOperators = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'];
        if (!validOperators.includes(condition.operator)) {
          return ValidationErrors.invalidField('condition.operator', `Must be one of: ${validOperators.join(', ')}`);
        }
      }

      if (condition.threshold !== undefined && typeof condition.threshold !== 'number') {
        return ValidationErrors.invalidField('condition.threshold', 'Threshold must be a number');
      }
    }

    const rule = await updateAlertRule(ruleId, {
      name: body.name,
      description: body.description,
      enabled: body.enabled,
      severity: body.severity,
      condition: body.condition,
      notificationChannels: body.notificationChannels,
      silenceUntil: body.silenceUntil,
    });

    if (!rule) {
      return NextResponse.json({
        error: {
          code: 'RULE_NOT_FOUND',
          message: 'Alert rule not found or update failed',
        },
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (err) {
    console.error('Control Tower update alert rule error:', err);
    return ServerErrors.internal('control_tower_update_alert_rule');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { id: ruleId } = await params;

    const success = await deleteAlertRule(ruleId);

    if (!success) {
      return NextResponse.json({
        error: {
          code: 'RULE_NOT_FOUND',
          message: 'Alert rule not found or delete failed',
        },
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Alert rule deleted',
    });
  } catch (err) {
    console.error('Control Tower delete alert rule error:', err);
    return ServerErrors.internal('control_tower_delete_alert_rule');
  }
}
