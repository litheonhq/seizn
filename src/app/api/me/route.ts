import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { getPlan } from '@/lib/plan-limits';
import { RATE_LIMITS } from '@/lib/rate-limit';

// GET /api/me - Get current user's account info, plan, and usage
export async function GET(request: NextRequest) {
  // Authenticate request (skip usage check for this endpoint)
  const auth = await authenticateRequest(request, { skipUsageCheck: true });

  if (isAuthError(auth)) {
    return authErrorResponse(auth.authError);
  }

  const supabase = createServerClient();

  // Get user profile with full details
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404 }
    );
  }

  // Get API call count for this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: apiCallsThisMonth } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .gte('created_at', startOfMonth.toISOString());

  // Get active API keys count
  const { count: apiKeysCount } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .eq('is_active', true);

  const plan = profile.plan || 'free';
  const planConfig = getPlan(plan);
  const limits = { memories: planConfig.memories, apiCallsMonthly: planConfig.apiCallsMonthly, apiKeys: planConfig.apiKeys };
  const rateLimit = RATE_LIMITS[plan] || RATE_LIMITS.free;

  const response = NextResponse.json({
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.full_name,
      avatar: profile.avatar_url,
      createdAt: profile.created_at,
    },
    plan: {
      name: plan,
      limits: {
        memories: limits.memories,
        apiCallsMonthly: limits.apiCallsMonthly,
        apiKeys: limits.apiKeys,
        rateLimit: rateLimit,
      },
    },
    usage: {
      memories: profile.memory_count || 0,
      apiCallsThisMonth: apiCallsThisMonth || 0,
      apiKeys: apiKeysCount || 0,
    },
    remaining: {
      memories: limits.memories === -1 ? -1 : Math.max(0, limits.memories - (profile.memory_count || 0)),
      apiCallsThisMonth: limits.apiCallsMonthly === -1 ? -1 : Math.max(0, limits.apiCallsMonthly - (apiCallsThisMonth || 0)),
      apiKeys: Math.max(0, limits.apiKeys - (apiKeysCount || 0)),
    },
  });

  // Add rate limit headers
  if (auth.rateLimitHeaders) {
    Object.entries(auth.rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}
