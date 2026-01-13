import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  getKnowledgeGap,
  createGapFillingAction,
  getGapActions,
  executeAction,
  type ActionType,
} from '@/lib/knowledge-gap';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/knowledge-gaps/[id]/actions
 * List actions for a knowledge gap
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

    // Verify gap ownership
    const gap = await getKnowledgeGap(gapId, userId);
    if (!gap) {
      return NextResponse.json(
        { error: { message: 'Knowledge gap not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const actions = await getGapActions(gapId);

    await logRequest(
      { userId, keyId, endpoint: `/api/knowledge-gaps/${gapId}/actions`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        actions,
        total: actions.length,
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('List gap actions error:', err);
    return ServerErrors.internal('list_gap_actions');
  }
}

/**
 * POST /api/knowledge-gaps/[id]/actions
 * Create and optionally execute an action
 *
 * Body:
 * {
 *   "action_type": "ingest_url" | "ingest_file" | "connect_source" | "request_access" | "ignore",
 *   "action_params": { ... },
 *   "execute"?: boolean  // Whether to execute immediately (default: false)
 * }
 */
export async function POST(
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

    // Validate action_type
    if (!body.action_type) {
      return ValidationErrors.missingField('action_type');
    }

    const validActionTypes: ActionType[] = [
      'ingest_url',
      'ingest_file',
      'connect_source',
      'request_access',
      'ignore',
    ];

    if (!validActionTypes.includes(body.action_type)) {
      return ValidationErrors.invalidField('action_type', `must be one of: ${validActionTypes.join(', ')}`);
    }

    // Validate action_params
    if (!body.action_params || typeof body.action_params !== 'object') {
      return ValidationErrors.missingField('action_params');
    }

    // Verify gap ownership
    const gap = await getKnowledgeGap(gapId, userId);
    if (!gap) {
      return NextResponse.json(
        { error: { message: 'Knowledge gap not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Validate action params based on type
    const validationError = validateActionParams(body.action_type, body.action_params);
    if (validationError) {
      return validationError;
    }

    // Create the action
    const action = await createGapFillingAction({
      gapId,
      actionType: body.action_type,
      actionParams: {
        type: body.action_type,
        ...body.action_params,
      },
      initiatedBy: userId,
    });

    // Optionally execute the action
    let result;
    if (body.execute === true) {
      try {
        result = await executeAction(action.id, userId);
      } catch (execErr) {
        // Action was created but execution failed
        console.error('Action execution failed:', execErr);
        // Continue with response, action will show as failed
      }
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/knowledge-gaps/${gapId}/actions`, method: 'POST', startTime },
      201
    );

    // Refresh action to get updated status
    const actions = await getGapActions(gapId);
    const updatedAction = actions.find((a) => a.id === action.id) || action;

    const response = NextResponse.json(
      {
        success: true,
        action: updatedAction,
        executed: body.execute === true,
        result,
      },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Create gap action error:', err);
    return ServerErrors.internal('create_gap_action');
  }
}

/**
 * Validate action params based on action type
 */
function validateActionParams(
  actionType: ActionType,
  params: Record<string, unknown>
): NextResponse | null {
  switch (actionType) {
    case 'ingest_url':
      if (!params.url || typeof params.url !== 'string') {
        return ValidationErrors.missingField('action_params.url');
      }
      try {
        new URL(params.url);
      } catch {
        return ValidationErrors.invalidField('action_params.url', 'must be a valid URL');
      }
      break;

    case 'ingest_file':
      if (!params.file_name && !params.fileName) {
        return ValidationErrors.missingField('action_params.file_name');
      }
      break;

    case 'connect_source':
      if (!params.name || typeof params.name !== 'string') {
        return ValidationErrors.missingField('action_params.name');
      }
      if (!params.source_type && !params.sourceType) {
        return ValidationErrors.missingField('action_params.source_type');
      }
      break;

    case 'request_access':
      if (!params.document_ids && !params.documentIds) {
        return ValidationErrors.missingField('action_params.document_ids');
      }
      const docIds = params.document_ids || params.documentIds;
      if (!Array.isArray(docIds) || docIds.length === 0) {
        return ValidationErrors.invalidField('action_params.document_ids', 'must be a non-empty array');
      }
      break;

    case 'ignore':
      if (!params.reason || typeof params.reason !== 'string') {
        return ValidationErrors.missingField('action_params.reason');
      }
      break;
  }

  return null;
}
