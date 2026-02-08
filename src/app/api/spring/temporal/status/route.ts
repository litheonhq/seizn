/**
 * Temporal Status API
 *
 * GET /api/spring/temporal/status - Get counts by temporal status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createTemporalQueryService } from '@/lib/spring/memory-v4/temporal-query';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createTemporalQueryService(supabase);

    const status = await service.countByTemporalStatus(userId);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/temporal/status', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      active: status.active,
      expired: status.expired,
      superseded: status.superseded,
      expiringSoon: status.expiringSoon,
      total: status.active + status.expired + status.superseded,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Temporal status error:', error);
    return ServerErrors.internal('temporal_status');
  }
}
