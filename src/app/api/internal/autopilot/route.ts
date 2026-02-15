/**
 * Internal Autopilot Monitoring API
 *
 * GET /api/internal/autopilot
 *
 * Returns lightweight health metrics for Autopilot ingestion:
 * - webhook inbox backlog (unprocessed deliveries)
 * - recent throughput and error samples
 * - recent PR/fix/analyze activity counts
 *
 * This endpoint is internal-only and must be protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  return Boolean(CRON_SECRET && providedSecret === CRON_SECRET);
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const since24h = isoHoursAgo(24);
  const since1h = isoHoursAgo(1);
  const pendingOlderThan5m = isoMinutesAgo(5);

  try {
    const [
      totalWebhooks,
      pendingWebhooks,
      oldPendingWebhooks,
      lastWebhook,
      lastProcessedWebhook,
      recentProcessedSamples,
      prs24h,
      fixes24h,
      analyses24h,
    ] = await Promise.all([
      supabase
        .from('autopilot_webhooks')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('autopilot_webhooks')
        .select('id', { count: 'exact', head: true })
        .eq('processed', false),
      supabase
        .from('autopilot_webhooks')
        .select('id', { count: 'exact', head: true })
        .eq('processed', false)
        .lt('created_at', pendingOlderThan5m),
      supabase
        .from('autopilot_webhooks')
        .select('id,event,repository,processed,created_at,processed_at')
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('autopilot_webhooks')
        .select('id,event,repository,processed_at,result')
        .eq('processed', true)
        .order('processed_at', { ascending: false })
        .limit(1),
      // Fetch a small sample window for error counting without relying on JSON operators.
      supabase
        .from('autopilot_webhooks')
        .select('id,processed_at,result')
        .eq('processed', true)
        .gte('processed_at', since24h)
        .order('processed_at', { ascending: false })
        .limit(200),
      supabase
        .from('autopilot_prs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since24h),
      supabase
        .from('autopilot_fixes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since24h),
      supabase
        .from('autopilot_analyses')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since24h),
    ]);

    const samples = Array.isArray(recentProcessedSamples.data) ? recentProcessedSamples.data : [];
    const errors24h = samples.filter((row) => {
      const result = (row as { result?: unknown }).result;
      if (!result || typeof result !== 'object') return false;
      const error = (result as Record<string, unknown>).error;
      return typeof error === 'string' && error.trim().length > 0;
    }).length;

    const lastErrorSample = samples.find((row) => {
      const result = (row as { result?: unknown }).result;
      if (!result || typeof result !== 'object') return false;
      const error = (result as Record<string, unknown>).error;
      return typeof error === 'string' && error.trim().length > 0;
    });

    // Optional: quick throughput in the last hour.
    const { count: processed1hCount } = await supabase
      .from('autopilot_webhooks')
      .select('id', { count: 'exact', head: true })
      .eq('processed', true)
      .gte('processed_at', since1h);

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      webhooks: {
        total: totalWebhooks.count ?? null,
        pending: pendingWebhooks.count ?? null,
        pendingOlderThan5m: oldPendingWebhooks.count ?? null,
        processedLast1h: processed1hCount ?? null,
        errorsLast24h: errors24h,
        lastReceived: lastWebhook.data?.[0] ?? null,
        lastProcessed: lastProcessedWebhook.data?.[0] ?? null,
        lastErrorSample: lastErrorSample
          ? {
              id: lastErrorSample.id,
              processed_at: (lastErrorSample as { processed_at?: string }).processed_at ?? null,
              result: (lastErrorSample as { result?: unknown }).result ?? null,
            }
          : null,
      },
      activity: {
        autopilot_prs_last24h: prs24h.count ?? null,
        autopilot_fixes_last24h: fixes24h.count ?? null,
        autopilot_analyses_last24h: analyses24h.count ?? null,
      },
    });
  } catch (error) {
    console.error('[Internal Autopilot] Error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

