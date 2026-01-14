/**
 * POST /api/auto-pr/create-pr
 *
 * Create a GitHub PR with auto-fix suggestions.
 *
 * Request Body:
 * {
 *   "analysisId": "uuid",        // Required if no traceId
 *   "traceId": "uuid",           // Required if no analysisId
 *   "suggestionIds": ["uuid"],   // Optional: Specific suggestions to apply
 *   "preview": boolean,          // Optional: Return preview without creating PR
 *   "repoConfig": {              // Required unless preview is true
 *     "repo": { "owner": string, "name": string },
 *     "baseBranch": string,
 *     "branchPrefix": string,
 *     "reviewers": string[],
 *     "labels": string[],
 *     "draft": boolean
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "prRecord": { ...PRRecord },  // If not preview
 *   "preview": {                   // If preview is true
 *     "title": string,
 *     "body": string,
 *     "files": PRFile[]
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  createAutoPRService,
  type AnalysisResult,
  type FixSuggestion,
  type PRConfig,
  type PRRecord,
  type PRFile,
  type PRMetadata,
  generatePRTitle,
  generatePRBody,
} from '@/lib/auto-pr';
import type { StoredTrace } from '@/lib/fall/flight-recorder';

interface CreatePRRequestBody {
  analysisId?: string;
  traceId?: string;
  suggestionIds?: string[];
  preview?: boolean;
  repoConfig?: PRConfig;
}

interface CreatePRSuccessResponse {
  success: true;
  prRecord?: PRRecord;
  preview?: {
    title: string;
    body: string;
    files: PRFile[];
  };
  analysisId: string;
}

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
          error: 'Auto-PR creation is not available on the free plan. Please upgrade to Pro or Enterprise.',
        },
        { status: 403 }
      );
    }

    // Enterprise-only for actual PR creation (Pro can preview)
    // Parse request body first to check preview mode
    let body: CreatePRRequestBody;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    if (!body.preview && plan !== 'enterprise') {
      return NextResponse.json(
        {
          error: 'Creating GitHub PRs requires Enterprise plan. Use preview mode to see suggested changes on Pro plan.',
        },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!body.analysisId && !body.traceId) {
      return ValidationErrors.missingField('analysisId or traceId');
    }

    if (!body.preview && !body.repoConfig) {
      return ValidationErrors.missingField('repoConfig (required when not in preview mode)');
    }

    if (body.repoConfig && !body.repoConfig.repo) {
      return ValidationErrors.missingField('repoConfig.repo');
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

      trace = mapTraceData(traceData);
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

      trace = mapTraceData(traceData);

      // Run analysis
      const service = createAutoPRService();
      analysis = await service.analyze(trace);

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
    }

    // Filter suggestions if specific IDs provided
    let suggestions: FixSuggestion[] = analysis.suggestions;
    if (body.suggestionIds && body.suggestionIds.length > 0) {
      suggestions = suggestions.filter(s => body.suggestionIds!.includes(s.id));
    }

    if (suggestions.length === 0) {
      return NextResponse.json({
        success: true,
        analysisId: analysis.id,
        message: 'No suggestions to apply',
      });
    }

    // Build PR metadata
    const metadata: PRMetadata = {
      version: '1.0.0',
      issueIds: analysis.issues.map(i => i.id),
      suggestionIds: suggestions.map(s => s.id),
      traceId: analysis.traceId,
      userId: analysis.userId,
      createdAt: new Date().toISOString(),
      confidence: analysis.confidence,
      summary: {
        totalIssues: analysis.issues.length,
        totalFixes: suggestions.length,
        codeChanges: suggestions.reduce((sum, s) => sum + (s.codePatches?.length || 0), 0),
        configChanges: suggestions.reduce((sum, s) => sum + (s.configPatches?.length || 0), 0),
      },
    };

    // Build PR files from suggestions
    const files: PRFile[] = [];
    for (const suggestion of suggestions) {
      for (const patch of suggestion.codePatches || []) {
        files.push({
          path: patch.filePath,
          content: patch.newContent,
          mode: '100644',
          action: patch.action,
        });
      }
    }

    // Get relevant issues for the suggestions
    const relevantIssueIds = suggestions.flatMap(s => s.issueId);
    const relevantIssues = analysis.issues.filter(i => relevantIssueIds.includes(i.id));

    // Preview mode
    if (body.preview) {
      return NextResponse.json({
        success: true,
        preview: {
          title: generatePRTitle(suggestions),
          body: generatePRBody(relevantIssues, suggestions, metadata),
          files,
        },
        analysisId: analysis.id,
      } satisfies CreatePRSuccessResponse);
    }

    // Create actual PR
    const service = createAutoPRService();
    const prRecord = await service.createPR(analysis, suggestions, body.repoConfig!);

    // Store PR record
    await supabase
      .from('auto_pr_records')
      .insert({
        id: prRecord.id,
        user_id: userId,
        analysis_id: analysis.id,
        pr_number: prRecord.prNumber,
        pr_url: prRecord.prUrl,
        repo_owner: body.repoConfig!.repo.owner,
        repo_name: body.repoConfig!.repo.name,
        branch_name: prRecord.request.headBranch,
        status: prRecord.status,
        title: prRecord.request.title,
        suggestions_applied: suggestions.map(s => s.id),
        files_changed: files.length,
        created_at: prRecord.createdAt,
        metadata: prRecord.request.metadata,
      });

    return NextResponse.json({
      success: true,
      prRecord,
      analysisId: analysis.id,
    } satisfies CreatePRSuccessResponse);
  } catch (error) {
    console.error('Auto-PR create-pr error:', error);
    return ServerErrors.internal('auto_pr_create_pr');
  }
}

// Helper function to map database trace data to StoredTrace
function mapTraceData(traceData: Record<string, unknown>): StoredTrace {
  return {
    id: traceData.id as string,
    requestId: traceData.request_id as string,
    userId: traceData.user_id as string,
    apiKeyId: traceData.api_key_id as string | undefined,
    plan: traceData.plan as string,
    collectionId: traceData.collection_id as string | undefined,
    collectionIds: traceData.collection_ids as string[] | undefined,
    queryText: traceData.query_text as string,
    queryHash: traceData.query_hash as string,
    autopilotReason: traceData.autopilot_reason as string | undefined,
    effectiveConfig: traceData.effective_config as Record<string, unknown>,
    timingsMs: traceData.timings_ms as Record<string, number>,
    resultsCount: traceData.results_count as number,
    error: traceData.error as string | undefined,
    sampled: traceData.sampled as boolean,
    experimentId: traceData.experiment_id as string | undefined,
    armId: traceData.arm_id as string | undefined,
    trace: traceData.trace as StoredTrace['trace'],
    createdAt: traceData.created_at as string,
    replayOf: traceData.replay_of as string | undefined,
  };
}
