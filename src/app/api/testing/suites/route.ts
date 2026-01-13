/**
 * Test Suites API
 *
 * GET /api/testing/suites - List test suites
 * POST /api/testing/suites - Create new test suite
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import type { CreateSuiteRequest } from '@/lib/testing/types';

// GET /api/testing/suites - List test suites
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse query params
    const collectionId = searchParams.get('collection_id');
    const isActive = searchParams.get('active') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    let query = supabase
      .from('retrieval_test_suites')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isActive) {
      query = query.eq('is_active', true);
    }

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data: suites, error, count } = await query;

    if (error) {
      console.error('List suites error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/testing/suites', method: 'GET', startTime },
        500
      );
      return ServerErrors.database('list_test_suites');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/testing/suites', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: suites,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: count ? offset + limit < count : false,
      },
    });
  } catch (error) {
    console.error('List test suites error:', error);
    return ServerErrors.internal('list_test_suites');
  }
}

// POST /api/testing/suites - Create new test suite
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: CreateSuiteRequest = await request.json();

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/testing/suites', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('name');
    }

    const supabase = createServerClient();

    // Create suite
    const { data: suite, error } = await supabase
      .from('retrieval_test_suites')
      .insert({
        user_id: userId,
        name: body.name.trim(),
        description: body.description,
        collection_id: body.collection_id,
        config: body.config || {},
        tags: body.tags || [],
        generated_by: 'manual',
      })
      .select()
      .single();

    if (error) {
      console.error('Create suite error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/testing/suites', method: 'POST', startTime },
        500
      );
      return ServerErrors.database('create_test_suite');
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/testing/suites', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: suite,
    });
  } catch (error) {
    console.error('Create test suite error:', error);
    return ServerErrors.internal('create_test_suite');
  }
}
