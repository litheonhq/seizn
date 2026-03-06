import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { getFederatedOperationLogs, type FederatedOperation, type FederatedResourceType } from '@/lib/summer/admin';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/admin/federated/audit
 *
 * Get federated operation audit logs with filters.
 *
 * Query params:
 * - organization_id?: string
 * - operation?: FederatedOperation
 * - resource_type?: FederatedResourceType
 * - resource_id?: string
 * - status?: 'success' | 'failed' | 'denied'
 * - start_date?: ISO date string
 * - end_date?: ISO date string
 * - limit?: number (default 50, max 100)
 * - offset?: number (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);

    const organizationId = url.searchParams.get('organization_id') ?? undefined;
    const operation = url.searchParams.get('operation') as FederatedOperation | undefined;
    const resourceType = url.searchParams.get('resource_type') as FederatedResourceType | undefined;
    const resourceId = url.searchParams.get('resource_id') ?? undefined;
    const status = url.searchParams.get('status') as 'success' | 'failed' | 'denied' | undefined;
    const startDateStr = url.searchParams.get('start_date');
    const endDateStr = url.searchParams.get('end_date');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Get logs (filtered by user or org based on permissions)
    const { logs, total } = await getFederatedOperationLogs({
      userId: organizationId ? undefined : userId, // If org specified, rely on RLS
      organizationId,
      operation,
      resourceType,
      resourceId,
      status,
      startDate,
      endDate,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      logs: logs.map((log) => ({
        id: log.id,
        user_id: log.userId,
        organization_id: log.organizationId,
        operation: log.operation,
        resource_type: log.resourceType,
        resource_id: log.resourceId,
        details: log.details,
        status: log.status,
        error_message: log.errorMessage,
        created_at: log.createdAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + logs.length < total,
      },
    });
  } catch (err) {
    logServerError('Get federated audit logs failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
