import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import {
  getLearningDiagnostics,
  resetLearningProfile,
  updateLearningPreferences,
} from '@/lib/memory/personalization';

const NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function validateNamespace(namespace: string): NextResponse | null {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    return ValidationErrors.invalidField(
      'namespace',
      'Must start with alphanumeric, contain only alphanumeric/hyphens/underscores, and be 1-64 characters'
    );
  }
  return null;
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
  | {
      userId: string;
      keyId: string | null;
      authMode: 'api_key' | 'session';
      rateLimitHeaders?: Record<string, string>;
    }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      authMode: 'api_key',
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null, authMode: 'session' };
  }

  return { error: authErrorResponse(authResult.authError) };
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host) return false;
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const expectedOrigin = `${proto}://${host}`;

  if (origin) return origin === expectedOrigin;
  if (referer) return referer.startsWith(`${expectedOrigin}/`) || referer === expectedOrigin;
  return false;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authState = await resolveAuth(request);
    if ('error' in authState) return authState.error;

    const { userId, keyId, rateLimitHeaders } = authState;
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace') || 'default';
    const namespaceError = validateNamespace(namespace);
    if (namespaceError) return namespaceError;
    const format = searchParams.get('format') || 'json';
    const supabase = createServerClient();

    const diagnostics = await getLearningDiagnostics(supabase, userId, namespace);

    if (keyId) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/v1/memories/personalization',
          method: 'GET',
          startTime,
        },
        200
      );
    }

    if (format === 'export') {
      return withHeaders(
        NextResponse.json({
          success: true,
          namespace,
          exported_at: new Date().toISOString(),
          available: diagnostics.available,
          reason: diagnostics.reason || null,
          profile: diagnostics.profile,
          recent_events: diagnostics.recentEvents,
          top_tags: diagnostics.topTags,
        }),
        rateLimitHeaders
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        available: diagnostics.available,
        reason: diagnostics.reason || null,
        namespace,
        profile: {
          personalization_enabled: diagnostics.profile.personalizationEnabled,
          recency_weight: diagnostics.profile.recencyWeight,
          importance_weight: diagnostics.profile.importanceWeight,
          similarity_weight: diagnostics.profile.similarityWeight,
          total_feedback_count: diagnostics.profile.totalFeedbackCount,
          positive_feedback_count: diagnostics.profile.positiveFeedbackCount,
          negative_feedback_count: diagnostics.profile.negativeFeedbackCount,
          last_feedback_at: diagnostics.profile.lastFeedbackAt,
          updated_at: diagnostics.profile.updatedAt,
        },
        top_tags: diagnostics.topTags,
      }),
      rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories/personalization] GET error:', error);
    return ServerErrors.internal('get_memory_personalization');
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authState = await resolveAuth(request);
    if ('error' in authState) return authState.error;

    const { userId, keyId, authMode, rateLimitHeaders } = authState;
    if (authMode === 'session' && !isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'Cross-origin session request is not allowed' },
        { status: 403 }
      );
    }
    const body = await request.json();
    const namespace = String(body.namespace || 'default');
    const namespaceError = validateNamespace(namespace);
    if (namespaceError) return namespaceError;

    const patch = {
      personalizationEnabled:
        typeof body.personalization_enabled === 'boolean' ? body.personalization_enabled : undefined,
      recencyWeight: typeof body.recency_weight === 'number' ? body.recency_weight : undefined,
      importanceWeight: typeof body.importance_weight === 'number' ? body.importance_weight : undefined,
      similarityWeight: typeof body.similarity_weight === 'number' ? body.similarity_weight : undefined,
    };

    if (
      patch.personalizationEnabled === undefined &&
      patch.recencyWeight === undefined &&
      patch.importanceWeight === undefined &&
      patch.similarityWeight === undefined
    ) {
      return NextResponse.json(
        { error: 'No valid personalization fields provided' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const result = await updateLearningPreferences(supabase, userId, namespace, patch);

    if (keyId) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/v1/memories/personalization',
          method: 'POST',
          startTime,
        },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        available: result.available,
        reason: result.reason || null,
        namespace,
        profile: {
          personalization_enabled: result.profile.personalizationEnabled,
          recency_weight: result.profile.recencyWeight,
          importance_weight: result.profile.importanceWeight,
          similarity_weight: result.profile.similarityWeight,
          total_feedback_count: result.profile.totalFeedbackCount,
          updated_at: result.profile.updatedAt,
        },
      }),
      rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories/personalization] POST error:', error);
    return ServerErrors.internal('update_memory_personalization');
  }
}

export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authState = await resolveAuth(request);
    if ('error' in authState) return authState.error;

    const { userId, keyId, authMode, rateLimitHeaders } = authState;
    if (authMode === 'session' && !isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'Cross-origin session request is not allowed' },
        { status: 403 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const namespace = String(body.namespace || 'default');
    const namespaceError = validateNamespace(namespace);
    if (namespaceError) return namespaceError;
    const deleteFeedbackHistory = body.delete_feedback_history === true;
    const supabase = createServerClient();

    const result = await resetLearningProfile(
      supabase,
      userId,
      namespace,
      deleteFeedbackHistory
    );

    if (keyId) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/v1/memories/personalization',
          method: 'DELETE',
          startTime,
        },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        available: result.available,
        reason: result.reason || null,
        namespace,
        reset: true,
        deleted_feedback_history: deleteFeedbackHistory,
        profile: {
          personalization_enabled: result.profile.personalizationEnabled,
          total_feedback_count: result.profile.totalFeedbackCount,
          updated_at: result.profile.updatedAt,
        },
      }),
      rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories/personalization] DELETE error:', error);
    return ServerErrors.internal('reset_memory_personalization');
  }
}
