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
import { verifyCsrfToken } from '@/lib/csrf';
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

// CLAUDE.md "광고비 cap: 월 $500". Soft guard: warn + require ?force=true
// over $600 (cap + 20% buffer) so a typo of $5000 doesn't silently corrupt
// CAC math. Operator can still record legitimately higher quarterly figures
// by passing ?force=true.
const SOFT_SPEND_CAP_USD = 600;

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
  // Round 5 audit fix: state-changing admin route requires CSRF token
  // (Origin/Referer + double-submit cookie) on top of the super-admin
  // session check. Without it a logged-in founder visiting an attacker
  // page could be CSRF'd into corrupting the CAC dashboard.
  const csrfError = verifyCsrfToken(request);
  if (csrfError) return csrfError;

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const normalized = normalizeBody(body);
  if ('error' in normalized) {
    return NextResponse.json({ error: 'bad_request', detail: normalized.error }, { status: 400 });
  }

  // Soft cap warning. Pass ?force=true to override (legitimate quarterly
  // figures may exceed the monthly cap).
  const force = request.nextUrl.searchParams.get('force') === 'true';
  if (normalized.spend_usd > SOFT_SPEND_CAP_USD && !force) {
    return NextResponse.json(
      {
        error: 'spend_exceeds_cap',
        detail: `spend_usd ${normalized.spend_usd} exceeds soft cap ${SOFT_SPEND_CAP_USD}. Pass ?force=true to override.`,
        soft_cap_usd: SOFT_SPEND_CAP_USD,
      },
      { status: 422 },
    );
  }

  const supabase = createServerClient();
  // Round 5 audit fix: replace lookup-then-insert/update with a real
  // upsert backed by UNIQUE (channel, period_start) added in migration
  // 20260508007. Removes the two-tab race that produced duplicate rows
  // and double-counted in CAC math.
  const { data: upserted, error: upsertError } = await supabase
    .from('ad_spend_log')
    .upsert(
      {
        channel: normalized.channel,
        campaign: normalized.campaign,
        spend_usd: normalized.spend_usd,
        period_start: normalized.period_start,
        period_end: normalized.period_end,
        notes: normalized.notes,
        recorded_by: guard.userId,
      },
      { onConflict: 'channel,period_start' },
    )
    .select('id')
    .single();
  if (upsertError) {
    return NextResponse.json(
      { error: 'upsert_failed', detail: upsertError.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: upserted.id });
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
