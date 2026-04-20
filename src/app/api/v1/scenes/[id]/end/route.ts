import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { endScene } from '@/lib/memory/scenes';
import { createServerClient } from '@/lib/supabase';

const META = { version: 'v1' as const };

interface RouteParams {
  params: Promise<{ id: string }>;
}

function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const { id } = await params;
    const sceneId = decodeURIComponent(id || '').trim();
    if (!sceneId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'invalid_field', message: 'scene id is required' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 400 }
      );
    }

    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const scene = await endScene(createServerClient(), {
      userId,
      sceneId,
      summary: typeof body.summary === 'string' ? body.summary : undefined,
      outcomes: typeof body.outcomes === 'object' && body.outcomes !== null ? body.outcomes as Record<string, unknown> : undefined,
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/scenes/[id]/end', method: 'POST', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { scene },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/scenes/:id/end] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to end scene';
    return NextResponse.json(
      { success: false, error: { code: 'internal_error', message }, meta: META },
      { status: 500 }
    );
  }
}
