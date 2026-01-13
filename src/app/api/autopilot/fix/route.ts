/**
 * POST /api/autopilot/fix
 *
 * Generate fix context from analysis results.
 *
 * Request Body:
 * {
 *   "traceId": "uuid",           // Required if no analysisId
 *   "analysisId": "uuid",        // Required if no traceId
 *   "suggestionIds": ["uuid"],   // Optional: Specific suggestions to apply
 *   "applyAll": boolean,         // Optional: Apply all suggestions
 *   "preview": boolean           // Optional: Preview only, don't prepare PR
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "prContext": {...},
 *   "previewOnly": true,
 *   "appliedSuggestions": ["uuid"]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { getTraceAnalyzer, createPRGenerator, DEFAULT_AUTOPILOT_CONFIG } from '@/lib/autopilot';
import type { StoredTrace } from '@/lib/fall/flight-recorder';
import type { FixRequest, FixResponse, TraceAnalysis, AutopilotConfig } from '@/lib/autopilot';

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
    let body: FixRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    if (!body.traceId && !body.analysisId) {
      return ValidationErrors.missingField('traceId or analysisId');
    }

    const supabase = createServerClient();

    // Get analysis
    let analysis: TraceAnalysis;

    if (body.analysisId) {
      // Fetch existing analysis
      const { data: analysisData, error: analysisError } = await supabase
        .from('autopilot_analyses')
        .select('*')
        .eq('id', body.analysisId)
        .eq('user_id', userId)
        .single();

      if (analysisError || !analysisData) {
        return NextResponse.json(
          { error: 'Analysis not found' },
          { status: 404 }
        );
      }

      analysis = analysisData.analysis as TraceAnalysis;
    } else {
      // Analyze trace first
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

      const analyzer = getTraceAnalyzer();
      analysis = await analyzer.analyze(trace);
    }

    // Filter suggestions
    let suggestionsToApply = analysis.suggestions;

    if (body.suggestionIds && body.suggestionIds.length > 0) {
      suggestionsToApply = analysis.suggestions.filter((s) =>
        body.suggestionIds!.includes(s.id)
      );
    } else if (!body.applyAll) {
      // Default: only apply high-confidence suggestions
      suggestionsToApply = analysis.suggestions.filter((s) => s.confidence >= 0.7);
    }

    if (suggestionsToApply.length === 0) {
      return NextResponse.json({
        success: true,
        prContext: null,
        previewOnly: body.preview || false,
        appliedSuggestions: [],
        message: 'No suggestions meet the criteria for application',
      });
    }

    // Get user's autopilot config
    const { data: configData } = await supabase
      .from('autopilot_configs')
      .select('config')
      .eq('user_id', userId)
      .single();

    const config: AutopilotConfig = {
      ...DEFAULT_AUTOPILOT_CONFIG,
      ...(configData?.config as Partial<AutopilotConfig> || {}),
    };

    // Validate config has required fields
    if (!config.owner || !config.repo) {
      return NextResponse.json(
        {
          error: 'Autopilot not configured. Please set up repository settings in the dashboard.',
          hint: 'Go to Settings -> Autopilot -> Configure Repository',
        },
        { status: 400 }
      );
    }

    // Generate PR context
    const prGenerator = createPRGenerator(config);
    const prContext = prGenerator.generate(analysis, suggestionsToApply);

    // Store the fix context (unless preview only)
    if (!body.preview) {
      await supabase
        .from('autopilot_fixes')
        .insert({
          id: `fix-${analysis.traceId}-${Date.now()}`,
          user_id: userId,
          trace_id: analysis.traceId,
          analysis_id: body.analysisId || `analysis-${analysis.traceId}`,
          pr_context: prContext,
          applied_suggestions: suggestionsToApply.map((s) => s.id),
          status: 'pending',
          created_at: new Date().toISOString(),
        });
    }

    const response: FixResponse = {
      success: true,
      prContext,
      previewOnly: body.preview || false,
      appliedSuggestions: suggestionsToApply.map((s) => s.id),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Autopilot fix error:', error);
    return ServerErrors.internal('autopilot_fix');
  }
}
