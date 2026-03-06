/**
 * Control Tower Signals API
 *
 * GET /api/control-tower/signals
 * Returns high-signal widgets:
 * - top failing traces
 * - security policy events
 * - search quality regressions
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { getControlTowerSignals } from '@/lib/control-tower';
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

    const signals = await getControlTowerSignals(userId, organizationId, limit);

    return NextResponse.json({
      success: true,
      data: signals,
    });
  } catch (err) {
    logServerError('Control Tower signals error', err);
    return ServerErrors.internal('control_tower_signals');
  }
}
