/**
 * Control Tower Alert Rules API
 *
 * GET /api/control-tower/alerts/rules - List alert rules
 * POST /api/control-tower/alerts/rules - Create alert rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { getAlertRules, createAlertRule } from '@/lib/control-tower';
import type { AlertCondition } from '@/lib/control-tower/types';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('org_id') || undefined;

    const rules = await getAlertRules(userId, organizationId);

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (err) {
    logServerError('Control Tower alert rules error', err);
    return ServerErrors.internal('control_tower_alert_rules');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();
    const organizationId = body.organization_id || undefined;

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return ValidationErrors.invalidField('name', 'Rule name is required');
    }

    const validSeverities = ['info', 'warning', 'error', 'critical'];
    if (!body.severity || !validSeverities.includes(body.severity)) {
      return ValidationErrors.invalidField('severity', `Must be one of: ${validSeverities.join(', ')}`);
    }

    // Validate condition
    if (!body.condition || typeof body.condition !== 'object') {
      return ValidationErrors.invalidField('condition', 'Alert condition is required');
    }

    const condition = body.condition as Partial<AlertCondition>;
    if (!condition.metric || typeof condition.metric !== 'string') {
      return ValidationErrors.invalidField('condition.metric', 'Metric name is required');
    }

    const validOperators = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'];
    if (!condition.operator || !validOperators.includes(condition.operator)) {
      return ValidationErrors.invalidField('condition.operator', `Must be one of: ${validOperators.join(', ')}`);
    }

    if (typeof condition.threshold !== 'number') {
      return ValidationErrors.invalidField('condition.threshold', 'Threshold must be a number');
    }

    if (!condition.duration || typeof condition.duration !== 'string') {
      return ValidationErrors.invalidField('condition.duration', 'Duration is required (e.g., "5m", "1h")');
    }

    const rule = await createAlertRule(userId, {
      organizationId,
      name: body.name,
      description: body.description,
      severity: body.severity,
      condition: condition as AlertCondition,
      notificationChannels: body.notificationChannels || [],
    });

    if (!rule) {
      return ServerErrors.internal('create_alert_rule');
    }

    return NextResponse.json({
      success: true,
      data: rule,
    }, { status: 201 });
  } catch (err) {
    logServerError('Control Tower create alert rule error', err);
    return ServerErrors.internal('control_tower_create_alert_rule');
  }
}
