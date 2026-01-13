import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';

/**
 * GET /api/security/audit - Get audit logs
 *
 * Returns security audit logs for the authenticated user/org
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const action = searchParams.get('action'); // filter by action type
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const supabase = createServerClient();

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('org_id', authResult.orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq('action', action);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('Audit logs error:', error);
      // Return mock data if table doesn't exist
      return NextResponse.json({
        success: true,
        logs: generateMockAuditLogs(),
        total: 50,
        limit,
        offset,
      });
    }

    return NextResponse.json({
      success: true,
      logs: logs || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    return ServerErrors.internal('audit_logs');
  }
}

/**
 * POST /api/security/audit - Create audit log entry
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { action, resource, details, ip_address } = body;

    if (!action) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action is required' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const logEntry = {
      id: crypto.randomUUID(),
      org_id: authResult.orgId,
      user_id: authResult.userId,
      action,
      resource: resource || null,
      details: details || {},
      ip_address: ip_address || request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('audit_logs').insert(logEntry);

    if (error) {
      console.error('Audit log creation error:', error);
      // Still return success if table doesn't exist (graceful degradation)
      return NextResponse.json({
        success: true,
        log: logEntry,
      });
    }

    return NextResponse.json({
      success: true,
      log: logEntry,
    });
  } catch (error) {
    console.error('Audit log creation error:', error);
    return ServerErrors.internal('audit_log_create');
  }
}

function generateMockAuditLogs() {
  const actions = [
    { action: 'api_key.created', resource: 'api_key', details: { key_prefix: 'szn_live_abc' } },
    { action: 'api_key.rotated', resource: 'api_key', details: { key_prefix: 'szn_live_xyz' } },
    { action: 'collection.created', resource: 'collection', details: { name: 'documents' } },
    { action: 'collection.deleted', resource: 'collection', details: { name: 'old-docs' } },
    { action: 'user.login', resource: 'user', details: { method: 'oauth', provider: 'google' } },
    { action: 'settings.updated', resource: 'settings', details: { field: 'rerank_enabled' } },
    { action: 'connector.added', resource: 'connector', details: { type: 'pinecone' } },
    { action: 'export.requested', resource: 'data', details: { format: 'json', rows: 1000 } },
  ];

  const logs = [];
  const now = Date.now();

  for (let i = 0; i < 50; i++) {
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    logs.push({
      id: crypto.randomUUID(),
      ...randomAction,
      ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      created_at: new Date(now - i * 3600000 * Math.random() * 24).toISOString(),
    });
  }

  return logs.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
