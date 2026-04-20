import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { propagateGossip, type DistortionModel, type DistortionConfig } from '@/lib/memory/gossip';
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

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fact = asString(body.fact);
    const fromEntityId = asString(body.from_entity_id) || asString(body.fromEntityId);
    const toEntityId = asString(body.to_entity_id) || asString(body.toEntityId);
    if (!fact || !fromEntityId || !toEntityId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'invalid_field', message: 'fact, from_entity_id, and to_entity_id are required' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const event = await propagateGossip(supabase, {
      userId,
      organizationId: await resolveOrganizationId(supabase, userId, keyId),
      namespace: asString(body.namespace) || 'default',
      fact,
      fromEntityId,
      toEntityId,
      channel: asString(body.channel) || 'dialogue',
      sourceBeliefId: asString(body.source_belief_id) || asString(body.sourceBeliefId),
      distortionModel: asString(body.distortion_model) as DistortionModel | null || undefined,
      distortionConfig: typeof body.distortion_config === 'object' && body.distortion_config !== null
        ? body.distortion_config as DistortionConfig
        : undefined,
      confidence: Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : undefined,
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/gossip/propagate', method: 'POST', startTime },
        201
      );
    }

    return withHeaders(
      NextResponse.json(
        {
          success: true,
          data: { event },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 201 }
      ),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/gossip/propagate] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to propagate gossip';
    return NextResponse.json(
      { success: false, error: { code: 'internal_error', message }, meta: META },
      { status: 500 }
    );
  }
}
