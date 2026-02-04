/**
 * Control Tower Alerts API
 *
 * GET /api/control-tower/alerts - List alerts
 * POST /api/control-tower/alerts - Create manual alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import {
  getActiveAlerts,
  getAlertHistory,
  createAlert,
} from '@/lib/control-tower';
import type { AlertSeverity, AlertStatus } from '@/lib/control-tower/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);

    // Organization ID can be passed as query param for org-scoped queries
    const organizationId = url.searchParams.get('org_id') || undefined;
    const activeOnly = url.searchParams.get('active') !== 'false';
    const severity = url.searchParams.get('severity') as AlertSeverity | null;
    const status = url.searchParams.get('status') as AlertStatus | null;
    const since = url.searchParams.get('since');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    if (activeOnly) {
      const alerts = await getActiveAlerts(userId, organizationId);
      return NextResponse.json({
        success: true,
        data: alerts,
      });
    }

    const alerts = await getAlertHistory(userId, {
      organizationId,
      severity: severity || undefined,
      status: status || undefined,
      since: since || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: alerts,
    });
  } catch (err) {
    console.error('Control Tower alerts error:', err);
    return ServerErrors.internal('control_tower_alerts');
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
      return ValidationErrors.invalidField('name', 'Alert name is required');
    }

    if (!body.description || typeof body.description !== 'string') {
      return ValidationErrors.invalidField('description', 'Alert description is required');
    }

    const validSeverities = ['info', 'warning', 'error', 'critical'];
    if (!body.severity || !validSeverities.includes(body.severity)) {
      return ValidationErrors.invalidField('severity', `Must be one of: ${validSeverities.join(', ')}`);
    }

    const alert = await createAlert({
      userId,
      organizationId,
      name: body.name,
      description: body.description,
      severity: body.severity,
      source: body.source || 'manual',
      labels: body.labels || {},
      annotations: body.annotations || {},
    });

    if (!alert) {
      return ServerErrors.internal('create_alert');
    }

    return NextResponse.json({
      success: true,
      data: alert,
    }, { status: 201 });
  } catch (err) {
    console.error('Control Tower create alert error:', err);
    return ServerErrors.internal('control_tower_create_alert');
  }
}
