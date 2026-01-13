/**
 * Test Cases API
 *
 * GET /api/testing/cases - List test cases (with filters)
 * POST /api/testing/cases - Create new test case
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
import type { CreateTestCaseRequest } from '@/lib/testing/types';

// GET /api/testing/cases
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Required: suite_id
    const suiteId = searchParams.get('suite_id');
    if (!suiteId) {
      return ValidationErrors.missingField('suite_id');
    }

    // Optional filters
    const testType = searchParams.get('test_type');
    const result = searchParams.get('result');
    const isActive = searchParams.get('active') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    // Verify suite access
    const { data: suite } = await supabase
      .from('retrieval_test_suites')
      .select('id')
      .eq('id', suiteId)
      .eq('user_id', userId)
      .single();

    if (!suite) {
      return NotFoundErrors.resource('Test suite');
    }

    // Build query
    let query = supabase
      .from('retrieval_test_cases')
      .select('*', { count: 'exact' })
      .eq('suite_id', suiteId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isActive) {
      query = query.eq('is_active', true);
    }

    if (testType) {
      query = query.eq('test_type', testType);
    }

    if (result) {
      query = query.eq('last_result', result);
    }

    const { data: cases, error, count } = await query;

    if (error) {
      await logRequest(
        { userId, keyId, endpoint: '/api/testing/cases', method: 'GET', startTime },
        500
      );
      return ServerErrors.database('list_test_cases');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/testing/cases', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: cases,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: count ? offset + limit < count : false,
      },
    });
  } catch (error) {
    console.error('List test cases error:', error);
    return ServerErrors.internal('list_test_cases');
  }
}

// POST /api/testing/cases
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: CreateTestCaseRequest & { suite_id: string } = await request.json();

    // Validate required fields
    if (!body.suite_id) {
      return ValidationErrors.missingField('suite_id');
    }

    if (!body.query || body.query.trim().length === 0) {
      return ValidationErrors.missingField('query');
    }

    const supabase = createServerClient();

    // Verify suite access
    const { data: suite } = await supabase
      .from('retrieval_test_suites')
      .select('id')
      .eq('id', body.suite_id)
      .eq('user_id', userId)
      .single();

    if (!suite) {
      return NotFoundErrors.resource('Test suite');
    }

    // Create test case
    const { data: testCase, error } = await supabase
      .from('retrieval_test_cases')
      .insert({
        suite_id: body.suite_id,
        name: body.name,
        query: body.query.trim(),
        test_type: body.test_type || 'positive',
        expected_doc_ids: body.expected_doc_ids || [],
        expected_keywords: body.expected_keywords || [],
        expected_not_keywords: body.expected_not_keywords || [],
        min_score: body.min_score || 0.7,
        max_latency_ms: body.max_latency_ms || 5000,
        metadata: body.metadata || {},
      })
      .select()
      .single();

    if (error) {
      await logRequest(
        { userId, keyId, endpoint: '/api/testing/cases', method: 'POST', startTime },
        500
      );
      return ServerErrors.database('create_test_case');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/testing/cases', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: testCase,
    });
  } catch (error) {
    console.error('Create test case error:', error);
    return ServerErrors.internal('create_test_case');
  }
}
