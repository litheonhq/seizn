/**
 * Winter Governance - Audit Log API
 *
 * GET /api/winter/org/[orgId]/audit - Query audit logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getUserOrgRole,
  queryAuditLogs,
  getAuditSummary,
  getSecurityEvents,
  getAdminEvents,
  exportAuditLogsAsCsv,
  type AuditAction,
  type ResourceType,
} from '@/lib/winter/org';

// Helper to get user from session token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/audit
 * Query audit logs with filters
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Not authorized to view organization audit logs' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Check for special modes
    const mode = searchParams.get('mode');

    // Summary mode
    if (mode === 'summary') {
      const startDate = searchParams.get('start_date')
        ? new Date(searchParams.get('start_date')!)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = searchParams.get('end_date')
        ? new Date(searchParams.get('end_date')!)
        : new Date();

      const summary = await getAuditSummary(orgId, startDate, endDate);

      return NextResponse.json({
        success: true,
        summary,
      });
    }

    // Security events mode
    if (mode === 'security') {
      const startDate = searchParams.get('start_date')
        ? new Date(searchParams.get('start_date')!)
        : undefined;
      const limit = parseInt(searchParams.get('limit') || '100');

      const events = await getSecurityEvents(orgId, startDate, limit);

      return NextResponse.json({
        success: true,
        events,
        count: events.length,
      });
    }

    // Admin events mode
    if (mode === 'admin') {
      const startDate = searchParams.get('start_date')
        ? new Date(searchParams.get('start_date')!)
        : undefined;
      const limit = parseInt(searchParams.get('limit') || '100');

      const events = await getAdminEvents(orgId, startDate, limit);

      return NextResponse.json({
        success: true,
        events,
        count: events.length,
      });
    }

    // Export mode
    if (mode === 'export') {
      const startDate = searchParams.get('start_date') || undefined;
      const endDate = searchParams.get('end_date') || undefined;

      const csv = await exportAuditLogsAsCsv({
        organization_id: orgId,
        start_date: startDate,
        end_date: endDate,
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${orgId}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Default: query with filters
    const action = searchParams.get('action') as AuditAction | undefined;
    const resourceType = searchParams.get('resource_type') as ResourceType | undefined;
    const userId = searchParams.get('user_id') || undefined;
    const resourceId = searchParams.get('resource_id') || undefined;
    const status = searchParams.get('status') as 'success' | 'failed' | 'denied' | undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await queryAuditLogs({
      organization_id: orgId,
      action,
      resource_type: resourceType,
      user_id: userId,
      resource_id: resourceId,
      status,
      start_date: startDate,
      end_date: endDate,
      limit: Math.min(limit, 100),
      offset,
    });

    return NextResponse.json({
      success: true,
      logs: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      has_more: result.has_more,
    });
  } catch (error) {
    console.error('[WinterOrg Audit] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
