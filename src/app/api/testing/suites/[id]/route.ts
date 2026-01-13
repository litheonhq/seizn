/**
 * Test Suite Detail API
 *
 * GET /api/testing/suites/[id] - Get suite details
 * PATCH /api/testing/suites/[id] - Update suite
 * DELETE /api/testing/suites/[id] - Delete suite
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

// GET /api/testing/suites/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: suiteId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    // Get suite with stats
    const { data: suite, error: suiteError } = await supabase
      .from('retrieval_test_suites')
      .select('*')
      .eq('id', suiteId)
      .eq('user_id', userId)
      .single();

    if (suiteError || !suite) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'GET', startTime },
        404
      );
      return NotFoundErrors.resource('Test suite');
    }

    // Get statistics
    const { data: stats } = await supabase.rpc('get_test_suite_stats', {
      p_suite_id: suiteId,
    });

    // Get recent runs
    const { data: recentRuns } = await supabase
      .from('retrieval_test_runs')
      .select('id, status, passed, failed, skipped, total_cases, created_at')
      .eq('suite_id', suiteId)
      .order('created_at', { ascending: false })
      .limit(5);

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: {
        ...suite,
        stats: stats?.[0] || null,
        recent_runs: recentRuns || [],
      },
    });
  } catch (error) {
    console.error('Get test suite error:', error);
    return ServerErrors.internal('get_test_suite');
  }
}

// PATCH /api/testing/suites/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: suiteId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();
    const supabase = createServerClient();

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.collection_id !== undefined) updates.collection_id = body.collection_id;
    if (body.config !== undefined) updates.config = body.config;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return ValidationErrors.missingField('at least one field to update');
    }

    updates.updated_at = new Date().toISOString();

    const { data: suite, error } = await supabase
      .from('retrieval_test_suites')
      .update(updates)
      .eq('id', suiteId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !suite) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'PATCH', startTime },
        500
      );
      return ServerErrors.database('update_test_suite');
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'PATCH', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: suite,
    });
  } catch (error) {
    console.error('Update test suite error:', error);
    return ServerErrors.internal('update_test_suite');
  }
}

// DELETE /api/testing/suites/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: suiteId } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    // Soft delete (set is_active = false)
    const { searchParams } = new URL(request.url);
    const hard = searchParams.get('hard') === 'true';

    if (hard) {
      // Hard delete (cascades to test cases and runs)
      const { error } = await supabase
        .from('retrieval_test_suites')
        .delete()
        .eq('id', suiteId)
        .eq('user_id', userId);

      if (error) {
        await logRequest(
          { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'DELETE', startTime },
          500
        );
        return ServerErrors.database('delete_test_suite');
      }
    } else {
      // Soft delete
      const { error } = await supabase
        .from('retrieval_test_suites')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', suiteId)
        .eq('user_id', userId);

      if (error) {
        await logRequest(
          { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'DELETE', startTime },
          500
        );
        return ServerErrors.database('delete_test_suite');
      }
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/suites/${suiteId}`, method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: suiteId,
      hard,
    });
  } catch (error) {
    console.error('Delete test suite error:', error);
    return ServerErrors.internal('delete_test_suite');
  }
}
