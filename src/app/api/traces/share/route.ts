import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createShareLink, getTraceShareLinks } from '@/lib/share-token';
import type { ExpiresIn, RedactionProfile } from '@/lib/share-token';
import type { TraceSnapshot } from '@/lib/sharing/types';

/**
 * POST /api/traces/share - Create a shareable link for a trace
 * Body: {
 *   trace_id: string,
 *   expires_in?: '1h' | '24h' | '7d' | 'never',
 *   redaction?: { pii?: boolean, secrets?: boolean, raw_content?: boolean }
 * }
 *
 * Returns: { success: true, share_id: string, share_url: string, expires_at: string | null }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    if (!body.trace_id) {
      return ValidationErrors.missingField('trace_id');
    }

    const supabase = createServerClient();

    // Fetch the full trace with all data for sharing
    const { data: trace, error: traceError } = await supabase
      .from('fall_retrieval_traces')
      .select('*')
      .eq('id', body.trace_id)
      .eq('user_id', userId)
      .single();

    if (traceError || !trace) {
      return ValidationErrors.invalidField('trace_id', 'Trace not found or not accessible');
    }

    // Parse expiration option
    const expiresIn: ExpiresIn = validateExpiresIn(body.expires_in) || '7d';

    // Parse redaction profile
    const redactionProfile: Partial<RedactionProfile> = {
      pii: body.redaction?.pii ?? true,
      secrets: body.redaction?.secrets ?? true,
      raw_content: body.redaction?.raw_content ?? false,
    };

    // Build trace snapshot with full data
    const traceData = trace.trace as Record<string, unknown> || {};
    const traceSnapshot: TraceSnapshot = {
      id: trace.id,
      request_id: trace.request_id,
      plan: trace.plan,
      collection_id: trace.collection_id,
      query_text: trace.query_text,
      query_hash: trace.query_hash,
      autopilot_reason: trace.autopilot_reason,
      effective_config: trace.effective_config || {},
      timings_ms: trace.timings_ms || {},
      results_count: trace.results_count || 0,
      error: trace.error,
      sampled: trace.sampled ?? true,
      created_at: trace.created_at,
      trace: {
        events: traceData.events as TraceSnapshot['trace']['events'],
        candidates: traceData.candidates as TraceSnapshot['trace']['candidates'],
        rerank_deltas: traceData.rerank_deltas as TraceSnapshot['trace']['rerank_deltas'],
        context: traceData.context as TraceSnapshot['trace']['context'],
        // Include spans for timeline visualization
        spans: traceData.spans as unknown[],
        cost: traceData.cost as Record<string, unknown>,
        result_stats: traceData.result_stats as Record<string, unknown>,
      },
    };

    // Create the share link with redaction applied
    const shareResult = await createShareLink({
      traceId: body.trace_id,
      userId,
      traceSnapshot,
      expiresIn,
      redactionProfile,
    });

    return NextResponse.json({
      success: true,
      share_id: shareResult.token,
      share_url: shareResult.shareUrl,
      expires_at: shareResult.expiresAt,
    });
  } catch (error) {
    console.error('Share trace error:', error);
    return ServerErrors.internal('share_trace');
  }
}

/**
 * GET /api/traces/share - List share links for a trace
 * Query: trace_id (required)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);
    const traceId = searchParams.get('trace_id');

    if (!traceId) {
      return ValidationErrors.missingField('trace_id');
    }

    const shares = await getTraceShareLinks({ traceId, userId });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seizn.com';

    return NextResponse.json({
      success: true,
      shares: shares.map((share) => ({
        share_id: share.share_id,
        share_url: `${baseUrl}/t/${share.share_id}`,
        expires_at: share.expires_at,
        view_count: share.view_count,
        created_at: share.created_at,
        redaction: share.redaction_profile,
      })),
    });
  } catch (error) {
    console.error('List share links error:', error);
    return ServerErrors.internal('list_share_links');
  }
}

/**
 * Validate and normalize expires_in parameter
 */
function validateExpiresIn(value: unknown): ExpiresIn | null {
  const validOptions: ExpiresIn[] = ['1h', '24h', '7d', 'never'];
  if (typeof value === 'string' && validOptions.includes(value as ExpiresIn)) {
    return value as ExpiresIn;
  }
  return null;
}
