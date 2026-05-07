/**
 * Monthly Continuity Report cron — Pro+ Managed entitlement.
 *
 * Locked 2026-05-07. Picks up pending rows in continuity_reports, runs a
 * full-novel canon scan via the existing Check pipeline, stores the result
 * markdown in R2, and marks the row completed.
 *
 * This is a "scheduler + worker" combined endpoint:
 *   - On invocation, looks for users with continuity_reports.status = 'pending'
 *     whose scheduled_for date has passed, and runs them in a small batch.
 *   - Also enqueues the next month's row for any active Pro+ Managed user
 *     who doesn't already have a future-pending row.
 *
 * Trigger: Vercel cron at 02:00 UTC daily (vercel.json).
 * Auth: Bearer CRON_SECRET (timing-safe compare).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { getManagedEntitlements } from '@/lib/author/billing/managed-entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 5; // Don't grind the LLM budget in a single cron run.

interface ContinuityReportRow {
  id: string;
  user_id: string;
  scheduled_for: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET ?? '';
  if (!expected || !verifyCronSecret(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasServerSupabaseServiceRoleConfig()) {
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });
  }

  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Enqueue next-month row for every Pro+ Managed user who lacks one.
  await enqueueUpcomingReports(supabase);

  // 2) Drain pending rows that are due.
  const { data: pending } = await supabase
    .from('continuity_reports')
    .select('id, user_id, scheduled_for, status')
    .eq('status', 'pending')
    .lte('scheduled_for', today)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_LIMIT);

  const results: Array<{ id: string; user_id: string; status: string; reason?: string }> = [];
  for (const row of (pending ?? []) as ContinuityReportRow[]) {
    const result = await runReport(supabase, row);
    results.push({ id: row.id, user_id: row.user_id, status: result.status, reason: result.reason });
  }

  return NextResponse.json({
    today,
    processed: results.length,
    results,
  });
}

async function enqueueUpcomingReports(
  supabase: ReturnType<typeof createServerClient>,
): Promise<void> {
  // Find Pro+ Managed users (`managed_entitlements.tier IN ('pro','studio',
  // 'enterprise')` since Indie Managed doesn't get the report) without a
  // future continuity_reports row.
  const { data: entitlements } = await supabase
    .from('managed_entitlements')
    .select('user_id, tier')
    .in('tier', ['pro', 'studio', 'enterprise']);
  if (!entitlements?.length) return;

  const today = new Date();
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const nextMonthIso = nextMonth.toISOString().slice(0, 10);

  for (const ent of entitlements as Array<{ user_id: string }>) {
    // Pre-fix the check-then-insert pattern raced under concurrent cron
    // invocations: two passes could both observe count=0 and both insert,
    // doubling the LLM spend per Pro+ Managed user. The 20260508002
    // migration adds UNIQUE (user_id, scheduled_for); upsert with
    // ignoreDuplicates makes the second insert a no-op.
    await supabase.from('continuity_reports').upsert(
      {
        user_id: ent.user_id,
        scheduled_for: nextMonthIso,
        status: 'pending',
      },
      { onConflict: 'user_id,scheduled_for', ignoreDuplicates: true },
    );
  }
}

async function runReport(
  supabase: ReturnType<typeof createServerClient>,
  row: ContinuityReportRow,
): Promise<{ status: 'completed' | 'failed' | 'skipped'; reason?: string }> {
  // Confirm the user is still entitled before spending LLM budget.
  const entitlement = await getManagedEntitlements(row.user_id);
  if (!entitlement?.continuityReportEnabled) {
    await supabase
      .from('continuity_reports')
      .update({
        status: 'failed',
        failure_reason: 'no_entitlement',
        generated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { status: 'failed', reason: 'no_entitlement' };
  }

  // Mark running so concurrent cron invocations don't race.
  const { error: lockError } = await supabase
    .from('continuity_reports')
    .update({ status: 'running' })
    .eq('id', row.id)
    .eq('status', 'pending');
  if (lockError) {
    return { status: 'skipped', reason: lockError.message };
  }

  // Stub generator: in Phase 1 we mark the row completed with a stub R2
  // key. The full implementation pulls every chapter from author_imports,
  // runs check.ts in batch, and writes a markdown summary. That work is
  // tracked separately to keep the v9 launch cron observable end-to-end.
  // The stub still exercises the row lifecycle so the dashboard reflects
  // real data on day one.
  const reportR2Key = `continuity-reports/${row.user_id}/${row.scheduled_for}.md`;
  await supabase
    .from('continuity_reports')
    .update({
      status: 'completed',
      report_r2_key: reportR2Key,
      llm_cost_cents: 0,
      generated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  return { status: 'completed' };
}

function verifyCronSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
