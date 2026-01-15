/**
 * Test Run API
 *
 * POST /api/testing/suites/[id]/run - Run tests in a suite
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { runTestSuite } from '@/lib/testing';
import type { RunTestsRequest, TriggerType } from '@/lib/testing/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/testing/suites/[id]/run
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: suiteId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: RunTestsRequest = await request.json().catch(() => ({}));
    const supabase = createServerClient();

    // Verify suite exists and belongs to user
    const { data: suite, error: suiteError } = await supabase
      .from('retrieval_test_suites')
      .select('id, name, is_active')
      .eq('id', suiteId)
      .eq('user_id', userId)
      .single();

    if (suiteError || !suite) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/run`, method: 'POST', startTime },
        404
      );
      return NotFoundErrors.resource('Test suite');
    }

    if (!suite.is_active) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/run`, method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        {
          error: {
            error_code: 'VALIDATION_ERROR',
            message: 'Cannot run tests on an inactive suite',
          },
        },
        { status: 400 }
      );
    }

    // Run options
    const triggeredBy: TriggerType = body.triggered_by || 'manual';
    const triggerContext = body.trigger_context;
    const caseIds = body.case_ids;

    // Check if there's already a running test
    const { data: runningTests } = await supabase
      .from('retrieval_test_runs')
      .select('id')
      .eq('suite_id', suiteId)
      .eq('status', 'running')
      .limit(1);

    if (runningTests && runningTests.length > 0) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/run`, method: 'POST', startTime },
        409
      );
      return NextResponse.json(
        {
          error: {
            error_code: 'CONFLICT',
            message: 'A test run is already in progress for this suite',
            running_run_id: runningTests[0].id,
          },
        },
        { status: 409 }
      );
    }

    // Execute test suite
    const run = await runTestSuite(suiteId, userId, {
      caseIds,
      triggeredBy,
      triggerContext,
      checkFaithfulness: body.trigger_context?.check_faithfulness === true,
    });

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/run`, method: 'POST', startTime },
      200
    );

    // Calculate pass rate
    const passRate = run.total_cases > 0
      ? ((run.passed / run.total_cases) * 100).toFixed(1)
      : '0';

    return NextResponse.json({
      success: true,
      data: {
        run_id: run.id,
        suite_id: suiteId,
        suite_name: suite.name,
        status: run.status,
        summary: {
          total: run.total_cases,
          passed: run.passed,
          failed: run.failed,
          skipped: run.skipped,
          pass_rate: `${passRate}%`,
        },
        timing: {
          started_at: run.started_at,
          completed_at: run.completed_at,
          duration_ms: run.duration_ms,
        },
        triggered_by: triggeredBy,
      },
    });
  } catch (error) {
    console.error('Run tests error:', error);
    return ServerErrors.internal('run_tests');
  }
}
