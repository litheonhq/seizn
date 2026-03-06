/**
 * Team Audit Logs API
 *
 * GET /api/teams/[id]/audit-logs - Retrieve audit logs for a team
 *
 * Requires admin or owner role to access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { requirePermission, PermissionDeniedError, NotTeamMemberError } from '@/lib/rbac';
import { Permissions } from '@/lib/rbac/types';
import { getTeamAuditLogs, AuditLogQuery } from '@/lib/audit/logger';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/teams/[id]/audit-logs
 *
 * Query parameters:
 * - action: Filter by action type (e.g., "member.invite")
 * - resource_type: Filter by resource type (e.g., "member", "api_key")
 * - user_id: Filter by actor user ID
 * - status: Filter by status (success, failed, denied)
 * - start_date: ISO date string for start of range
 * - end_date: ISO date string for end of range
 * - limit: Number of results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await context.params;

    // Authenticate user
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }

    // Check permission to view audit logs (admin or owner)
    try {
      await requirePermission(user.id, teamId, Permissions.AUDIT_LOG_VIEW);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'PERMISSION_DENIED',
              message: 'You do not have permission to view audit logs for this team',
              details: {
                permission: error.permission,
                teamId: error.teamId,
              },
            },
          },
          { status: 403 }
        );
      }

      if (error instanceof NotTeamMemberError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'NOT_TEAM_MEMBER',
              message: 'You are not a member of this team',
              details: {
                teamId: error.teamId,
              },
            },
          },
          { status: 403 }
        );
      }

      throw error;
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);

    const query: AuditLogQuery = {
      teamId,
      action: searchParams.get('action') || undefined,
      resourceType: searchParams.get('resource_type') || undefined,
      userId: searchParams.get('user_id') || undefined,
      status: (searchParams.get('status') as 'success' | 'failed' | 'denied') || undefined,
      startDate: searchParams.get('start_date')
        ? new Date(searchParams.get('start_date')!)
        : undefined,
      endDate: searchParams.get('end_date')
        ? new Date(searchParams.get('end_date')!)
        : undefined,
      limit: parseInt(searchParams.get('limit') || '50'),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    // Validate limit
    if (query.limit && (query.limit < 1 || query.limit > 100)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Limit must be between 1 and 100',
          },
        },
        { status: 400 }
      );
    }

    // Fetch audit logs
    const { logs, total } = await getTeamAuditLogs(query);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: (query.offset || 0) + logs.length < total,
      },
    });
  } catch (error) {
    logServerError('Team audit logs GET error', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch audit logs',
        },
      },
      { status: 500 }
    );
  }
}
