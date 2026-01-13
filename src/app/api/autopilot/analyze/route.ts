/**
 * POST /api/autopilot/analyze
 *
 * Analyze a trace for failures and generate fix suggestions.
 *
 * Request Body:
 * {
 *   "traceId": "uuid",           // Required: Trace ID to analyze
 *   "includeRelated": boolean,   // Optional: Include related traces
 *   "force": boolean             // Optional: Force re-analysis
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "analysis": {
 *     "traceId": "uuid",
 *     "failures": [...],
 *     "suggestions": [...],
 *     "severity": 8,
 *     "confidence": 0.85,
 *     "rootCause": {...}
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { getTraceAnalyzer } from '@/lib/autopilot';
import type { StoredTrace } from '@/lib/fall/flight-recorder';
import type { AnalyzeRequest, AnalyzeResponse, TraceAnalysis } from '@/lib/autopilot';

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;

    // Check plan allows autopilot
    if (plan === 'free') {
      return NextResponse.json(
        { error: 'Autopilot is not available on the free plan. Please upgrade to Pro or Enterprise.' },
        { status: 403 }
      );
    }

    // Parse request body
    let body: AnalyzeRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    if (!body.traceId) {
      return ValidationErrors.missingField('traceId');
    }

    const supabase = createServerClient();

    // Check for cached analysis (unless force=true)
    if (!body.force) {
      const { data: cachedAnalysis } = await supabase
        .from('autopilot_analyses')
        .select('*')
        .eq('trace_id', body.traceId)
        .eq('user_id', userId)
        .single();

      if (cachedAnalysis) {
        return NextResponse.json({
          success: true,
          analysis: cachedAnalysis.analysis as TraceAnalysis,
          cached: true,
        });
      }
    }

    // Fetch the trace
    const { data: traceData, error: traceError } = await supabase
      .from('flight_recorder_traces')
      .select('*')
      .eq('id', body.traceId)
      .eq('user_id', userId)
      .single();

    if (traceError || !traceData) {
      return NextResponse.json(
        { error: 'Trace not found' },
        { status: 404 }
      );
    }

    // Convert to StoredTrace
    const trace: StoredTrace = {
      id: traceData.id,
      requestId: traceData.request_id,
      userId: traceData.user_id,
      apiKeyId: traceData.api_key_id,
      plan: traceData.plan,
      collectionId: traceData.collection_id,
      collectionIds: traceData.collection_ids,
      queryText: traceData.query_text,
      queryHash: traceData.query_hash,
      autopilotReason: traceData.autopilot_reason,
      effectiveConfig: traceData.effective_config,
      timingsMs: traceData.timings_ms,
      resultsCount: traceData.results_count,
      error: traceData.error,
      sampled: traceData.sampled,
      experimentId: traceData.experiment_id,
      armId: traceData.arm_id,
      trace: traceData.trace,
      createdAt: traceData.created_at,
      replayOf: traceData.replay_of,
    };

    // Analyze the trace
    const analyzer = getTraceAnalyzer();
    const analysis = await analyzer.analyze(trace);

    // Store analysis result
    await supabase
      .from('autopilot_analyses')
      .upsert({
        id: `analysis-${body.traceId}`,
        trace_id: body.traceId,
        user_id: userId,
        analysis: analysis,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    // Fetch related traces if requested
    if (body.includeRelated && analysis.failures.length > 0) {
      const _primaryFailureType = analysis.failures[0].type;

      const { data: relatedTraces } = await supabase
        .from('flight_recorder_traces')
        .select('id')
        .eq('user_id', userId)
        .not('error', 'is', null)
        .neq('id', body.traceId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (relatedTraces) {
        analysis.relatedTraces = relatedTraces.map((t) => t.id);
      }
    }

    const response: AnalyzeResponse = {
      success: true,
      analysis,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Autopilot analyze error:', error);
    return ServerErrors.internal('autopilot_analyze');
  }
}
