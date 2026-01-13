/**
 * Test Results API
 *
 * GET /api/testing/suites/[id]/results - Get test results for a suite
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, NotFoundErrors, ServerErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/testing/suites/[id]/results
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: suiteId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Query params
    const runId = searchParams.get('run_id');
    const limit = parseInt(searchParams.get('limit') || '10');
    const includeDetails = searchParams.get('details') === 'true';

    const supabase = createServerClient();

    // Verify suite access
    const { data: suite, error: suiteError } = await supabase
      .from('retrieval_test_suites')
      .select('id, name')
      .eq('id', suiteId)
      .eq('user_id', userId)
      .single();

    if (suiteError || !suite) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/results`, method: 'GET', startTime },
        404
      );
      return NotFoundErrors.resource('Test suite');
    }

    // If specific run requested
    if (runId) {
      const { data: run, error: runError } = await supabase
        .from('retrieval_test_runs')
        .select('*')
        .eq('id', runId)
        .eq('suite_id', suiteId)
        .single();

      if (runError || !run) {
        return NotFoundErrors.resource('Test run');
      }

      // Optionally include detailed case results
      let caseResults = null;
      if (includeDetails) {
        const { data } = await supabase
          .from('retrieval_test_case_runs')
          .select(`
            id,
            case_id,
            result,
            error_message,
            relevance_score,
            keyword_match_score,
            faithfulness_score,
            latency_ms,
            retrieved_doc_ids,
            matched_keywords,
            missing_keywords,
            created_at
          `)
          .eq('run_id', runId)
          .order('created_at', { ascending: true });

        caseResults = data;
      }

      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/results`, method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        data: {
          run,
          case_results: caseResults,
        },
      });
    }

    // Get recent runs
    const { data: runs, error: runsError } = await supabase
      .from('retrieval_test_runs')
      .select(`
        id,
        status,
        total_cases,
        passed,
        failed,
        skipped,
        started_at,
        completed_at,
        duration_ms,
        triggered_by,
        avg_score,
        avg_latency_ms,
        p50_latency_ms,
        p95_latency_ms
      `)
      .eq('suite_id', suiteId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (runsError) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/results`, method: 'GET', startTime },
        500
      );
      return ServerErrors.database('get_test_results');
    }

    // Calculate aggregate stats
    const completedRuns = runs?.filter(r => r.status === 'completed') || [];
    const totalRuns = completedRuns.length;
    const avgPassRate = totalRuns > 0
      ? completedRuns.reduce((sum, r) => sum + (r.passed / r.total_cases), 0) / totalRuns
      : 0;
    const avgLatency = totalRuns > 0
      ? completedRuns.reduce((sum, r) => sum + (r.avg_latency_ms || 0), 0) / totalRuns
      : 0;

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/results`, method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: {
        suite: {
          id: suite.id,
          name: suite.name,
        },
        runs,
        aggregate: {
          total_runs: totalRuns,
          avg_pass_rate: `${(avgPassRate * 100).toFixed(1)}%`,
          avg_latency_ms: Math.round(avgLatency),
        },
      },
    });
  } catch (error) {
    console.error('Get test results error:', error);
    return ServerErrors.internal('get_test_results');
  }
}
