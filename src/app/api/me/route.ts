import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { PLAN_LIMITS } from '@/lib/usage';
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

  // Get API call count for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: apiCallsToday } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .gte('created_at', today.toISOString());

  // Get active API keys count
  const { count: apiKeysCount } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .eq('is_active', true);

  const plan = profile.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
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
        apiCallsDaily: limits.apiCallsDaily,
        apiKeys: limits.apiKeys,
        rateLimit: rateLimit,
      },
    },
    usage: {
      memories: profile.memory_count || 0,
      apiCallsToday: apiCallsToday || 0,
      apiKeys: apiKeysCount || 0,
    },
    remaining: {
      memories: limits.memories === -1 ? -1 : Math.max(0, limits.memories - (profile.memory_count || 0)),
      apiCallsToday: limits.apiCallsDaily === -1 ? -1 : Math.max(0, limits.apiCallsDaily - (apiCallsToday || 0)),
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
