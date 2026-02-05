/**
 * Memory V3 API - Explain Route
 *
 * GET /api/spring/memory/[noteId]/explain - Get explanation for why note was stored/recalled
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

interface RouteParams {
  params: Promise<{ noteId: string }>;
}

// =============================================================================
// GET /api/spring/memory/[noteId]/explain - Get Explanation
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

    // Get note first to verify ownership
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const note = await service.getNote(noteId);

    if (!note) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}/explain`, method: 'GET', startTime },
        404
      );
      return NotFoundErrors.memory(noteId);
    }

    // Verify ownership
    if (note.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}/explain`, method: 'GET', startTime },
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'stored'; // 'stored' or 'recalled'
    const query = searchParams.get('query'); // Required for 'recalled' type

    let explanation;

    if (type === 'recalled') {
      if (!query) {
        return ValidationErrors.missingField('query (required for type=recalled)');
      }
      explanation = await service.explainRecalled(noteId, query);
    } else {
      explanation = await service.explainStored(noteId);
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}/explain`, method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        type,
        explanation,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 explain error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return NotFoundErrors.memory(noteId);
    }
    return ServerErrors.internal('explain_note');
  }
}
