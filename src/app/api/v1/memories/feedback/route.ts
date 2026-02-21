import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { ServerErrors } from '@/lib/api-error';
import { verifyCsrfToken } from '@/lib/csrf';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import {
  type MemoryFeedbackEventType,
  recordFeedbackAndLearn,
} from '@/lib/memory/personalization';

const VALID_EVENT_TYPES = new Set<MemoryFeedbackEventType>([
  'thumbs_up',
  'thumbs_down',
  'click',
  'open',
  'reuse',
]);
const NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const MAX_METADATA_BYTES = 4096;
const MAX_QUERY_LENGTH = 1000;

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

function getFeedbackRateLimitHeaders(remaining: number, limit: number, resetAt: number): Record<string, string> {
  return {
    'X-Feedback-RateLimit-Limit': String(limit),
    'X-Feedback-RateLimit-Remaining': String(remaining),
    'X-Feedback-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authState = await resolveAuth(request);
    if ('error' in authState) return authState.error;

    const { userId, keyId, rateLimitHeaders } = authState;
    const csrfError = verifyCsrfToken(request);
    if (csrfError) return csrfError;

    const feedbackRate = await checkRateLimitAsync(`memory_feedback:${userId}`, 'free');
    const feedbackRateHeaders = getFeedbackRateLimitHeaders(
      feedbackRate.remaining,
      feedbackRate.limit,
      feedbackRate.resetAt
    );
    if (!feedbackRate.allowed) {
      return withHeaders(
        NextResponse.json({ error: 'Too many feedback requests. Please retry shortly.' }, { status: 429 }),
        { ...(rateLimitHeaders || {}), ...feedbackRateHeaders }
      );
    }
    const body = await request.json();

    const memoryId = String(body.memory_id || '').trim();
    const eventType = String(body.event_type || '').trim() as MemoryFeedbackEventType;
    const requestedNamespace = typeof body.namespace === 'string' ? body.namespace.trim() : '';

    if (!memoryId) {
      return NextResponse.json({ error: 'memory_id is required' }, { status: 400 });
    }
    if (!VALID_EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        { error: 'Invalid event_type. Use thumbs_up, thumbs_down, click, open, or reuse' },
        { status: 400 }
      );
    }
    if (requestedNamespace && !NAMESPACE_PATTERN.test(requestedNamespace)) {
      return NextResponse.json(
        { error: 'Invalid namespace format' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data: memory, error: memoryError } = await supabase
      .from('memories')
      .select('id, namespace, memory_type, tags')
      .eq('id', memoryId)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (memoryError) {
      console.error('[v1/memories/feedback] Memory lookup error:', memoryError);
      return ServerErrors.database('memory_lookup');
    }
    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    const namespace = String(memory.namespace || 'default');
    if (requestedNamespace && requestedNamespace !== namespace) {
      return NextResponse.json(
        { error: 'namespace must match memory namespace' },
        { status: 400 }
      );
    }

    const query = body.query ? String(body.query).slice(0, MAX_QUERY_LENGTH) : null;
    const metadataValue =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const metadataJson = JSON.stringify(metadataValue);
    if (Buffer.byteLength(metadataJson, 'utf8') > MAX_METADATA_BYTES) {
      return NextResponse.json(
        { error: 'metadata is too large' },
        { status: 400 }
      );
    }

    const result = await recordFeedbackAndLearn(supabase, {
      userId,
      namespace,
      memoryId,
      eventType,
      query,
      memoryType: memory.memory_type,
      tags: Array.isArray(memory.tags) ? memory.tags : [],
      metadata: metadataValue,
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories/feedback', method: 'POST', startTime },
        200
      );
    }

    const response = NextResponse.json({
      success: true,
      feedback: {
        memory_id: memoryId,
        event_type: eventType,
        applied: result.applied,
        reason: result.reason || null,
      },
      profile: result.profile
        ? {
            personalization_enabled: result.profile.personalizationEnabled,
            total_feedback_count: result.profile.totalFeedbackCount,
            positive_feedback_count: result.profile.positiveFeedbackCount,
            negative_feedback_count: result.profile.negativeFeedbackCount,
            updated_at: result.profile.updatedAt,
          }
        : null,
    });

    return withHeaders(response, { ...(rateLimitHeaders || {}), ...feedbackRateHeaders });
  } catch (error) {
    console.error('[v1/memories/feedback] POST error:', error);
    return ServerErrors.internal('record_memory_feedback');
  }
}
