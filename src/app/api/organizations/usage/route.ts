import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

// GET /api/organizations/usage?organization_id=xxx - Get org-level usage analytics
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const period = searchParams.get('period') || '7d';

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const userId = session.user.id;

    // Verify user is a member of this organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default: // 7d
        startDate.setDate(now.getDate() - 7);
    }

    // Get all member user IDs for this organization
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId);

    const memberUserIds = members?.map(m => m.user_id) || [];

    if (memberUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        period,
        usage: {
          daily: [],
          summary: {
            totalCalls: 0,
            totalTokens: 0,
            totalCostCents: 0,
            totalCostDollars: '0.00',
            totalErrors: 0,
            errorRate: 0,
            avgLatency: 0,
            p95Latency: 0,
          },
          members: [],
        },
      });
    }

    // Get usage logs for all org members
    const { data: logs, error: logsError } = await supabase
      .from('usage_logs')
      .select('user_id, endpoint, method, status_code, embedding_tokens, cost_cents, latency_ms, created_at')
      .in('user_id', memberUserIds)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (logsError) {
      console.error('Org usage logs error:', logsError);
      return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 });
    }

    // Process data
    const dailyUsage = processDaily(logs || [], startDate, now);
    const summary = calculateSummary(logs || []);
    const memberBreakdown = processMemberUsage(logs || [], memberUserIds);

    // Get member info
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, name')
      .in('id', memberUserIds);

    const profileMap = new Map(profiles?.map(p => [p.id, { email: p.email, name: p.name }]) || []);

    // Add names to member breakdown
    const memberStats = memberBreakdown.map(m => ({
      ...m,
      email: profileMap.get(m.userId)?.email || 'Unknown',
      name: profileMap.get(m.userId)?.name || null,
    }));

    // Get active API keys count for the org
    const { count: activeKeysCount } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .in('user_id', memberUserIds)
      .eq('is_active', true);

    return NextResponse.json({
      success: true,
      period,
      usage: {
        daily: dailyUsage,
        summary: {
          ...summary,
          activeKeys: activeKeysCount || 0,
          memberCount: memberUserIds.length,
        },
        members: memberStats,
      },
    });
  } catch (error) {
    console.error('Org usage analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface LogEntry {
  user_id: string;
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
    calls: data.calls,
    tokens: data.tokens,
    cost: data.cost,
  }));
}

function processMemberUsage(logs: LogEntry[], memberUserIds: string[]) {
  const members: Record<string, { calls: number; tokens: number; cost: number }> = {};

  // Initialize all members
  for (const userId of memberUserIds) {
    members[userId] = { calls: 0, tokens: 0, cost: 0 };
  }

  // Fill in actual data
  for (const log of logs) {
    if (members[log.user_id]) {
      members[log.user_id].calls += 1;
      members[log.user_id].tokens += log.embedding_tokens || 0;
      members[log.user_id].cost += log.cost_cents || 0;
    }
  }

  return Object.entries(members)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.calls - a.calls);
}

function calculateSummary(logs: LogEntry[]) {
  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + (l.embedding_tokens || 0), 0);
  const totalCost = logs.reduce((sum, l) => sum + (l.cost_cents || 0), 0);
  const totalErrors = logs.filter(l => l.status_code && l.status_code >= 400).length;

  // Calculate latency stats
  const latencies = logs.map(l => l.latency_ms).filter((l): l is number => l !== null && l > 0);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
    : 0;

  // Calculate p95 latency
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95Latency = sortedLatencies.length > 0 ? sortedLatencies[Math.min(p95Index, sortedLatencies.length - 1)] : 0;

  return {
    totalCalls,
    totalTokens,
    totalCostCents: totalCost,
    totalCostDollars: (totalCost / 100).toFixed(2),
    totalErrors,
    errorRate: totalCalls > 0 ? Math.round((totalErrors / totalCalls) * 100) : 0,
    avgLatency,
    p95Latency,
  };
}
