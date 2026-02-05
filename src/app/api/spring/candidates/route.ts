/**
 * Memory Candidates API
 *
 * GET /api/spring/candidates - List candidates
 * POST /api/spring/candidates - Create a candidate (for testing)
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
import { createCandidateService } from '@/lib/spring/memory-v4';

// =============================================================================
// GET - List Candidates
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') as 'pending' | 'accepted' | 'rejected' | null;
    const namespace = searchParams.get('namespace');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createServerClient();
    const service = createCandidateService(supabase);

    const candidates = await service.listCandidates(userId, {
      action: action || undefined,
      namespace: namespace || undefined,
      limit,
      offset,
    });

    const pendingCount = await service.getPendingCount(userId);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/candidates', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      candidates: candidates.map((c) => ({
        id: c.id,
        content: c.content,
        noteType: c.noteType,
        tags: c.tags,
        categories: c.categories,
        confidence: c.confidence,
        action: c.action,
        namespace: c.namespace,
        sourceType: c.sourceType,
        createdAt: c.createdAt.toISOString(),
        reviewedAt: c.reviewedAt?.toISOString(),
        decisionReason: c.decisionReason,
      })),
      pendingCount,
      total: candidates.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('List candidates error:', error);
    return ServerErrors.internal('list_candidates');
  }
}
