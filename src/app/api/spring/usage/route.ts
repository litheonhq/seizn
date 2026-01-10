// Seizn Spring - Usage Dashboard API
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDailyUsage, getUsageHistory, getUserPlan } from '@/lib/spring/db';
import { Plan, PLAN_QUOTAS, PLAN_PRICING, DailyUsage } from '@/lib/spring/types';

export const runtime = 'nodejs';

// ===========================================
// GET /api/spring/usage - Get Usage Statistics
// ===========================================
export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    const includeHistory = searchParams.get('history') !== 'false';

    // 3. Get user plan
    const userPlan = await getUserPlan(userId) as Plan;
    const planQuota = PLAN_QUOTAS[userPlan] || PLAN_QUOTAS.free;
    const planPricing = PLAN_PRICING[userPlan] || PLAN_PRICING.free;

    // 4. Get today's usage
    const todayUsage = await getDailyUsage(userId);

    // 5. Get usage history (optional)
    let usageHistory: DailyUsage[] = [];
    if (includeHistory) {
      usageHistory = await getUsageHistory(userId, days);
    }

    // 6. Calculate remaining quotas
    const remaining = calculateRemaining(todayUsage, planQuota);

    // 7. Calculate totals for the period
    const periodStats = calculatePeriodStats(usageHistory);

    // 8. Return response
    return NextResponse.json({
      plan: {
        name: userPlan,
        pricing: planPricing,
        quotas: planQuota,
      },
      today: {
        date: new Date().toISOString().split('T')[0],
        usage: formatUsage(todayUsage),
        remaining,
        percentage: calculatePercentage(todayUsage, planQuota),
      },
      period: {
        days,
        stats: periodStats,
        history: includeHistory ? usageHistory.map(formatUsage) : undefined,
      },
    });
  } catch (error) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 }
    );
  }
}

// ===========================================
// Helpers
// ===========================================
function formatUsage(usage: DailyUsage | null) {
  if (!usage) {
    return {
      date: new Date().toISOString().split('T')[0],
      chat: {
        gpt4o_mini: 0,
        gpt4o: 0,
        gpt5: 0,
        claude_sonnet: 0,
        claude_opus: 0,
        gemini: 0,
        total_messages: 0,
      },
      tokens: {
        input: 0,
        output: 0,
        total: 0,
      },
      images: {
        sd: 0,
        dalle: 0,
        total: 0,
      },
      files: 0,
      video_seconds: 0,
      cost_cents: 0,
    };
  }

  return {
    date: usage.usage_date,
    chat: {
      gpt4o_mini: usage.gpt4o_mini_count,
      gpt4o: usage.gpt4o_count,
      gpt5: usage.gpt5_count,
      claude_sonnet: usage.claude_sonnet_count,
      claude_opus: usage.claude_opus_count,
      gemini: usage.gemini_count,
      total_messages:
        usage.gpt4o_mini_count +
        usage.gpt4o_count +
        usage.gpt5_count +
        usage.claude_sonnet_count +
        usage.claude_opus_count +
        usage.gemini_count,
    },
    tokens: {
      input: usage.total_input_tokens,
      output: usage.total_output_tokens,
      total: usage.total_input_tokens + usage.total_output_tokens,
    },
    images: {
      sd: usage.sd_images_count,
      dalle: usage.dalle_images_count,
      total: usage.sd_images_count + usage.dalle_images_count,
    },
    files: usage.files_analyzed_count,
    video_seconds: usage.video_seconds_used,
    cost_cents: usage.total_cost_cents,
  };
}

function calculateRemaining(
  usage: DailyUsage | null,
  quota: typeof PLAN_QUOTAS.free
) {
  const u = usage || {
    gpt4o_mini_count: 0,
    gpt4o_count: 0,
    gpt5_count: 0,
    claude_sonnet_count: 0,
    claude_opus_count: 0,
    gemini_count: 0,
    sd_images_count: 0,
    dalle_images_count: 0,
    files_analyzed_count: 0,
  };

  const calc = (used: number, limit: number) =>
    limit === -1 ? -1 : Math.max(0, limit - used);

  return {
    gpt4o_mini: calc(u.gpt4o_mini_count, quota.gpt4o_mini_daily),
    gpt4o: calc(u.gpt4o_count, quota.gpt4o_daily),
    gpt5: calc(u.gpt5_count, quota.gpt5_daily),
    claude_sonnet: calc(u.claude_sonnet_count, quota.claude_sonnet_daily),
    claude_opus: calc(u.claude_opus_count, quota.claude_opus_daily),
    gemini: calc(u.gemini_count, quota.gemini_daily),
    sd_images: calc(u.sd_images_count, quota.sd_images_daily),
    dalle_images: calc(u.dalle_images_count, quota.dalle_images_daily),
    files: calc(u.files_analyzed_count, quota.files_daily),
  };
}

function calculatePercentage(
  usage: DailyUsage | null,
  quota: typeof PLAN_QUOTAS.free
) {
  const u = usage || {
    gpt4o_mini_count: 0,
    gpt4o_count: 0,
    gpt5_count: 0,
    claude_sonnet_count: 0,
    claude_opus_count: 0,
    gemini_count: 0,
    sd_images_count: 0,
    dalle_images_count: 0,
    files_analyzed_count: 0,
  };

  const calc = (used: number, limit: number) =>
    limit === -1 || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return {
    gpt4o_mini: calc(u.gpt4o_mini_count, quota.gpt4o_mini_daily),
    gpt4o: calc(u.gpt4o_count, quota.gpt4o_daily),
    gpt5: calc(u.gpt5_count, quota.gpt5_daily),
    claude_sonnet: calc(u.claude_sonnet_count, quota.claude_sonnet_daily),
    claude_opus: calc(u.claude_opus_count, quota.claude_opus_daily),
    gemini: calc(u.gemini_count, quota.gemini_daily),
    sd_images: calc(u.sd_images_count, quota.sd_images_daily),
    dalle_images: calc(u.dalle_images_count, quota.dalle_images_daily),
    files: calc(u.files_analyzed_count, quota.files_daily),
  };
}

function calculatePeriodStats(history: DailyUsage[]) {
  if (history.length === 0) {
    return {
      total_messages: 0,
      total_tokens: 0,
      total_images: 0,
      total_files: 0,
      total_cost_cents: 0,
      avg_daily_messages: 0,
      avg_daily_cost_cents: 0,
    };
  }

  const totals = history.reduce(
    (acc, day) => ({
      messages:
        acc.messages +
        day.gpt4o_mini_count +
        day.gpt4o_count +
        day.gpt5_count +
        day.claude_sonnet_count +
        day.claude_opus_count +
        day.gemini_count,
      tokens: acc.tokens + day.total_input_tokens + day.total_output_tokens,
      images: acc.images + day.sd_images_count + day.dalle_images_count,
      files: acc.files + day.files_analyzed_count,
      cost: acc.cost + day.total_cost_cents,
    }),
    { messages: 0, tokens: 0, images: 0, files: 0, cost: 0 }
  );

  return {
    total_messages: totals.messages,
    total_tokens: totals.tokens,
    total_images: totals.images,
    total_files: totals.files,
    total_cost_cents: totals.cost,
    avg_daily_messages: Math.round(totals.messages / history.length),
    avg_daily_cost_cents: Math.round(totals.cost / history.length),
  };
}
