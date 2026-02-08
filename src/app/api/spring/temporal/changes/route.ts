/**
 * Changed Facts API
 *
 * GET /api/spring/temporal/changes - Get facts that changed within a time range
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
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

    // Required: start_date and end_date
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');

    if (!startDateStr) {
      return ValidationErrors.missingField('start_date');
    }
    if (!endDateStr) {
      return ValidationErrors.missingField('end_date');
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime())) {
      return ValidationErrors.invalidValue('start_date', startDateStr, 'ISO 8601 date string');
    }
    if (isNaN(endDate.getTime())) {
      return ValidationErrors.invalidValue('end_date', endDateStr, 'ISO 8601 date string');
    }

    const supabase = createServerClient();
    const service = createTemporalQueryService(supabase);

    const changes = await service.getChangedFacts(userId, startDate, endDate);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/temporal/changes', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      changes: changes.map((c) => ({
        oldFact: {
          id: c.oldFact.id,
          content: c.oldFact.content,
          type: c.oldFact.type,
          validFrom: c.oldFact.validFrom?.toISOString() ?? null,
          validTo: c.oldFact.validTo?.toISOString() ?? null,
          eventTime: c.oldFact.eventTime?.toISOString() ?? null,
          createdAt: c.oldFact.createdAt.toISOString(),
        },
        newFact: {
          id: c.newFact.id,
          content: c.newFact.content,
          type: c.newFact.type,
          validFrom: c.newFact.validFrom?.toISOString() ?? null,
          validTo: c.newFact.validTo?.toISOString() ?? null,
          eventTime: c.newFact.eventTime?.toISOString() ?? null,
          createdAt: c.newFact.createdAt.toISOString(),
        },
        changedAt: c.changedAt.toISOString(),
      })),
      count: changes.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Changed facts error:', error);
    return ServerErrors.internal('temporal_changes');
  }
}
