/**
 * Fact History API
 *
 * GET /api/spring/temporal/history/[factId] - Get version history of a fact
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

interface RouteParams {
  params: Promise<{ factId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { factId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createTemporalQueryService(supabase);

    const history = await service.getFactHistory(userId, factId);

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/temporal/history/${factId}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      history: history.map((h) => ({
        id: h.id,
        content: h.content,
        type: h.type,
        similarity: h.similarity ?? null,
        validFrom: h.validFrom?.toISOString() ?? null,
        validTo: h.validTo?.toISOString() ?? null,
        eventTime: h.eventTime?.toISOString() ?? null,
        createdAt: h.createdAt.toISOString(),
        supersededById: h.supersededById ?? null,
        metadata: h.metadata,
      })),
      count: history.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Fact history error:', error);
    return ServerErrors.internal('fact_history');
  }
}
