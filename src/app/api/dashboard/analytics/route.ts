import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

// GET /api/dashboard/analytics - Get detailed analytics data
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    const orgId = searchParams.get('orgId');

    const supabase = createServerClient();
    const userId = session.user.id;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const previousStartDate = new Date();

    switch (period) {
      case '30d':
        startDate.setDate(now.getDate() - 30);
        previousStartDate.setDate(now.getDate() - 60);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        previousStartDate.setDate(now.getDate() - 180);
        break;
      default: // 7d
        startDate.setDate(now.getDate() - 7);
        previousStartDate.setDate(now.getDate() - 14);
    }

    // Build query for current period
    let logsQuery = supabase
      .from('usage_logs')
      .select('endpoint, method, status_code, embedding_tokens, cost_cents, latency_ms, created_at, user_id')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    // Build query for previous period (for comparison)
    let previousLogsQuery = supabase
      .from('usage_logs')
      .select('endpoint, method, status_code, embedding_tokens, cost_cents, latency_ms, created_at')
      .eq('user_id', userId)
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString());

    // Filter by organization if specified
    if (orgId) {
      // Get org member check
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .single();

      if (!membership) {
        return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
      }

      // Filter logs by org (assuming org_id field exists in usage_logs)
      logsQuery = logsQuery.eq('organization_id', orgId);
      previousLogsQuery = previousLogsQuery.eq('organization_id', orgId);
    }

    const [{ data: logs, error: logsError }, { data: previousLogs }] = await Promise.all([
      logsQuery,
      previousLogsQuery,
    ]);

    if (logsError) {
      console.error('Analytics logs error:', logsError);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    // Process data
    const daily = processDaily(logs || [], startDate, now);
    const hourlyDistribution = processHourly(logs || []);
    const topQueries = processTopQueries(logs || []);
    const endpointBreakdown = processEndpointBreakdown(logs || []);
    const summary = calculateSummary(logs || [], previousLogs || []);

    return NextResponse.json({
      success: true,
      period,
      analytics: {
        daily,
        hourlyDistribution,
        topQueries,
        endpointBreakdown,
        summary,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
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
  user_id?: string;
}

function processDaily(logs: LogEntry[], startDate: Date, endDate: Date) {
  const daily: Record<string, {
    activeUsers: Set<string>;
    apiCalls: number;
    memoryStores: number;
    memorySearches: number;
    latencies: number[];
    errors: number;
  }> = {};

  // Initialize all days
  const current = new Date(startDate);
  while (current <= endDate) {
    const key = current.toISOString().split('T')[0];
    daily[key] = {
      activeUsers: new Set(),
      apiCalls: 0,
      memoryStores: 0,
      memorySearches: 0,
      latencies: [],
      errors: 0,
    };
    current.setDate(current.getDate() + 1);
  }

  // Fill in actual data
  for (const log of logs) {
    const key = log.created_at.split('T')[0];
    if (daily[key]) {
      if (log.user_id) {
        daily[key].activeUsers.add(log.user_id);
      }
      daily[key].apiCalls += 1;

      // Categorize by endpoint
      if (log.endpoint?.includes('/memories') && log.method === 'POST') {
        daily[key].memoryStores += 1;
      } else if (log.endpoint?.includes('/memories') && log.method === 'GET') {
        daily[key].memorySearches += 1;
      }

      if (log.latency_ms) {
        daily[key].latencies.push(log.latency_ms);
      }
      if (log.status_code && log.status_code >= 400) {
        daily[key].errors += 1;
      }
    }
  }

  return Object.entries(daily).map(([date, data]) => ({
    date,
    activeUsers: data.activeUsers.size || 1, // At least 1 user (current user)
    apiCalls: data.apiCalls,
    memoryStores: data.memoryStores,
    memorySearches: data.memorySearches,
    avgLatency: data.latencies.length > 0
      ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
      : 0,
    errors: data.errors,
    errorRate: data.apiCalls > 0
      ? Math.round((data.errors / data.apiCalls) * 100 * 10) / 10
      : 0,
  }));
}

function processHourly(logs: LogEntry[]) {
  const hourly: Record<number, number> = {};

  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourly[i] = 0;
  }

  // Fill in data
  for (const log of logs) {
    const hour = new Date(log.created_at).getHours();
    hourly[hour] += 1;
  }

  return Object.entries(hourly).map(([hour, calls]) => ({
    hour: parseInt(hour),
    calls,
  }));
}

function processTopQueries(logs: LogEntry[]) {
  const queries: Record<string, { count: number; totalLatency: number }> = {};

  for (const log of logs) {
    if (log.endpoint?.includes('/memories') && log.method === 'GET') {
      // Use endpoint as proxy for query pattern
      const queryKey = log.endpoint.split('?')[0] || log.endpoint;
      if (!queries[queryKey]) {
        queries[queryKey] = { count: 0, totalLatency: 0 };
      }
      queries[queryKey].count += 1;
      if (log.latency_ms) {
        queries[queryKey].totalLatency += log.latency_ms;
      }
    }
  }

  return Object.entries(queries)
    .map(([query, data]) => ({
      query: query.replace('/api/', ''),
      count: data.count,
      avgLatency: data.count > 0 ? Math.round(data.totalLatency / data.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function processEndpointBreakdown(logs: LogEntry[]) {
  const endpoints: Record<string, number> = {};
  const total = logs.length || 1;

  for (const log of logs) {
    const key = `${log.method} ${log.endpoint?.split('?')[0] || 'unknown'}`;
    endpoints[key] = (endpoints[key] || 0) + 1;
  }

  return Object.entries(endpoints)
    .map(([endpoint, calls]) => ({
      endpoint: endpoint.replace('/api/', ''),
      calls,
      percentage: Math.round((calls / total) * 100),
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 6);
}

function calculateSummary(logs: LogEntry[], previousLogs: LogEntry[]) {
  // Current period stats
  const uniqueUsers = new Set(logs.map(l => l.user_id).filter(Boolean));
  const totalDAU = uniqueUsers.size || 1;
  const totalApiCalls = logs.length;
  const totalMemoryOps = logs.filter(l =>
    l.endpoint?.includes('/memories')
  ).length;

  const latencies = logs.map(l => l.latency_ms).filter((l): l is number => l !== null && l > 0);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
    : 0;

  const totalErrors = logs.filter(l => l.status_code && l.status_code >= 400).length;
  const errorRate = totalApiCalls > 0
    ? Math.round((totalErrors / totalApiCalls) * 100 * 10) / 10
    : 0;

  // Find peak hour
  const hourlyCounts: Record<number, number> = {};
  for (const log of logs) {
    const hour = new Date(log.created_at).getHours();
    hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
  }
  const peakHour = Object.entries(hourlyCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || '0';

  // Previous period stats for comparison
  const prevUniqueUsers = new Set(previousLogs.map(l => l.user_id).filter(Boolean));
  const prevDAU = prevUniqueUsers.size || 1;
  const prevApiCalls = previousLogs.length || 1;
  const prevMemoryOps = previousLogs.filter(l =>
    l.endpoint?.includes('/memories')
  ).length || 1;

  const prevLatencies = previousLogs.map(l => l.latency_ms).filter((l): l is number => l !== null && l > 0);
  const prevAvgLatency = prevLatencies.length > 0
    ? Math.round(prevLatencies.reduce((sum, l) => sum + l, 0) / prevLatencies.length)
    : avgLatency || 1;

  const prevErrors = previousLogs.filter(l => l.status_code && l.status_code >= 400).length;
  const prevErrorRate = prevApiCalls > 0
    ? Math.round((prevErrors / prevApiCalls) * 100 * 10) / 10
    : 0;

  // Calculate percentage changes
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 10) / 10;
  };

  return {
    totalDAU,
    dauChange: calculateChange(totalDAU, prevDAU),
    totalApiCalls,
    apiCallsChange: calculateChange(totalApiCalls, prevApiCalls),
    totalMemoryOps,
    memoryOpsChange: calculateChange(totalMemoryOps, prevMemoryOps),
    avgLatency,
    latencyChange: calculateChange(avgLatency, prevAvgLatency),
    errorRate,
    errorRateChange: calculateChange(errorRate, prevErrorRate || 0.1),
    peakHour: parseInt(peakHour),
  };
}
