import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { listGossipEvents } from '@/lib/memory/gossip';
import { createServerClient } from '@/lib/supabase';

const META = { version: 'v1' as const };

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

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace') || 'default';
    const entityId = searchParams.get('entity_id');
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));
    const events = await listGossipEvents(createServerClient(), { userId, namespace, entityId, limit });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/gossip', method: 'GET', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { events, count: events.length },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/gossip] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list gossip events';
    return NextResponse.json(
      { success: false, error: { code: 'internal_error', message }, meta: META },
      { status: 500 }
    );
  }
}
