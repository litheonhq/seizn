import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import {
  generateDebugBundle,
  exportDebugBundle,
  getDebugBundleFilename,
  type DebugBundleOptions,
} from '@/lib/debug-bundle';
import type { RedactionProfile, TraceSnapshot } from '@/lib/sharing';

interface ExportBundleRequest {
  format?: 'json' | 'markdown';
  redactionProfile?: Partial<RedactionProfile>;
  includeReplayCommands?: boolean;
  includeEnvironment?: boolean;
}

/**
 * POST /api/traces/[id]/export-bundle
 * Generate and download a debug bundle for a trace
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
    let body: ExportBundleRequest = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK, use defaults
    }

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

    // Build trace snapshot
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

    // Build options
    const options: DebugBundleOptions = {
      format: body.format || 'json',
      redactionProfile: body.redactionProfile,
      includeReplayCommands: body.includeReplayCommands,
      includeEnvironment: body.includeEnvironment,
    };

    // Generate bundle
    const bundle = generateDebugBundle(traceSnapshot, options);
    const content = exportDebugBundle(bundle);
    const filename = getDebugBundleFilename(bundle);

    // Determine content type
    const contentType = options.format === 'markdown'
      ? 'text/markdown; charset=utf-8'
      : 'application/json; charset=utf-8';

    // Return as downloadable file
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logServerError('Export bundle error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/traces/[id]/export-bundle
 * Preview bundle without download (returns JSON)
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

    // Parse query params
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'json') as 'json' | 'markdown';
    const maskPii = url.searchParams.get('mask_pii') !== 'false';
    const maskSecrets = url.searchParams.get('mask_secrets') !== 'false';

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

    // Build trace snapshot
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

    // Generate bundle
    const bundle = generateDebugBundle(traceSnapshot, {
      format,
      redactionProfile: {
        pii: maskPii,
        secrets: maskSecrets,
        raw_content: false,
      },
    });

    return NextResponse.json({
      success: true,
      bundle,
      downloadUrl: `/api/traces/${traceId}/export-bundle`,
    });
  } catch (err) {
    logServerError('Preview bundle error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

