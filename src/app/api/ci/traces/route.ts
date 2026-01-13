/**
 * Seizn CI API - Traces Endpoint
 *
 * POST /api/ci/traces - Upload CI traces
 * GET /api/ci/traces - List CI trace collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import {
  ErrorCodes as _ErrorCodes,
  createApiError as _createApiError,
  ValidationErrors,
  ServerErrors,
} from '@/lib/api-error';
import type {
  CITraceCollection as _CITraceCollection,
  UploadTracesRequest,
  UploadTracesResponse,
  CITraceRecord,
} from '../types';

// ============================================
// POST /api/ci/traces - Upload CI traces
// ============================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse request body
    let body: UploadTracesRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.traces) {
      return ValidationErrors.missingField('traces');
    }

    const { traces } = body;

    // Validate trace collection structure
    if (!traces.metadata || !traces.traces || !traces.summary) {
      return ValidationErrors.invalidField(
        'traces',
        'Must contain metadata, traces array, and summary'
      );
    }

    // Validate metadata
    if (!traces.metadata.traceId || !traces.metadata.runId) {
      return ValidationErrors.invalidField(
        'traces.metadata',
        'Must contain traceId and runId'
      );
    }

    // Generate record ID
    const recordId = randomUUID();

    // Prepare record
    const record: Omit<CITraceRecord, 'created_at'> = {
      id: recordId,
      user_id: userId,
      trace_id: traces.metadata.traceId,
      run_id: traces.metadata.runId,
      commit_sha: traces.metadata.commitSha,
      branch: traces.metadata.branch,
      pr_number: traces.metadata.prNumber,
      provider: traces.metadata.provider,
      repository_owner: traces.metadata.repository.owner,
      repository_name: traces.metadata.repository.name,
      traces_data: traces.traces,
      summary: traces.summary,
    };

    // Save to database
    const supabase = createServerClient();
    const { error: insertError } = await supabase
      .from('ci_traces')
      .insert(record);

    if (insertError) {
      console.error('CI traces insert error:', insertError);
      return ServerErrors.database('insert ci_traces');
    }

    // Build response
    const response: UploadTracesResponse = {
      success: true,
      traceId: traces.metadata.traceId,
      uploadedCount: traces.traces.length,
      url: `https://seizn.com/dashboard/ci/traces/${recordId}`,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error('CI traces upload error:', err);
    return ServerErrors.internal('ci_traces_upload');
  }
}

// ============================================
// GET /api/ci/traces - List CI trace collections
// ============================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse query parameters
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const branch = url.searchParams.get('branch');
    const prNumber = url.searchParams.get('pr_number');
    const provider = url.searchParams.get('provider');

    // Build query
    const supabase = createServerClient();
    let query = supabase
      .from('ci_traces')
      .select(
        'id, trace_id, run_id, commit_sha, branch, pr_number, provider, repository_owner, repository_name, summary, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (branch) {
      query = query.eq('branch', branch);
    }
    if (prNumber) {
      query = query.eq('pr_number', parseInt(prNumber, 10));
    }
    if (provider) {
      query = query.eq('provider', provider);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('CI traces list error:', error);
      return ServerErrors.database('list ci_traces');
    }

    return NextResponse.json(
      {
        success: true,
        traces: data ?? [],
        pagination: {
          limit,
          offset,
          total: count ?? data?.length ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('CI traces list error:', err);
    return ServerErrors.internal('ci_traces_list');
  }
}
