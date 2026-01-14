/**
 * POST /api/auto-pr/suggest
 *
 * Generate fix suggestions for detected issues.
 *
 * Request Body:
 * {
 *   "analysisId": "uuid",        // Required if no traceId
 *   "traceId": "uuid",           // Required if no analysisId
 *   "issueIds": ["uuid"],        // Optional: Specific issues to fix
 *   "maxSuggestionsPerIssue": number, // Optional: Limit suggestions
 *   "autoMergeableOnly": boolean // Optional: Only auto-mergeable fixes
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "suggestions": [ ...FixSuggestion[] ],
 *   "analysisId": "uuid"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  createAutoPRService,
  type SuggestRequest,
  type SuggestResponse,
  type AnalysisResult,
  type IssueDetection,
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
          error: 'Auto-PR suggestions are not available on the free plan. Please upgrade to Pro or Enterprise.',
        },
        { status: 403 }
      );
    }

    // Parse request body
    let body: SuggestRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    if (!body.analysisId && !body.traceId) {
      return ValidationErrors.missingField('analysisId or traceId');
    }

    const supabase = createServerClient();
    let analysis: AnalysisResult;
    let trace: StoredTrace;

    if (body.analysisId) {
      // Fetch existing analysis
      const { data: analysisData, error: analysisError } = await supabase
        .from('auto_pr_analyses')
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

      analysis = analysisData.analysis as AnalysisResult;

      // Fetch the associated trace
      const { data: traceData, error: traceError } = await supabase
        .from('flight_recorder_traces')
        .select('*')
        .eq('id', analysis.traceId)
        .eq('user_id', userId)
        .single();

      if (traceError || !traceData) {
        return NextResponse.json(
          { error: 'Associated trace not found' },
          { status: 404 }
        );
      }

      trace = {
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

      trace = {
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

      // Run analysis
      const service = createAutoPRService();
      analysis = await service.analyze(trace);
    }

    // Filter issues if specific IDs provided
    let issues: IssueDetection[] = analysis.issues;
    if (body.issueIds && body.issueIds.length > 0) {
      issues = issues.filter(i => body.issueIds!.includes(i.id));
    }

    if (issues.length === 0) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        analysisId: analysis.id,
        message: 'No issues to generate suggestions for',
      });
    }

    // Generate suggestions
    const service = createAutoPRService();
    const suggestions = await service.suggestFixes(issues, trace, {
      maxSuggestionsPerIssue: body.maxSuggestionsPerIssue,
      autoMergeableOnly: body.autoMergeableOnly,
    });

    return NextResponse.json({
      success: true,
      suggestions,
      analysisId: analysis.id,
    } satisfies SuggestResponse);
  } catch (error) {
    console.error('Auto-PR suggest error:', error);
    return ServerErrors.internal('auto_pr_suggest');
  }
}
