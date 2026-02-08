/**
 * Temporal Search API
 *
 * GET /api/spring/temporal/search - Search memories valid at a specific point in time
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

    // Required: valid_at
    const validAtStr = searchParams.get('valid_at');
    if (!validAtStr) {
      return ValidationErrors.missingField('valid_at');
    }

    const validAt = new Date(validAtStr);
    if (isNaN(validAt.getTime())) {
      return ValidationErrors.invalidValue('valid_at', validAtStr, 'ISO 8601 date string');
    }

    // Optional params
    const query = searchParams.get('query') || undefined;
    const topK = parseInt(searchParams.get('top_k') || '20', 10);
    const minSimilarity = parseFloat(searchParams.get('min_similarity') || '0.5');
    const excludeExpired = searchParams.get('exclude_expired') !== 'false';
    const includeSuperseded = searchParams.get('include_superseded') === 'true';
    const typesStr = searchParams.get('types');
    const types = typesStr ? typesStr.split(',') : undefined;

    const supabase = createServerClient();
    const service = createTemporalQueryService(supabase);

    const results = await service.searchValidAt(userId, validAt, {
      query,
      topK,
      minSimilarity,
      types,
    });

    // Apply additional filters that searchValidAt wraps
    // excludeExpired and includeSuperseded are handled via temporal filter in the service

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/temporal/search', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      results: results.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        similarity: r.similarity ?? null,
        validFrom: r.validFrom?.toISOString() ?? null,
        validTo: r.validTo?.toISOString() ?? null,
        eventTime: r.eventTime?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadata,
      })),
      count: results.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Temporal search error:', error);
    return ServerErrors.internal('temporal_search');
  }
}
