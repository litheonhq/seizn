import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

/**
 * POST /api/traces/share - Create a shareable link for a trace
 * Body: { trace_id: string, expires_in?: number }
 *
 * Returns: { share_url: string, share_id: string, expires_at: string }
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

    // Verify the trace belongs to this user
    const { data: trace, error: traceError } = await supabase
      .from('fall_retrieval_traces')
      .select('id, request_id, plan, query_hash, autopilot_reason, effective_config, timings_ms, results_count, created_at')
      .eq('id', body.trace_id)
      .eq('user_id', userId)
      .single();

    if (traceError || !trace) {
      return ValidationErrors.invalidField('trace_id', 'Trace not found or not accessible');
    }

    // Generate share ID (Base62-like short ID)
    const shareId = generateShareId();

    // Default expiration: 7 days
    const expiresInSeconds = body.expires_in || 7 * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // Create shared trace record
    const { error: insertError } = await supabase.from('shared_traces').insert({
      share_id: shareId,
      trace_id: body.trace_id,
      user_id: userId,
      trace_snapshot: {
        request_id: trace.request_id,
        plan: trace.plan,
        query_hash: trace.query_hash,
        autopilot_reason: trace.autopilot_reason,
        effective_config: trace.effective_config,
        timings_ms: trace.timings_ms,
        results_count: trace.results_count,
        created_at: trace.created_at,
      },
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error('Share trace insert error:', insertError);
      return ServerErrors.database('create_share');
    }

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://seizn.com'}/trace/${shareId}`;

    return NextResponse.json({
      success: true,
      share_id: shareId,
      share_url: shareUrl,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Share trace error:', error);
    return ServerErrors.internal('share_trace');
  }
}

/**
 * Generate a short, URL-safe share ID
 */
function generateShareId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  const randomValues = new Uint8Array(8);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < 8; i++) {
    result += chars[randomValues[i] % chars.length];
  }

  return result;
}
