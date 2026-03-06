/**
 * Tool Execution API
 *
 * POST /api/v1/tools/execute - Execute a tool with permission + approval checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createToolGatingService } from '@/lib/tool-gating';

const META = { version: 'v1' as const };

async function resolveAuth(
  request: NextRequest
): Promise<{ userId: string; keyId: string | null } | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }
  return { error: authErrorResponse(authResult.authError) };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const body = await request.json();

    const { tokenId, toolId, input, sessionId, conversationId } = body;

    if (!tokenId || !toolId) {
      return NextResponse.json(
        { success: false, error: 'tokenId and toolId are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const service = createToolGatingService(supabase);

    // Get token to verify org membership
    const token = await service.getToken(tokenId);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token not found' },
        { status: 404 }
      );
    }

    const executionResult = await service.executeTool(token.organizationId, {
      tokenId,
      toolId,
      input: input || {},
      sessionId,
      conversationId,
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/tools/execute', method: 'POST', startTime },
        executionResult.success ? 200 : 403
      );
    }

    const status = executionResult.approvalRequired ? 202 : executionResult.success ? 200 : 403;

    return NextResponse.json(
      {
        success: executionResult.success,
        data: executionResult,
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status }
    );
  } catch (error) {
    logServerError('[v1/tools/execute] Error', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
