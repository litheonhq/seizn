/**
 * Winter Governance - Reports API
 *
 * GET  /api/winter/org/[orgId]/reports - List reports
 * POST /api/winter/org/[orgId]/reports - Generate report
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  getUserOrgRole,
  listReports,
  generateReport,
  getReport,
  type ReportType,
} from '@/lib/winter/org';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/reports
 * List existing reports or get a specific report
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user has access
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Get specific report by ID
    const reportId = searchParams.get('report_id');
    if (reportId) {
      const report = await getReport(reportId);

      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }

      // Verify report belongs to this org
      if (report.organization_id !== orgId) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        report,
      });
    }

    // List reports
    const reportType = searchParams.get('type') as ReportType | undefined;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await listReports({
      organization_id: orgId,
      report_type: reportType,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      reports: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      has_more: result.has_more,
    });
  } catch (error) {
    console.error('[WinterOrg Reports] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/winter/org/[orgId]/reports
 * Generate a new report
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to generate reports' }, { status: 403 });
    }

    const body = await request.json();
    const { report_type, period_start, period_end } = body;

    if (!report_type) {
      return NextResponse.json({ error: 'Report type is required' }, { status: 400 });
    }

    // Validate report type
    const validTypes: ReportType[] = [
      'usage_monthly',
      'usage_weekly',
      'security_events',
      'compliance_gdpr',
      'compliance_soc2',
      'member_activity',
      'api_usage',
      'cost_analysis',
    ];

    if (!validTypes.includes(report_type)) {
      return NextResponse.json(
        { error: 'Invalid report type', valid_types: validTypes },
        { status: 400 }
      );
    }

    const report = await generateReport({
      organization_id: orgId,
      report_type,
      period_start: period_start ? new Date(period_start) : undefined,
      period_end: period_end ? new Date(period_end) : undefined,
      generated_by: 'user',
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('[WinterOrg Reports] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
