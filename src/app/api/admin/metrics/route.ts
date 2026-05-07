/**
 * Admin metrics dashboard data endpoint.
 *
 * Locked 2026-05-07. Aggregates CAC, conversion funnel, MRR, churn, and
 * trial cost into a single payload for /admin/metrics.
 *
 * Restricted to super-admin (SEIZN_ADMIN_EMAILS env allowlist).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/admin/auth';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

export const runtime = 'nodejs';

interface MetricsResponse {
  computed_at: string;
  current_month: string;
  cac_by_channel: Array<{ channel: string; spend: number; signups: number; cac: number | null }>;
  funnel_30d: {
    signups: number;
    byok_added: number;
    first_extract: number;
    first_check: number;
    first_dialog: number;
    subscribed: number;
    cancelled: number;
    blended_conversion: number | null;
  };
  mrr: { current_cents: number; previous_month_cents: number; growth_pct: number | null };
  churn: { last_month_pct: number | null; canceled: number; active_at_start: number };
  trial_cost: { last_month_total_usd: number; users: number; avg_per_user_usd: number | null };
  alerts: string[];
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!hasServerSupabaseServiceRoleConfig()) {
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });
  }

  const supabase = createServerClient();
  const now = new Date();
  const currentMonth = monthStart(now).toISOString().slice(0, 10);
  const currentMonthEnd = monthEnd(now).toISOString().slice(0, 10);
  const lastMonth = monthStart(addMonths(now, -1)).toISOString().slice(0, 10);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    cacByChannelResult,
    funnelEventsResult,
    mrrCurrentResult,
    mrrLastMonthResult,
    churnResult,
    trialCostResult,
  ] = await Promise.all([
    // CAC by channel: join ad_spend_log with marketing_attributions for current month.
    supabase
      .from('ad_spend_log')
      .select('channel, spend_usd, period_start, period_end')
      .gte('period_start', currentMonth)
      .lte('period_end', currentMonthEnd),
    supabase
      .from('funnel_events')
      .select('event_type, user_id, occurred_at')
      .gte('occurred_at', last30Days),
    supabase
      .from('mrr_snapshots')
      .select('total_mrr_usd_cents, snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1),
    supabase
      .from('mrr_snapshots')
      .select('total_mrr_usd_cents')
      .lte('snapshot_date', lastMonth)
      .order('snapshot_date', { ascending: false })
      .limit(1),
    supabase
      .from('profiles')
      .select('subscription_started_at, subscription_ended_at')
      .gte('subscription_ended_at', lastMonth)
      .lt('subscription_ended_at', currentMonth),
    supabase
      .from('feature_usage_log')
      .select('user_id, count')
      .eq('period_start', lastMonth),
  ]);

  // Compute CAC per channel (signups counted from marketing_attributions).
  const cacByChannel: MetricsResponse['cac_by_channel'] = [];
  if (cacByChannelResult.data) {
    const channels = new Map<string, number>();
    for (const row of cacByChannelResult.data) {
      const channel = row.channel as string;
      channels.set(channel, (channels.get(channel) ?? 0) + Number(row.spend_usd));
    }
    for (const [channel, spend] of channels) {
      const { count: signups } = await supabase
        .from('marketing_attributions')
        .select('*', { count: 'exact', head: true })
        .eq('utm_source', channel)
        .gte('signed_up_at', currentMonth);
      const signupCount = signups ?? 0;
      cacByChannel.push({
        channel,
        spend,
        signups: signupCount,
        cac: signupCount > 0 ? Math.round((spend / signupCount) * 100) / 100 : null,
      });
    }
  }

  // Funnel 30-day counts.
  const funnel = countFunnelEvents(funnelEventsResult.data ?? []);
  const blendedConversion =
    funnel.signups > 0 ? Math.round((funnel.subscribed / funnel.signups) * 10_000) / 100 : null;

  // MRR.
  const currentMrrCents = mrrCurrentResult.data?.[0]?.total_mrr_usd_cents ?? 0;
  const lastMrrCents = mrrLastMonthResult.data?.[0]?.total_mrr_usd_cents ?? 0;
  const mrrGrowth =
    lastMrrCents > 0 ? Math.round(((currentMrrCents - lastMrrCents) / lastMrrCents) * 10_000) / 100 : null;

  // Churn (canceled last month / active at start of last month).
  const cancelled = churnResult.data?.length ?? 0;
  const { count: activeAtStart } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .lte('subscription_started_at', lastMonth)
    .or(`subscription_ended_at.is.null,subscription_ended_at.gt.${lastMonth}`);
  const churnPct =
    activeAtStart && activeAtStart > 0 ? Math.round((cancelled / activeAtStart) * 10_000) / 100 : null;

  // Trial cost (proxy: feature_usage_log rows × estimated $0.05/op for free tier).
  const trialUsers = new Set((trialCostResult.data ?? []).map((r: { user_id: string }) => r.user_id)).size;
  const totalOps = (trialCostResult.data ?? []).reduce(
    (sum: number, row: { count: number }) => sum + row.count,
    0,
  );
  const trialCostUsd = Math.round(totalOps * 0.05 * 100) / 100;

  const alerts: string[] = [];
  for (const row of cacByChannel) {
    if (row.cac != null && row.cac > 25) alerts.push(`CAC for ${row.channel} is $${row.cac} (alert: >$25)`);
  }
  if (churnPct != null && churnPct > 10) alerts.push(`Monthly churn ${churnPct}% (alert: >10%)`);
  if (blendedConversion != null && blendedConversion < 5) alerts.push(`30-day conversion ${blendedConversion}% (alert: <5%)`);

  const payload: MetricsResponse = {
    computed_at: now.toISOString(),
    current_month: currentMonth,
    cac_by_channel: cacByChannel,
    funnel_30d: { ...funnel, blended_conversion: blendedConversion },
    mrr: {
      current_cents: currentMrrCents,
      previous_month_cents: lastMrrCents,
      growth_pct: mrrGrowth,
    },
    churn: {
      last_month_pct: churnPct,
      canceled: cancelled,
      active_at_start: activeAtStart ?? 0,
    },
    trial_cost: {
      last_month_total_usd: trialCostUsd,
      users: trialUsers,
      avg_per_user_usd: trialUsers > 0 ? Math.round((trialCostUsd / trialUsers) * 100) / 100 : null,
    },
    alerts,
  };
  return NextResponse.json(payload);
}

interface FunnelEventRow {
  event_type: string;
  user_id: string;
}

function countFunnelEvents(events: FunnelEventRow[]) {
  const byType = new Map<string, Set<string>>();
  for (const e of events) {
    if (!byType.has(e.event_type)) byType.set(e.event_type, new Set());
    byType.get(e.event_type)!.add(e.user_id);
  }
  return {
    signups: byType.get('signup')?.size ?? 0,
    byok_added: byType.get('byok_key_added')?.size ?? 0,
    first_extract: byType.get('first_extract')?.size ?? 0,
    first_check: byType.get('first_check')?.size ?? 0,
    first_dialog: byType.get('first_dialog')?.size ?? 0,
    subscribed: byType.get('subscription_created')?.size ?? 0,
    cancelled: byType.get('subscription_canceled')?.size ?? 0,
  };
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEnd(date: Date): Date {
  // Last calendar day at 23:59:59 UTC. Use day-0 of next month = last day of
  // current month (avoids the previously broken `-31` Feb 31 hack).
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
}

function addMonths(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}
