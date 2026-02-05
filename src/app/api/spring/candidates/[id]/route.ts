/**
 * Memory Candidate API - Individual
 *
 * GET /api/spring/candidates/[id] - Get single candidate
 * POST /api/spring/candidates/[id] - Review action (accept/reject)
 * DELETE /api/spring/candidates/[id] - Delete candidate
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createCandidateService } from '@/lib/spring/memory-v4';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET - Get Single Candidate
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createCandidateService(supabase);
    const candidate = await service.getCandidate(id);

    if (!candidate) {
      return NotFoundErrors.resource('Candidate', id);
    }

    // Verify ownership
    if (candidate.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/candidates/${id}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      candidate: {
        id: candidate.id,
        content: candidate.content,
        noteType: candidate.noteType,
        tags: candidate.tags,
        categories: candidate.categories,
        confidence: candidate.confidence,
        action: candidate.action,
        namespace: candidate.namespace,
        scope: candidate.scope,
        metadata: candidate.metadata,
        provenance: candidate.provenance,
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        createdAt: candidate.createdAt.toISOString(),
        expiresAt: candidate.expiresAt?.toISOString(),
        reviewedAt: candidate.reviewedAt?.toISOString(),
        reviewerUserId: candidate.reviewerUserId,
        decisionReason: candidate.decisionReason,
        acceptedNoteId: candidate.acceptedNoteId,
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get candidate error:', error);
    return ServerErrors.internal('get_candidate');
  }
}

// =============================================================================
// POST - Review Action (Accept/Reject)
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate action
    const action = body.action as string;
    if (!action) {
      return ValidationErrors.missingField('action');
    }

    const validActions = ['accept', 'reject'];
    if (!validActions.includes(action)) {
      return ValidationErrors.invalidValue('action', action, validActions.join(', '));
    }

    const supabase = createServerClient();
    const service = createCandidateService(supabase);

    // Verify candidate exists and belongs to user
    const candidate = await service.getCandidate(id);
    if (!candidate) {
      return NotFoundErrors.resource('Candidate', id);
    }

    if (candidate.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    if (candidate.action !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_PROCESSED',
            message: `Candidate already ${candidate.action}`,
          },
        },
        { status: 400 }
      );
    }

    const reason = body.reason as string | undefined;
    let result;

    if (action === 'accept') {
      // Check for modifications
      const modifications = body.modifications as Record<string, unknown> | undefined;

      if (modifications) {
        result = await service.acceptWithModifications(id, userId, {
          content: modifications.content as string | undefined,
          tags: modifications.tags as string[] | undefined,
          categories: modifications.categories as string[] | undefined,
          noteType: modifications.noteType as string | undefined,
        }, reason);
      } else {
        result = await service.acceptCandidate(id, userId, reason);
      }
    } else {
      result = await service.rejectCandidate(id, userId, reason);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'REVIEW_FAILED', message: result.error } },
        { status: 400 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/candidates/${id}`, method: 'POST', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      action: result.action,
      noteId: result.noteId,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Review candidate error:', error);
    return ServerErrors.internal('review_candidate');
  }
}

// =============================================================================
// DELETE - Delete Candidate
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createCandidateService(supabase);

    // Verify ownership
    const candidate = await service.getCandidate(id);
    if (!candidate) {
      return NotFoundErrors.resource('Candidate', id);
    }

    if (candidate.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    // Delete directly
    const { error } = await supabase
      .from('spring_memory_candidates')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/candidates/${id}`, method: 'DELETE', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      deleted: true,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Delete candidate error:', error);
    return ServerErrors.internal('delete_candidate');
  }
}
