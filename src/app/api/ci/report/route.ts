/**
 * Seizn CI API - Report Endpoint
 *
 * POST /api/ci/report - Create CI report
 * GET /api/ci/report - List CI reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import type {
  CreateReportRequest,
  CreateReportResponse,
  CIReport,
  CIReportRecord,
  CIFinding,
} from '../types';

// ============================================
// POST /api/ci/report - Create CI report
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
    let body: CreateReportRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.metadata) {
      return ValidationErrors.missingField('metadata');
    }
    if (!body.traceSummary) {
      return ValidationErrors.missingField('traceSummary');
    }
    if (!body.findings) {
      return ValidationErrors.missingField('findings');
    }
    if (!body.recommendations) {
      return ValidationErrors.missingField('recommendations');
    }

    // Validate metadata
    if (!body.metadata.traceId || !body.metadata.runId || !body.metadata.commitSha) {
      return ValidationErrors.invalidField(
        'metadata',
        'Must contain traceId, runId, and commitSha'
      );
    }

    // Calculate report status
    const status = calculateReportStatus(body.findings);

    // Generate report ID
    const reportId = randomUUID();

    // Prepare record
    const record: Omit<CIReportRecord, 'created_at'> = {
      id: reportId,
      user_id: userId,
      metadata: body.metadata,
      trace_summary: body.traceSummary,
      test_summary: body.testSummary,
      findings: body.findings,
      recommendations: body.recommendations,
      status,
    };

    // Save to database
    const supabase = createServerClient();
    const { error: insertError } = await supabase
      .from('ci_reports')
      .insert(record);

    if (insertError) {
      console.error('CI report insert error:', insertError);
      return ServerErrors.database('insert ci_reports');
    }

    // Link to trace record if exists
    if (body.metadata.traceId) {
      await supabase
        .from('ci_traces')
        .update({ report_id: reportId })
        .eq('trace_id', body.metadata.traceId)
        .eq('user_id', userId);
    }

    // Build response
    const response: CreateReportResponse = {
      success: true,
      reportId,
      status,
      url: `https://seizn.com/dashboard/ci/reports/${reportId}`,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error('CI report create error:', err);
    return ServerErrors.internal('ci_report_create');
  }
}

// ============================================
// GET /api/ci/report - List CI reports
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
    const status = url.searchParams.get('status') as CIReport['status'] | null;
    const branch = url.searchParams.get('branch');
    const prNumber = url.searchParams.get('pr_number');

    // Build query
    const supabase = createServerClient();
    let query = supabase
      .from('ci_reports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (branch) {
      query = query.eq('metadata->>branch', branch);
    }
    if (prNumber) {
      query = query.eq('metadata->>prNumber', parseInt(prNumber, 10));
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('CI reports list error:', error);
      return ServerErrors.database('list ci_reports');
    }

    // Transform records to API format
    const reports = (data ?? []).map((record: CIReportRecord) => ({
      id: record.id,
      metadata: record.metadata,
      traceSummary: record.trace_summary,
      testSummary: record.test_summary,
      findingsCount: record.findings.length,
      recommendationsCount: record.recommendations.length,
      status: record.status,
      createdAt: record.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        reports,
        pagination: {
          limit,
          offset,
          total: count ?? reports.length,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('CI reports list error:', err);
    return ServerErrors.internal('ci_reports_list');
  }
}

// ============================================
// Helper Functions
// ============================================

function calculateReportStatus(findings: CIFinding[]): CIReport['status'] {
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;

  if (criticalCount > 0) {
    return 'failed';
  }
  if (highCount > 0) {
    return 'warning';
  }
  return 'passed';
}
