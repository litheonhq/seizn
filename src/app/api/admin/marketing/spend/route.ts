/**
 * Admin marketing spend log endpoint.
 *
 * Locked 2026-05-08. Operations records monthly ad spend per channel here;
 * /api/admin/metrics joins this against marketing_attributions to compute
 * CAC per channel. Restricted to super-admin (SEIZN_ADMIN_EMAILS allowlist).
 *
 * GET  — list rows for the requested period (default: trailing 90 days).
 * POST — upsert one row keyed on (channel, period_start). Re-posting an
 *        existing (channel, period_start) overwrites spend_usd (operations
 *        sometimes corrects last month's number after invoices arrive).
 *
 * The underlying table has period_start/period_end (DATE), not a single
 * month_start. We accept either {period_start, period_end} or {month}
 * (YYYY-MM); month is normalized to first/last day of that month.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/admin/auth';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostBody {
  channel?: unknown;
  campaign?: unknown;
  spend_usd?: unknown;
  period_start?: unknown;
  period_end?: unknown;
  month?: unknown;
  notes?: unknown;
}

interface NormalizedSpend {
  channel: string;
  campaign: string | null;
  spend_usd: number;
  period_start: string;
  period_end: string;
  notes: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const CHANNEL_MAX = 64;
const CAMPAIGN_MAX = 128;
const NOTES_MAX = 2_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const since = request.nextUrl.searchParams.get('since');
  const until = request.nextUrl.searchParams.get('until');
  const channel = request.nextUrl.searchParams.get('channel');

  const supabase = createServerClient();
  let query = supabase
    .from('ad_spend_log')
    .select('id, channel, campaign, spend_usd, period_start, period_end, notes, recorded_by, created_at')
    .order('period_start', { ascending: false })
    .limit(500);

  if (since && ISO_DATE.test(since)) query = query.gte('period_start', since);
  if (until && ISO_DATE.test(until)) query = query.lte('period_start', until);
  if (channel) query = query.eq('channel', channel);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const normalized = normalizeBody(body);
  if ('error' in normalized) {
    return NextResponse.json({ error: 'bad_request', detail: normalized.error }, { status: 400 });
  }

  const supabase = createServerClient();
  // Find the existing row for (channel, period_start) so re-posts overwrite
  // rather than insert duplicates. ad_spend_log has no UNIQUE on this pair
  // because period_end can vary by a day for partial-month corrections.
  const { data: existing, error: lookupError } = await supabase
    .from('ad_spend_log')
    .select('id')
    .eq('channel', normalized.channel)
    .eq('period_start', normalized.period_start)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json(
      { error: 'lookup_failed', detail: lookupError.message },
      { status: 500 },
    );
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('ad_spend_log')
      .update({
        campaign: normalized.campaign,
        spend_usd: normalized.spend_usd,
        period_end: normalized.period_end,
        notes: normalized.notes,
        recorded_by: guard.userId,
      })
      .eq('id', existing.id);
    if (updateError) {
      return NextResponse.json(
        { error: 'update_failed', detail: updateError.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ id: existing.id, mode: 'updated' });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('ad_spend_log')
    .insert({
      channel: normalized.channel,
      campaign: normalized.campaign,
      spend_usd: normalized.spend_usd,
      period_start: normalized.period_start,
      period_end: normalized.period_end,
      notes: normalized.notes,
      recorded_by: guard.userId,
    })
    .select('id')
    .single();
  if (insertError) {
    return NextResponse.json(
      { error: 'insert_failed', detail: insertError.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: inserted.id, mode: 'inserted' });
}

interface AdminGuard {
  ok: true;
  userId: string;
}
interface AdminGuardFail {
  ok: false;
  response: NextResponse;
}

async function requireAdmin(): Promise<AdminGuard | AdminGuardFail> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!isSuperAdminEmail(session.user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  if (!hasServerSupabaseServiceRoleConfig()) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 }),
    };
  }
  return { ok: true, userId: session.user.id };
}

function normalizeBody(body: PostBody): NormalizedSpend | { error: string } {
  const channel = typeof body.channel === 'string' ? body.channel.trim() : '';
  if (!channel) return { error: 'channel is required' };
  if (channel.length > CHANNEL_MAX) return { error: `channel exceeds ${CHANNEL_MAX} chars` };

  const spend =
    typeof body.spend_usd === 'number'
      ? body.spend_usd
      : typeof body.spend_usd === 'string'
        ? Number(body.spend_usd)
        : NaN;
  if (!Number.isFinite(spend) || spend < 0) {
    return { error: 'spend_usd must be a non-negative number' };
  }
  // Round to cents so we can never insert fractional cents and break the
  // NUMERIC(10,2) column.
  const rounded = Math.round(spend * 100) / 100;

  let periodStart = typeof body.period_start === 'string' ? body.period_start : '';
  let periodEnd = typeof body.period_end === 'string' ? body.period_end : '';
  if (!periodStart || !periodEnd) {
    const month = typeof body.month === 'string' ? body.month : '';
    if (!ISO_MONTH.test(month)) {
      return {
        error: 'either {period_start, period_end} (YYYY-MM-DD) or {month} (YYYY-MM) is required',
      };
    }
    const [yearRaw, monthRaw] = month.split('-');
    const year = Number(yearRaw);
    const monthNum = Number(monthRaw);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthNum) ||
      monthNum < 1 ||
      monthNum > 12
    ) {
      return { error: 'month must be a valid YYYY-MM' };
    }
    const start = new Date(Date.UTC(year, monthNum - 1, 1));
    const end = new Date(Date.UTC(year, monthNum, 0)); // last day of that month
    periodStart = start.toISOString().slice(0, 10);
    periodEnd = end.toISOString().slice(0, 10);
  }
  if (!ISO_DATE.test(periodStart)) return { error: 'period_start must be YYYY-MM-DD' };
  if (!ISO_DATE.test(periodEnd)) return { error: 'period_end must be YYYY-MM-DD' };
  if (periodEnd < periodStart) return { error: 'period_end must be >= period_start' };

  const campaign =
    typeof body.campaign === 'string' && body.campaign.trim().length > 0
      ? body.campaign.trim().slice(0, CAMPAIGN_MAX)
      : null;
  const notes =
    typeof body.notes === 'string' && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, NOTES_MAX)
      : null;

  return {
    channel,
    campaign,
    spend_usd: rounded,
    period_start: periodStart,
    period_end: periodEnd,
    notes,
  };
}
