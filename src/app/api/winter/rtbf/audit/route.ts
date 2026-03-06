/**
 * GET /api/winter/rtbf/audit
 *
 * Query RTBF audit logs for compliance reporting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  queryAuditLogs,
  getAuditStatistics,
  generateComplianceReport,
  ErasureScope,
  ErasureStatus,
} from '@/lib/winter/rtbf';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action'); // 'list', 'stats', or 'report'
    const scope = searchParams.get('scope') as ErasureScope | null;
    const status = searchParams.get('status') as ErasureStatus | null;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    // Action: statistics
    if (action === 'stats') {
      const stats = await getAuditStatistics(userId);
      return NextResponse.json({ statistics: stats });
    }

    // Action: compliance report
    if (action === 'report') {
      if (!dateFrom || !dateTo) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_REQUEST',
              message: 'date_from and date_to are required for compliance report',
            },
          },
          { status: 400 }
        );
      }

      const report = await generateComplianceReport(dateFrom, dateTo, userId);
      return NextResponse.json({ report });
    }

    // Default: list audit logs
    const result = await queryAuditLogs({
      userId,
      scope: scope || undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      perPage: Math.min(perPage, 100), // Max 100 per page
    });

    return NextResponse.json({
      logs: result.logs.map((log) => ({
        id: log.id,
        request_id: log.request_id,
        subject_id: log.subject_id,
        scope: log.scope,
        status: log.status,
        phase: log.phase,
        affected_tables: log.affected_tables,
        affected_count: log.affected_count,
        verification_hash: log.verification_hash,
        requested_at: log.requested_at,
        completed_at: log.completed_at,
        error: log.error,
      })),
      pagination: {
        total: result.total_count,
        page: result.page,
        per_page: result.per_page,
        total_pages: Math.ceil(result.total_count / result.per_page),
      },
    });
  } catch (err) {
    logServerError('RTBF audit error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to query audit logs' } },
      { status: 500 }
    );
  }
}
