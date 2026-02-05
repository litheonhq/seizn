/**
 * Memory V3 API - Single Note Route
 *
 * GET    /api/spring/memory/[noteId] - Get single note
 * PATCH  /api/spring/memory/[noteId] - Update note
 * DELETE /api/spring/memory/[noteId] - Delete note (soft or hard)
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
import type { NoteType, NoteScope, PrivacyClass } from '@/lib/spring/memory-v3/types';

interface RouteParams {
  params: Promise<{ noteId: string }>;
}

// =============================================================================
// GET /api/spring/memory/[noteId] - Get Single Note
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Validate noteId
    if (!noteId || typeof noteId !== 'string') {
      return ValidationErrors.missingField('noteId');
    }

    // Get note
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const note = await service.getNote(noteId);

    if (!note) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'GET', startTime },
        404
      );
      return NotFoundErrors.memory(noteId);
    }

    // Verify ownership
    if (note.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'GET', startTime },
        403
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this note',
          },
        },
        { status: 403 }
      );
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'GET', startTime },
      200
    );

    // Parse query params for include options
    const { searchParams } = new URL(request.url);
    const includeEmbedding = searchParams.get('include_embedding') === 'true';

    // Remove embedding if not requested
    const responseNote = includeEmbedding ? note : { ...note, embedding: undefined };

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        note: responseNote,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 GET note error:', error);
    return ServerErrors.internal('get_note');
  }
}

// =============================================================================
// PATCH /api/spring/memory/[noteId] - Update Note
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Validate noteId
    if (!noteId || typeof noteId !== 'string') {
      return ValidationErrors.missingField('noteId');
    }

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Get existing note to verify ownership
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const existingNote = await service.getNote(noteId);

    if (!existingNote) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'PATCH', startTime },
        404
      );
      return NotFoundErrors.memory(noteId);
    }

    // Verify ownership
    if (existingNote.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'PATCH', startTime },
        403
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this note',
          },
        },
        { status: 403 }
      );
    }

    // Build update input
    const updates: Record<string, unknown> = {};

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        return ValidationErrors.invalidField('content', 'must be a non-empty string');
      }
      updates.content = body.content;
    }

    if (body.type !== undefined) {
      const validTypes: NoteType[] = ['fact', 'preference', 'instruction', 'episode', 'procedure', 'relationship'];
      if (!validTypes.includes(body.type as NoteType)) {
        return ValidationErrors.invalidValue('type', body.type, validTypes.join(', '));
      }
      updates.type = body.type;
    }

    if (body.scope !== undefined) {
      const validScopes: NoteScope[] = ['user', 'workspace', 'org', 'session', 'agent'];
      if (!validScopes.includes(body.scope as NoteScope)) {
        return ValidationErrors.invalidValue('scope', body.scope, validScopes.join(', '));
      }
      updates.scope = body.scope;
    }

    if (body.privacy_class !== undefined || body.privacyClass !== undefined) {
      const privacyClass = (body.privacy_class || body.privacyClass) as PrivacyClass;
      const validPrivacyClasses: PrivacyClass[] = ['public', 'internal', 'confidential', 'restricted'];
      if (!validPrivacyClasses.includes(privacyClass)) {
        return ValidationErrors.invalidValue('privacy_class', privacyClass, validPrivacyClasses.join(', '));
      }
      updates.privacyClass = privacyClass;
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) {
        return ValidationErrors.invalidField('tags', 'must be an array');
      }
      updates.tags = body.tags;
    }

    if (body.metadata !== undefined) {
      if (typeof body.metadata !== 'object') {
        return ValidationErrors.invalidField('metadata', 'must be an object');
      }
      updates.metadata = body.metadata;
    }

    if (body.embedding !== undefined) {
      if (!Array.isArray(body.embedding)) {
        return ValidationErrors.invalidField('embedding', 'must be an array');
      }
      updates.embedding = body.embedding;
    }

    if (body.embedding_model !== undefined) {
      updates.embeddingModel = body.embedding_model;
    }

    if (body.workspace_id !== undefined) {
      updates.workspaceId = body.workspace_id;
    }

    if (body.session_id !== undefined) {
      updates.sessionId = body.session_id;
    }

    if (body.agent_id !== undefined) {
      updates.agentId = body.agent_id;
    }

    if (body.expires_at !== undefined) {
      updates.expiresAt = body.expires_at ? new Date(body.expires_at as string) : null;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return ValidationErrors.invalidBody('No valid fields to update');
    }

    // Update note
    const updatedNote = await service.updateNote(noteId, updates);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'PATCH', startTime },
      200,
      { embedding: updates.content ? (updates.content as string).length : 0 }
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        note: updatedNote,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 PATCH note error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return NotFoundErrors.memory(noteId);
    }
    return ServerErrors.internal('update_note');
  }
}

// =============================================================================
// DELETE /api/spring/memory/[noteId] - Delete Note
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Validate noteId
    if (!noteId || typeof noteId !== 'string') {
      return ValidationErrors.missingField('noteId');
    }

    // Get existing note to verify ownership
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const existingNote = await service.getNote(noteId);

    if (!existingNote) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'DELETE', startTime },
        404
      );
      return NotFoundErrors.memory(noteId);
    }

    // Verify ownership
    if (existingNote.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'DELETE', startTime },
        403
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this note',
          },
        },
        { status: 403 }
      );
    }

    // Check if hard delete
    const { searchParams } = new URL(request.url);
    const hard = searchParams.get('hard') === 'true';

    // Delete note
    await service.deleteNote(noteId, !hard); // soft=true by default, unless hard=true

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}`, method: 'DELETE', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        deleted: true,
        hard,
        noteId,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 DELETE note error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return NotFoundErrors.memory(noteId);
    }
    return ServerErrors.internal('delete_note');
  }
}
