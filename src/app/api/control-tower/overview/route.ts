/**
 * Control Tower Overview API
 *
 * GET /api/control-tower/overview
 * Returns comprehensive system overview including health, metrics, alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { getControlTowerOverview } from '@/lib/control-tower';
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

    const overview = await getControlTowerOverview(userId, organizationId);

    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (err) {
    logServerError('Control Tower overview error', err);
    return ServerErrors.internal('control_tower_overview');
  }
}
