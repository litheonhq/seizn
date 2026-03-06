import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

type SupabaseInsertError = { code?: string | null; message?: string | null };

function isAuditLogsMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as SupabaseInsertError;
  const message = (maybe.message || '').toLowerCase();
  return (
    maybe.code === 'PGRST205' &&
    message.includes("could not find the table 'public.audit_logs'")
  );
}

// GET /api/audit-logs - Get audit logs
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const action = searchParams.get('action');
    const resourceType = searchParams.get('resource_type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    const buildQuery = (tableName: 'audit_logs' | 'audit_log') => {
      let query = supabase
        .from(tableName)
        .select(`
          id,
          user_id,
          organization_id,
          action,
          resource_type,
          resource_id,
          details,
          status,
          ip_address,
          created_at,
          user:profiles (
            email,
            full_name
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      } else {
        query = query.eq('user_id', user.id);
      }
      if (action) {
        query = query.eq('action', action);
      }
      if (resourceType) {
        query = query.eq('resource_type', resourceType);
      }
      return query;
    };

    // Filter by org (requires admin role)
    if (orgId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', user.id)
        .single();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json({ error: 'Not authorized to view org audit logs' }, { status: 403 });
      }
    }

    let { data: logs, error, count } = await buildQuery('audit_logs');

    if (error && isAuditLogsMissingError(error)) {
      const legacy = await buildQuery('audit_log');
      logs = legacy.data;
      error = legacy.error;
      count = legacy.count;
    }

    if (error) {
      logServerError('Fetch audit logs error', error);
      return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      logs: logs || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    logServerError('Audit logs GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

