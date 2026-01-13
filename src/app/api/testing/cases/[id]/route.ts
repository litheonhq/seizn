/**
 * Test Case Detail API
 *
 * GET /api/testing/cases/[id] - Get test case details
 * PATCH /api/testing/cases/[id] - Update test case
 * DELETE /api/testing/cases/[id] - Delete test case
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

// GET /api/testing/cases/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: caseId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history') === 'true';

    const supabase = createServerClient();

    // Get test case with suite verification
    const { data: testCase, error: caseError } = await supabase
      .from('retrieval_test_cases')
      .select(`
        *,
        suite:retrieval_test_suites!inner(id, name, user_id)
      `)
      .eq('id', caseId)
      .single();

    if (caseError || !testCase) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/cases/${caseId}`, method: 'GET', startTime },
        404
      );
      return NotFoundErrors.resource('Test case');
    }

    // Verify ownership through suite
    if (testCase.suite.user_id !== userId) {
      return NotFoundErrors.resource('Test case');
    }

    // Optionally include run history
    let runHistory = null;
    if (includeHistory) {
      const { data } = await supabase
        .from('retrieval_test_case_runs')
        .select(`
          id,
          result,
          relevance_score,
          keyword_match_score,
          faithfulness_score,
          latency_ms,
          error_message,
          created_at,
          run:retrieval_test_runs(id, triggered_by)
        `)
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(20);

      runHistory = data;
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/cases/${caseId}`, method: 'GET', startTime },
      200
    );

    // Calculate pass rate
    const passRate = testCase.run_count > 0
      ? ((testCase.pass_count / testCase.run_count) * 100).toFixed(1)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        ...testCase,
        suite: {
          id: testCase.suite.id,
          name: testCase.suite.name,
        },
        stats: {
          run_count: testCase.run_count,
          pass_count: testCase.pass_count,
          fail_count: testCase.fail_count,
          pass_rate: passRate ? `${passRate}%` : null,
        },
        run_history: runHistory,
      },
    });
  } catch (error) {
    console.error('Get test case error:', error);
    return ServerErrors.internal('get_test_case');
  }
}

// PATCH /api/testing/cases/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: caseId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();
    const supabase = createServerClient();

    // Verify ownership through suite
    const { data: existingCase } = await supabase
      .from('retrieval_test_cases')
      .select('suite:retrieval_test_suites!inner(user_id)')
      .eq('id', caseId)
      .single();

    if (!existingCase || ((existingCase.suite as unknown as { user_id: string }[])[0]?.user_id ?? "") !== userId) {
      return NotFoundErrors.resource('Test case');
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.query !== undefined) updates.query = body.query;
    if (body.test_type !== undefined) updates.test_type = body.test_type;
    if (body.expected_doc_ids !== undefined) updates.expected_doc_ids = body.expected_doc_ids;
    if (body.expected_keywords !== undefined) updates.expected_keywords = body.expected_keywords;
    if (body.expected_not_keywords !== undefined) updates.expected_not_keywords = body.expected_not_keywords;
    if (body.min_score !== undefined) updates.min_score = body.min_score;
    if (body.max_latency_ms !== undefined) updates.max_latency_ms = body.max_latency_ms;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (Object.keys(updates).length === 0) {
      return ValidationErrors.missingField('at least one field to update');
    }

    updates.updated_at = new Date().toISOString();

    const { data: testCase, error } = await supabase
      .from('retrieval_test_cases')
      .update(updates)
      .eq('id', caseId)
      .select()
      .single();

    if (error || !testCase) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/cases/${caseId}`, method: 'PATCH', startTime },
        500
      );
      return ServerErrors.database('update_test_case');
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/cases/${caseId}`, method: 'PATCH', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: testCase,
    });
  } catch (error) {
    console.error('Update test case error:', error);
    return ServerErrors.internal('update_test_case');
  }
}

// DELETE /api/testing/cases/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: caseId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    // Verify ownership through suite
    const { data: existingCase } = await supabase
      .from('retrieval_test_cases')
      .select('suite:retrieval_test_suites!inner(user_id)')
      .eq('id', caseId)
      .single();

    if (!existingCase || ((existingCase.suite as unknown as { user_id: string }[])[0]?.user_id ?? "") !== userId) {
      return NotFoundErrors.resource('Test case');
    }

    const { searchParams } = new URL(request.url);
    const hard = searchParams.get('hard') === 'true';

    if (hard) {
      // Hard delete
      const { error } = await supabase
        .from('retrieval_test_cases')
        .delete()
        .eq('id', caseId);

      if (error) {
        return ServerErrors.database('delete_test_case');
      }
    } else {
      // Soft delete
      const { error } = await supabase
        .from('retrieval_test_cases')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', caseId);

      if (error) {
        return ServerErrors.database('delete_test_case');
      }
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/cases/${caseId}`, method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: caseId,
      hard,
    });
  } catch (error) {
    console.error('Delete test case error:', error);
    return ServerErrors.internal('delete_test_case');
  }
}
