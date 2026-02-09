/**
 * Tool Permission Check API
 *
 * POST /api/v1/tools/permissions - Pre-flight permission check without execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
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

    const { tokenId, toolId, input } = body;

    if (!tokenId || !toolId) {
      return NextResponse.json(
        { success: false, error: 'tokenId and toolId are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const service = createToolGatingService(supabase);

    const permission = await service.checkPermission(tokenId, toolId, input);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/tools/permissions', method: 'POST', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      data: permission,
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/tools/permissions] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
