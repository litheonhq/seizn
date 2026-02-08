/**
 * Temporal Timeline API
 *
 * GET /api/spring/temporal/timeline - Get memory timeline ordered by event time
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
    const { searchParams } = new URL(request.url);

    // Optional params
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');
    const typesStr = searchParams.get('types');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;
    const types = typesStr ? typesStr.split(',') : undefined;

    const supabase = createServerClient();
    const service = createTemporalQueryService(supabase);

    const entries = await service.getTimeline(userId, {
      startDate,
      endDate,
      types,
      limit: Math.min(limit, 200),
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/temporal/timeline', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      entries: entries.map((e) => ({
        id: e.id,
        content: e.content,
        type: e.type,
        eventTime: e.eventTime.toISOString(),
        validFrom: e.validFrom?.toISOString() ?? null,
        validTo: e.validTo?.toISOString() ?? null,
        isCurrentlyValid: e.isCurrentlyValid,
      })),
      count: entries.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Timeline error:', error);
    return ServerErrors.internal('temporal_timeline');
  }
}
