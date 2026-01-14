import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

/**
 * GET /api/dashboard/activity
 * Get recent API activity (last N requests)
 *
 * Query params:
 * - limit: Number of results (default: 10, max: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const supabase = createServerClient();
    const userId = session.user.id;

    // Get recent activity logs
    const { data: logs, error: logsError } = await supabase
      .from('usage_logs')
      .select(`
        id,
        endpoint,
        method,
        status_code,
        embedding_tokens,
        cost_cents,
        latency_ms,
        api_key_id,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (logsError) {
      console.error('Activity logs error:', logsError);
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }

    // Get API key prefixes for display
    const keyIds = [...new Set((logs || []).map(l => l.api_key_id).filter(Boolean))];
    let keyMap = new Map<string, string>();

    if (keyIds.length > 0) {
      const { data: keys } = await supabase
        .from('api_keys')
        .select('id, key_prefix')
        .in('id', keyIds);

      keyMap = new Map(keys?.map(k => [k.id, k.key_prefix]) || []);
    }

    // Format activity logs
    const activity = (logs || []).map(log => ({
      id: log.id,
      endpoint: log.endpoint,
      method: log.method,
      status: log.status_code || 200,
      statusCategory: getStatusCategory(log.status_code),
      latencyMs: log.latency_ms,
      costCents: log.cost_cents,
      keyPrefix: log.api_key_id ? keyMap.get(log.api_key_id) || '???' : 'direct',
      timestamp: log.created_at,
      tokens: log.embedding_tokens,
    }));

    // Calculate quick stats
    const stats = {
      totalRequests: activity.length,
      successCount: activity.filter(a => a.status < 400).length,
      errorCount: activity.filter(a => a.status >= 400).length,
      avgLatencyMs: activity.length > 0
        ? Math.round(activity.reduce((sum, a) => sum + (a.latencyMs || 0), 0) / activity.length)
        : 0,
    };

    return NextResponse.json({
      success: true,
      activity,
      stats,
    });
  } catch (error) {
    console.error('Activity fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getStatusCategory(statusCode: number | null): 'success' | 'redirect' | 'client_error' | 'server_error' {
  if (!statusCode || statusCode < 300) return 'success';
  if (statusCode < 400) return 'redirect';
  if (statusCode < 500) return 'client_error';
  return 'server_error';
}
