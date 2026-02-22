import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqual } from 'crypto';

const VALID_PERIODS = ['7d', '30d', '90d', 'all'] as const;
type Period = (typeof VALID_PERIODS)[number];

const VALID_GROUP_BY = ['character_subtype', 'language', 'nsfw_level', 'scenario'] as const;
type GroupBy = (typeof VALID_GROUP_BY)[number];

function parseBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function safeTokenEquals(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(actual, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function getSinceFromPeriod(period: Period): Date {
  if (period === 'all') {
    return new Date(0);
  }

  const days = Number.parseInt(period.replace('d', ''), 10);
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since;
}

// GET /api/memories/analytics?period=7d&group_by=character_subtype
export async function GET(request: NextRequest) {
  const adminKey = process.env.SEIZN_API_KEY;
  const token = parseBearerToken(request);

  if (!adminKey || !token || !safeTokenEquals(adminKey, token)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodRaw = (searchParams.get('period') || '7d') as Period;
  const groupByRaw = (searchParams.get('group_by') || 'character_subtype') as GroupBy;

  if (!VALID_PERIODS.includes(periodRaw)) {
    return NextResponse.json(
      { error: `period must be one of: ${VALID_PERIODS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!VALID_GROUP_BY.includes(groupByRaw)) {
    return NextResponse.json(
      { error: `group_by must be one of: ${VALID_GROUP_BY.join(', ')}` },
      { status: 400 }
    );
  }

  const since = getSinceFromPeriod(periodRaw);
  const supabase = createServerClient();
  const sinceIso = since.toISOString();

  const { count: totalFeedback, error: countError } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .not('companion_meta', 'is', null)
    .gte('created_at', sinceIso)
    .eq('is_deleted', false);

  if (countError) {
    console.error('[memories/analytics] count error:', countError);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }

  const { data: grouped, error: groupedError } = await supabase.rpc('companion_analytics', {
    p_since: sinceIso,
    p_group_by: groupByRaw,
  });
  if (groupedError) {
    console.error('[memories/analytics] grouped error:', groupedError);
    return NextResponse.json({ error: 'Failed to load grouped analytics' }, { status: 500 });
  }

  const { data: topScenarios, error: topScenariosError } = await supabase.rpc(
    'companion_top_scenarios',
    {
      p_since: sinceIso,
      p_limit: 10,
    }
  );
  if (topScenariosError) {
    console.error('[memories/analytics] top scenarios error:', topScenariosError);
    return NextResponse.json({ error: 'Failed to load scenario analytics' }, { status: 500 });
  }

  const { data: unhappyCombos, error: unhappyCombosError } = await supabase.rpc(
    'companion_unhappy_combos',
    {
      p_since: sinceIso,
    }
  );
  if (unhappyCombosError) {
    console.error('[memories/analytics] unhappy combos error:', unhappyCombosError);
    return NextResponse.json({ error: 'Failed to load unhappy combo analytics' }, { status: 500 });
  }

  const response = NextResponse.json({
    success: true,
    period: periodRaw,
    group_by: groupByRaw,
    since: sinceIso,
    total_feedback: totalFeedback ?? 0,
    grouped: grouped || [],
    top_scenarios: topScenarios || [],
    unhappy_combos: unhappyCombos || [],
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Vary', 'Authorization');
  return response;
}
