import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { listScenes, startScene } from '@/lib/memory/scenes';

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

async function resolveOrganizationId(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  keyId: string | null
): Promise<string | null> {
  if (keyId) {
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('id', keyId)
      .maybeSingle();
    if (keyRow?.organization_id) return String(keyRow.organization_id);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.organization_id) return String(profile.organization_id);

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return member?.organization_id ? String(member.organization_id) : null;
}

function parseEntityIds(body: Record<string, unknown>): string[] {
  const raw = body.entity_ids || body.entities;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => String(value).trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace') || 'default';
    const activeOnly = searchParams.get('active') !== 'false';
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));
    const supabase = createServerClient();
    const scenes = await listScenes(supabase, { userId, namespace, activeOnly, limit });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/scenes', method: 'GET', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { scenes, count: scenes.length },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/scenes] GET error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'internal_error', message: 'Failed to list scenes' }, meta: META },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const entityIds = parseEntityIds(body);
    if (entityIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'invalid_field', message: 'entity_ids must include at least one entity' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const scene = await startScene(supabase, {
      userId,
      organizationId: await resolveOrganizationId(supabase, userId, keyId),
      namespace: typeof body.namespace === 'string' ? body.namespace : 'default',
      entityIds,
      summary: typeof body.summary === 'string' ? body.summary : null,
      metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/scenes', method: 'POST', startTime },
        201
      );
    }

    return withHeaders(
      NextResponse.json(
        {
          success: true,
          data: { scene },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 201 }
      ),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/scenes] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start scene';
    return NextResponse.json(
      { success: false, error: { code: 'internal_error', message }, meta: META },
      { status: 500 }
    );
  }
}
