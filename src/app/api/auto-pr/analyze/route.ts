/**
 * POST /api/auto-pr/analyze
 *
 * Analyze a trace for RAG quality issues.
 *
 * Request Body:
 * {
 *   "traceId": "uuid",           // Required: Trace to analyze
 *   "includeRelated": boolean,   // Optional: Include related traces
 *   "force": boolean,            // Optional: Force re-analysis
 *   "config": {                  // Optional: Detection config overrides
 *     "detectHallucination": boolean,
 *     "minRelevanceScore": number,
 *     "detectMissingContext": boolean,
 *     "detectChunkBoundary": boolean,
 *     "staleContentDays": number,
 *     "minConfidenceThreshold": number
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "analysis": { ...AnalysisResult },
 *   "cached": boolean
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  createAutoPRService,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type AnalysisResult,
} from '@/lib/auto-pr';
import type { StoredTrace } from '@/lib/fall/flight-recorder';

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;

    // Check plan allows auto-pr feature
    if (plan === 'free') {
      return NextResponse.json(
        {
          error: 'Auto-PR analysis is not available on the free plan. Please upgrade to Pro or Enterprise.',
        },
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

    // Check for cached analysis (unless force is true)
    if (!body.force) {
      const { data: cachedAnalysis } = await supabase
        .from('auto_pr_analyses')
        .select('*')
        .eq('trace_id', body.traceId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cachedAnalysis) {
        // Check if cache is still valid (less than 1 hour old)
        const cacheAge = Date.now() - new Date(cachedAnalysis.created_at).getTime();
        const cacheValidMs = 60 * 60 * 1000; // 1 hour

        if (cacheAge < cacheValidMs) {
          return NextResponse.json({
            success: true,
            analysis: cachedAnalysis.analysis as AnalysisResult,
            cached: true,
          } satisfies AnalyzeResponse);
        }
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

    // Convert to StoredTrace format
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

    // Create service and analyze
    const service = createAutoPRService({
      detection: body.config,
    });

    const analysis = await service.analyze(trace);

    // Store analysis result
    await supabase
      .from('auto_pr_analyses')
      .upsert({
        id: analysis.id,
        trace_id: body.traceId,
        user_id: userId,
        analysis: analysis,
        issues_count: analysis.issues.length,
        suggestions_count: analysis.suggestions.length,
        quality_score: analysis.qualityScore,
        confidence: analysis.confidence,
        created_at: analysis.analyzedAt,
      });

    return NextResponse.json({
      success: true,
      analysis,
      cached: false,
    } satisfies AnalyzeResponse);
  } catch (error) {
    console.error('Auto-PR analyze error:', error);
    return ServerErrors.internal('auto_pr_analyze');
  }
}
