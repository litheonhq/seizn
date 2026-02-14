import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { PublicTraceView } from '@/lib/sharing';
import { getErrorMessage } from '@/lib/ui-error';

// Simple in-memory rate limiting for public endpoint
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return ip;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

/**
 * GET /api/t/[token]
 * Public endpoint to view a shared trace (no authentication required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Rate limiting
  const rateLimitKey = getRateLimitKey(request);
  const rateLimit = checkRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      }
    );
  }

  // Validate token format (64 hex chars)
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    // Try short ID fallback
    return await fetchByShortId(token, rateLimit.remaining);
  }

  const supabase = createServerClient();

  // Fetch shared trace by token
  const { data: sharedTrace, error } = await supabase
    .from('shared_traces')
    .select('*')
    .eq('share_token', token)
    .single();

  if (error || !sharedTrace) {
    return NextResponse.json(
      { error: 'Shared trace not found' },
      {
        status: 404,
        headers: { 'X-RateLimit-Remaining': rateLimit.remaining.toString() },
      }
    );
  }

  // Check expiration
  if (sharedTrace.expires_at && new Date(sharedTrace.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This shared trace has expired' },
      {
        status: 410,
        headers: { 'X-RateLimit-Remaining': rateLimit.remaining.toString() },
      }
    );
  }

  // Increment view count (non-blocking)
  supabase
    .from('shared_traces')
    .update({ view_count: (sharedTrace.view_count || 0) + 1 })
    .eq('id', sharedTrace.id)
    
    ;

  // Build public trace view
  const snapshot = sharedTrace.trace_snapshot;
  const normalizedTraceError = snapshot?.error ? getErrorMessage(snapshot.error, '') : undefined;
  const publicTrace: PublicTraceView = {
    id: snapshot.id,
    request_id: snapshot.request_id,
    plan: snapshot.plan,
    collection_id: snapshot.collection_id,
    query_text: snapshot.query_text,
    autopilot_reason: snapshot.autopilot_reason,
    effective_config: snapshot.effective_config || {},
    timings_ms: snapshot.timings_ms || {},
    results_count: snapshot.results_count || 0,
    // Defensive: shared snapshots can contain structured error objects; always serialize to a string for UI.
    error: normalizedTraceError,
    trace: snapshot.trace || {},
    created_at: snapshot.created_at,
    view_count: (sharedTrace.view_count || 0) + 1,
    shared_at: sharedTrace.created_at,
  };

  return NextResponse.json(
    {
      success: true,
      trace: publicTrace,
      redactionApplied: sharedTrace.redaction_profile,
    },
    {
      status: 200,
      headers: {
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  );
}

/**
 * Fallback to fetch by short ID (share_id)
 */
async function fetchByShortId(shortId: string, remaining: number) {
  const supabase = createServerClient();

  const { data: sharedTrace, error } = await supabase
    .from('shared_traces')
    .select('*')
    .eq('share_id', shortId)
    .single();

  if (error || !sharedTrace) {
    return NextResponse.json(
      { error: 'Shared trace not found' },
      {
        status: 404,
        headers: { 'X-RateLimit-Remaining': remaining.toString() },
      }
    );
  }

  // Check expiration
  if (sharedTrace.expires_at && new Date(sharedTrace.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This shared trace has expired' },
      {
        status: 410,
        headers: { 'X-RateLimit-Remaining': remaining.toString() },
      }
    );
  }

  // Increment view count
  supabase
    .from('shared_traces')
    .update({ view_count: (sharedTrace.view_count || 0) + 1 })
    .eq('id', sharedTrace.id)
    
    ;

  const snapshot = sharedTrace.trace_snapshot;
  const normalizedTraceError = snapshot?.error ? getErrorMessage(snapshot.error, '') : undefined;
  const publicTrace: PublicTraceView = {
    id: snapshot.id,
    request_id: snapshot.request_id,
    plan: snapshot.plan,
    collection_id: snapshot.collection_id,
    query_text: snapshot.query_text,
    autopilot_reason: snapshot.autopilot_reason,
    effective_config: snapshot.effective_config || {},
    timings_ms: snapshot.timings_ms || {},
    results_count: snapshot.results_count || 0,
    // Defensive: shared snapshots can contain structured error objects; always serialize to a string for UI.
    error: normalizedTraceError,
    trace: snapshot.trace || {},
    created_at: snapshot.created_at,
    view_count: (sharedTrace.view_count || 0) + 1,
    shared_at: sharedTrace.created_at,
  };

  return NextResponse.json(
    {
      success: true,
      trace: publicTrace,
      redactionApplied: sharedTrace.redaction_profile,
    },
    {
      status: 200,
      headers: {
        'X-RateLimit-Remaining': remaining.toString(),
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  );
}
