/**
 * Memory V3 API - Candidates List Route
 *
 * GET /api/spring/memory/candidates - List pending candidates
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
import { createMemoryV3Service } from '@/lib/spring/memory-v3/service';

// =============================================================================
// GET /api/spring/memory/candidates - List Pending Candidates
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get pending candidates
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const candidates = await service.listPendingCandidates(userId);

    // Apply pagination manually (since service returns all)
    const paginatedCandidates = candidates.slice(offset, offset + limit);
    const total = candidates.length;

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/memory/candidates', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        candidates: paginatedCandidates.map((c) => ({
          id: c.note.id,
          note: {
            id: c.note.id,
            content: c.note.content,
            type: c.note.type,
            status: c.note.status,
            scope: c.note.scope,
            privacyClass: c.note.privacyClass,
            tags: c.note.tags,
            createdAt: c.note.createdAt.toISOString(),
          },
          candidateReason: c.candidateReason,
          extractionConfidence: c.extractionConfidence,
          similarNotes: c.similarNotes?.map((s) => ({
            noteId: s.note.id,
            content: s.note.content,
            similarity: s.similarity,
          })),
          suggestedActions: c.suggestedActions,
          createdAt: c.createdAt.toISOString(),
          autoActionAt: c.autoActionAt?.toISOString(),
          autoAction: c.autoAction,
        })),
        total,
        hasMore: total > offset + limit,
        limit,
        offset,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 list candidates error:', error);
    return ServerErrors.internal('list_candidates');
  }
}
