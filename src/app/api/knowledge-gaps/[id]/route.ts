import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  getKnowledgeGap,
  updateKnowledgeGap,
  getGapActions,
  type GapStatus,
} from '@/lib/knowledge-gap';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/knowledge-gaps/[id]
 * Get a specific knowledge gap
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { id: gapId } = await context.params;

    if (!gapId) {
      return ValidationErrors.missingField('id');
    }

    const gap = await getKnowledgeGap(gapId, userId);

    if (!gap) {
      return NextResponse.json(
        { error: { message: 'Knowledge gap not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Get associated actions
    const includeActions = request.nextUrl.searchParams.get('include_actions') === 'true';
    let actions;
    if (includeActions) {
      actions = await getGapActions(gapId);
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/knowledge-gaps/${gapId}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        gap,
        actions,
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Get knowledge gap error:', err);
    return ServerErrors.internal('get_knowledge_gap');
  }
}

/**
 * PATCH /api/knowledge-gaps/[id]
 * Update a knowledge gap
 *
 * Body:
 * {
 *   "status"?: "open" | "in_progress" | "resolved" | "wont_fix",
 *   "resolution_action"?: string,
 *   "resolution_notes"?: string,
 *   "suggested_sources"?: [...]
 * }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { id: gapId } = await context.params;

    if (!gapId) {
      return ValidationErrors.missingField('id');
    }

    const body = await request.json();

    // Validate status if provided
    if (body.status) {
      const validStatuses: GapStatus[] = ['open', 'in_progress', 'resolved', 'wont_fix'];
      if (!validStatuses.includes(body.status)) {
        return ValidationErrors.invalidField('status', `must be one of: ${validStatuses.join(', ')}`);
      }
    }

    // Check gap exists
    const existingGap = await getKnowledgeGap(gapId, userId);
    if (!existingGap) {
      return NextResponse.json(
        { error: { message: 'Knowledge gap not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Update gap
    const gap = await updateKnowledgeGap(gapId, userId, {
      status: body.status,
      resolutionAction: body.resolution_action,
      resolutionNotes: body.resolution_notes,
      suggestedSources: body.suggested_sources,
    });

    await logRequest(
      { userId, keyId, endpoint: `/api/knowledge-gaps/${gapId}`, method: 'PATCH', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        gap,
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Update knowledge gap error:', err);
    return ServerErrors.internal('update_knowledge_gap');
  }
}

/**
 * DELETE /api/knowledge-gaps/[id]
 * Delete a knowledge gap (marks as wont_fix)
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { id: gapId } = await context.params;

    if (!gapId) {
      return ValidationErrors.missingField('id');
    }

    // Check gap exists
    const existingGap = await getKnowledgeGap(gapId, userId);
    if (!existingGap) {
      return NextResponse.json(
        { error: { message: 'Knowledge gap not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Mark as wont_fix instead of hard delete
    const gap = await updateKnowledgeGap(gapId, userId, {
      status: 'wont_fix',
      resolutionNotes: 'Dismissed by user',
    });

    await logRequest(
      { userId, keyId, endpoint: `/api/knowledge-gaps/${gapId}`, method: 'DELETE', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        gap,
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Delete knowledge gap error:', err);
    return ServerErrors.internal('delete_knowledge_gap');
  }
}
