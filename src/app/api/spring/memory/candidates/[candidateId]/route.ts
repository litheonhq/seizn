/**
 * Memory V3 API - Candidate Action Route
 *
 * POST /api/spring/memory/candidates/[candidateId] - Process candidate action (approve/reject/edit)
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
import { createMemoryV3Service } from '@/lib/spring/memory-v3/service';
import type { NoteType } from '@/lib/spring/memory-v3/types';

interface RouteParams {
  params: Promise<{ candidateId: string }>;
}

// =============================================================================
// POST /api/spring/memory/candidates/[candidateId] - Process Candidate Action
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { candidateId } = await params;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Validate candidateId
    if (!candidateId || typeof candidateId !== 'string') {
      return ValidationErrors.missingField('candidateId');
    }

    // Parse request body
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

    const validActions = ['approve', 'reject', 'edit'];
    if (!validActions.includes(action)) {
      return ValidationErrors.invalidValue('action', action, validActions.join(', '));
    }

    // Get note first to verify ownership
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const note = await service.getNote(candidateId);

    if (!note) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/candidates/${candidateId}`, method: 'POST', startTime },
        404
      );
      return NotFoundErrors.resource('Candidate', candidateId);
    }

    // Verify ownership
    if (note.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/candidates/${candidateId}`, method: 'POST', startTime },
        403
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this candidate',
          },
        },
        { status: 403 }
      );
    }

    // Verify it's actually a candidate
    if (note.status !== 'candidate') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Note is not a candidate',
          },
        },
        { status: 400 }
      );
    }

    let result;
    const reason = body.reason as string | undefined;

    if (action === 'approve') {
      // Approve the candidate
      result = await service.approveCandidate(candidateId);

      // Log request
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/candidates/${candidateId}`, method: 'POST', startTime },
        200
      );

      // Build response
      const response = NextResponse.json(
        {
          success: true,
          action: 'approved',
          note: result,
        },
        { status: 200 }
      );

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    if (action === 'reject') {
      // Validate reason for rejection
      if (!reason) {
        return ValidationErrors.missingField('reason (required for reject)');
      }

      // Reject the candidate
      await service.rejectCandidate(candidateId, reason);

      // Log request
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/candidates/${candidateId}`, method: 'POST', startTime },
        200
      );

      // Build response
      const response = NextResponse.json(
        {
          success: true,
          action: 'rejected',
          candidateId,
          reason,
        },
        { status: 200 }
      );

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    if (action === 'edit') {
      // Validate edits
      const edits = body.edits as Record<string, unknown> | undefined;
      if (!edits || Object.keys(edits).length === 0) {
        return ValidationErrors.missingField('edits (required for edit action)');
      }

      // Build edits object
      const editInput: Record<string, unknown> = {};

      if (edits.content !== undefined) {
        if (typeof edits.content !== 'string' || edits.content.trim().length === 0) {
          return ValidationErrors.invalidField('edits.content', 'must be a non-empty string');
        }
        editInput.content = edits.content;
      }

      if (edits.type !== undefined) {
        const validTypes: NoteType[] = ['fact', 'preference', 'instruction', 'episode', 'procedure', 'relationship'];
        if (!validTypes.includes(edits.type as NoteType)) {
          return ValidationErrors.invalidValue('edits.type', edits.type, validTypes.join(', '));
        }
        editInput.type = edits.type;
      }

      if (edits.tags !== undefined) {
        if (!Array.isArray(edits.tags)) {
          return ValidationErrors.invalidField('edits.tags', 'must be an array');
        }
        editInput.tags = edits.tags;
      }

      if (edits.metadata !== undefined) {
        if (typeof edits.metadata !== 'object') {
          return ValidationErrors.invalidField('edits.metadata', 'must be an object');
        }
        editInput.metadata = edits.metadata;
      }

      // Edit the candidate
      result = await service.editCandidate(candidateId, editInput);

      // Log request
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/candidates/${candidateId}`, method: 'POST', startTime },
        200,
        { embedding: editInput.content ? (editInput.content as string).length : 0 }
      );

      // Build response
      const response = NextResponse.json(
        {
          success: true,
          action: 'edited',
          candidate: {
            id: result.note.id,
            note: {
              id: result.note.id,
              content: result.note.content,
              type: result.note.type,
              status: result.note.status,
              scope: result.note.scope,
              privacyClass: result.note.privacyClass,
              tags: result.note.tags,
              createdAt: result.note.createdAt.toISOString(),
            },
            candidateReason: result.candidateReason,
            extractionConfidence: result.extractionConfidence,
            similarNotes: result.similarNotes?.map((s) => ({
              noteId: s.note.id,
              content: s.note.content,
              similarity: s.similarity,
            })),
            suggestedActions: result.suggestedActions,
            createdAt: result.createdAt.toISOString(),
            autoActionAt: result.autoActionAt?.toISOString(),
            autoAction: result.autoAction,
          },
        },
        { status: 200 }
      );

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    // Should never reach here
    return ServerErrors.internal('process_candidate');
  } catch (error) {
    console.error('Memory V3 candidate action error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found') || message.includes('Candidate not found')) {
      return NotFoundErrors.resource('Candidate', candidateId);
    }
    if (message.includes('not a candidate')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Note is not a candidate',
          },
        },
        { status: 400 }
      );
    }
    return ServerErrors.internal('process_candidate');
  }
}
