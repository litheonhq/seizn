import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import {
  generateShareToken,
  calculateExpiry,
  redactTrace,
  DEFAULT_REDACTION_PROFILE,
  type ShareTraceRequest,
  type RedactionProfile,
  type TraceSnapshot,
} from '@/lib/sharing';

// Short ID generator for shareable links
function generateShortId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (let i = 0; i < 16; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * POST /api/traces/[id]/share
 * Create a shareable link for a trace
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: traceId } = await params;

    // Parse request body
    let body: ShareTraceRequest = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK, use defaults
    }

    const expiresIn = body.expiresIn || '24h';
    const redactionProfile: RedactionProfile = {
      ...DEFAULT_REDACTION_PROFILE,
      ...body.redactionProfile,
    };

    const supabase = createServerClient();

    // Fetch the trace and verify ownership
    const { data: trace, error: traceError } = await supabase
      .from('fall_retrieval_traces')
      .select('*')
      .eq('id', traceId)
      .eq('user_id', userId)
      .single();

    if (traceError || !trace) {
      return NextResponse.json(
        { error: 'Trace not found or access denied' },
        { status: 404 }
      );
    }

    // Create trace snapshot
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
      trace: trace.trace || {},
      sampled: trace.sampled ?? true,
      created_at: trace.created_at,
    };

    // Apply redaction to the snapshot
    const redactedSnapshot = redactTrace(traceSnapshot, redactionProfile);

    // Generate tokens
    const shareToken = generateShareToken();
    const shareId = generateShortId();
    const expiresAt = calculateExpiry(expiresIn);

    // Store the shared trace
    const { data: sharedTrace, error: insertError } = await supabase
      .from('shared_traces')
      .insert({
        share_token: shareToken,
        share_id: shareId,
        trace_id: traceId,
        user_id: userId,
        trace_snapshot: redactedSnapshot,
        redaction_profile: redactionProfile,
        expires_at: expiresAt?.toISOString() || null,
        view_count: 0,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create shared trace:', insertError);
      return NextResponse.json(
        { error: 'Failed to create shared trace' },
        { status: 500 }
      );
    }

    // Build share URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com';
    const shareUrl = `${baseUrl}/t/${shareToken}`;

    return NextResponse.json({
      success: true,
      shareUrl,
      token: shareToken,
      shortId: shareId,
      expiresAt: expiresAt?.toISOString() || null,
      id: sharedTrace.id,
    });
  } catch (err) {
    console.error('Share trace error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/traces/[id]/share
 * Get existing shares for a trace
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: traceId } = await params;

    const supabase = createServerClient();

    // Fetch existing shares for this trace
    const { data: shares, error } = await supabase
      .from('shared_traces')
      .select('id, share_token, share_id, redaction_profile, view_count, expires_at, created_at')
      .eq('trace_id', traceId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch shares:', error);
      return NextResponse.json(
        { error: 'Failed to fetch shares' },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com';

    return NextResponse.json({
      success: true,
      shares: (shares || []).map((share) => ({
        id: share.id,
        shareUrl: `${baseUrl}/t/${share.share_token}`,
        token: share.share_token,
        shortId: share.share_id,
        redactionProfile: share.redaction_profile,
        viewCount: share.view_count,
        expiresAt: share.expires_at,
        createdAt: share.created_at,
        isExpired: share.expires_at ? new Date(share.expires_at) < new Date() : false,
      })),
    });
  } catch (err) {
    console.error('Get shares error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/traces/[id]/share
 * Delete a shared trace link
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: traceId } = await params;

    // Get share ID from query params
    const url = new URL(request.url);
    const shareId = url.searchParams.get('shareId');

    if (!shareId) {
      return NextResponse.json(
        { error: 'shareId query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Delete the share
    const { error } = await supabase
      .from('shared_traces')
      .delete()
      .eq('id', shareId)
      .eq('trace_id', traceId)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete share:', error);
      return NextResponse.json(
        { error: 'Failed to delete share' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete share error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
