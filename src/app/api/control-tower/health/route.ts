/**
 * Control Tower Health API
 *
 * GET /api/control-tower/health
 * Returns detailed system health status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { getSystemHealth, getServiceHealthHistory, recordServiceHealth } from '@/lib/control-tower';
import type { ServiceName } from '@/lib/control-tower/types';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const url = new URL(request.url);
    const serviceName = url.searchParams.get('service') as ServiceName | null;
    const includeHistory = url.searchParams.get('history') === 'true';
    const historyHours = parseInt(url.searchParams.get('hours') || '24', 10);

    // Get current health
    const health = await getSystemHealth();

    // Record health to history
    for (const service of health.services) {
      await recordServiceHealth(service);
    }

    // If specific service requested with history
    if (serviceName && includeHistory) {
      const service = health.services.find((s) => s.name === serviceName);
      const history = await getServiceHealthHistory(serviceName, historyHours);

      return NextResponse.json({
        success: true,
        data: {
          service,
          history,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (err) {
    logServerError('Control Tower health error', err);
    return ServerErrors.internal('control_tower_health');
  }
}
