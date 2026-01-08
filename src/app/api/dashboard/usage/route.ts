import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

// GET /api/dashboard/usage - Get detailed usage analytics
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d'; // 7d, 30d, 90d

    const supabase = createServerClient();
    const userId = session.user.id;

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    let groupBy: 'day' | 'week' = 'day';

    switch (period) {
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        groupBy = 'week';
        break;
      default: // 7d
        startDate.setDate(now.getDate() - 7);
    }

    // Get usage logs for the period
    const { data: logs, error: logsError } = await supabase
      .from('usage_logs')
      .select('endpoint, method, status_code, embedding_tokens, cost_cents, latency_ms, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (logsError) {
      console.error('Usage logs error:', logsError);
      return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 });
    }

    // Process data for charts
    const dailyUsage = processDaily(logs || [], startDate, now);
    const endpointBreakdown = processEndpoints(logs || []);
    const summary = calculateSummary(logs || []);

    // Get per-API-key usage
    const { data: keyUsage, error: keyError } = await supabase
      .from('usage_logs')
      .select('api_key_id, endpoint')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    const apiKeyBreakdown = processApiKeyUsage(keyUsage || []);

    // Get API key names
    const { data: keys } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix')
      .eq('user_id', userId);

    const keyMap = new Map(keys?.map(k => [k.id, { name: k.name, prefix: k.key_prefix }]) || []);

    // Add names to key breakdown
    const apiKeyStats = apiKeyBreakdown.map(k => ({
      ...k,
      name: keyMap.get(k.keyId)?.name || 'Unknown',
      prefix: keyMap.get(k.keyId)?.prefix || '???',
    }));

    return NextResponse.json({
      success: true,
      period,
      usage: {
        daily: dailyUsage,
        endpoints: endpointBreakdown,
        apiKeys: apiKeyStats,
        summary,
      },
    });
  } catch (error) {
    console.error('Usage analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface LogEntry {
  endpoint: string;
  method: string;
  status_code: number | null;
  embedding_tokens: number;
  cost_cents: number;
  latency_ms: number | null;
  created_at: string;
}

function processDaily(logs: LogEntry[], startDate: Date, endDate: Date) {
  const daily: Record<string, { calls: number; tokens: number; cost: number }> = {};

  // Initialize all days
  const current = new Date(startDate);
  while (current <= endDate) {
    const key = current.toISOString().split('T')[0];
    daily[key] = { calls: 0, tokens: 0, cost: 0 };
    current.setDate(current.getDate() + 1);
  }

  // Fill in actual data
  for (const log of logs) {
    const key = log.created_at.split('T')[0];
    if (daily[key]) {
      daily[key].calls += 1;
      daily[key].tokens += log.embedding_tokens || 0;
      daily[key].cost += log.cost_cents || 0;
    }
  }

  return Object.entries(daily).map(([date, data]) => ({
    date,
    ...data,
  }));
}

function processEndpoints(logs: LogEntry[]) {
  const endpoints: Record<string, { calls: number; avgLatency: number; errors: number }> = {};

  for (const log of logs) {
    const key = `${log.method} ${log.endpoint}`;
    if (!endpoints[key]) {
      endpoints[key] = { calls: 0, avgLatency: 0, errors: 0 };
    }
    endpoints[key].calls += 1;
    if (log.latency_ms) {
      endpoints[key].avgLatency += log.latency_ms;
    }
    if (log.status_code && log.status_code >= 400) {
      endpoints[key].errors += 1;
    }
  }

  // Calculate averages
  return Object.entries(endpoints)
    .map(([endpoint, data]) => ({
      endpoint,
      calls: data.calls,
      avgLatency: Math.round(data.avgLatency / data.calls),
      errors: data.errors,
      errorRate: Math.round((data.errors / data.calls) * 100),
    }))
    .sort((a, b) => b.calls - a.calls);
}

function processApiKeyUsage(logs: { api_key_id: string | null; endpoint: string }[]) {
  const keys: Record<string, number> = {};

  for (const log of logs) {
    const keyId = log.api_key_id || 'direct';
    keys[keyId] = (keys[keyId] || 0) + 1;
  }

  return Object.entries(keys)
    .map(([keyId, calls]) => ({ keyId, calls }))
    .sort((a, b) => b.calls - a.calls);
}

function calculateSummary(logs: LogEntry[]) {
  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + (l.embedding_tokens || 0), 0);
  const totalCost = logs.reduce((sum, l) => sum + (l.cost_cents || 0), 0);
  const totalErrors = logs.filter(l => l.status_code && l.status_code >= 400).length;
  const avgLatency = logs.length > 0
    ? Math.round(logs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / logs.length)
    : 0;

  return {
    totalCalls,
    totalTokens,
    totalCostCents: totalCost,
    totalCostDollars: (totalCost / 100).toFixed(2),
    totalErrors,
    errorRate: totalCalls > 0 ? Math.round((totalErrors / totalCalls) * 100) : 0,
    avgLatency,
  };
}
