import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { getPlan } from '@/lib/plan-limits';
import { logServerError } from '@/lib/server/logger';

// GET /api/dashboard/stats - Get user statistics
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return AuthErrors.unauthorized('dashboard stats');
    }

    const supabase = createServerClient();
    const userId = sessionUser.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      { data: profile, error: profileError },
      { count: memoriesCount, error: memoriesError },
      { count: apiCallsToday, error: apiCallsError },
      { count: keysCount, error: keysError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('plan, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', today.toISOString()),
      supabase
        .from('api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true),
    ]);

    if (profileError) {
      logServerError('Dashboard stats profile lookup failed', profileError, { userId });
      return ServerErrors.database('dashboard_stats_profile');
    }
    if (memoriesError || apiCallsError || keysError) {
      logServerError('Dashboard stats aggregate lookup failed', {
        memoriesError,
        apiCallsError,
        keysError,
      }, { userId });
      return ServerErrors.database('dashboard_stats');
    }

    const plan = profile?.plan || 'free';
    const planConfig = getPlan(plan);
    const limits = { memories: planConfig.memories, apiCalls: planConfig.apiCallsMonthly };

    return NextResponse.json({
      success: true,
      stats: {
        memories: {
          count: memoriesCount || 0,
          limit: limits.memories,
          percentage: limits.memories > 0
            ? Math.round(((memoriesCount || 0) / limits.memories) * 100)
            : 0,
        },
        apiCalls: {
          today: apiCallsToday || 0,
          limit: limits.apiCalls,
          percentage: limits.apiCalls > 0
            ? Math.round(((apiCallsToday || 0) / limits.apiCalls) * 100)
            : 0,
        },
        keys: keysCount || 0,
        plan: plan,
        planDisplay: plan.charAt(0).toUpperCase() + plan.slice(1),
      },
    });
  } catch (error) {
    logServerError('Stats error', error);
    return ServerErrors.internal('dashboard_stats');
  }
}
