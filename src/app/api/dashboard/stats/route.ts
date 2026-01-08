import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

interface PlanLimits {
  memories: number;
  apiCalls: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { memories: 10000, apiCalls: 1000 },
  plus: { memories: 100000, apiCalls: 10000 },
  pro: { memories: 1000000, apiCalls: 100000 },
  enterprise: { memories: -1, apiCalls: -1 }, // unlimited
};

// GET /api/dashboard/stats - Get user statistics
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, created_at')
      .eq('id', session.user.id)
      .single();

    const plan = profile?.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Count memories
    const { count: memoriesCount } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id);

    // Count API calls today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: apiCallsToday } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('created_at', today.toISOString());

    // Get API key count
    const { count: keysCount } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('is_active', true);

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
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
