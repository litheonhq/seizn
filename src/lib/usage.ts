import { createServerClient } from './supabase';

interface PlanLimits {
  memories: number;
  apiCallsDaily: number;
  apiKeys: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { memories: 10000, apiCallsDaily: 1000, apiKeys: 2 },
  plus: { memories: 100000, apiCallsDaily: 10000, apiKeys: 5 },
  pro: { memories: 1000000, apiCallsDaily: 100000, apiKeys: 10 },
  enterprise: { memories: -1, apiCallsDaily: -1, apiKeys: 100 }, // -1 = unlimited
};

interface UsageCheck {
  allowed: boolean;
  reason?: string;
  usage?: {
    memories: number;
    apiCallsToday: number;
  };
  limits?: PlanLimits;
  plan?: string;
}

/**
 * Check if user has exceeded their plan limits
 */
export async function checkUsageLimits(userId: string): Promise<UsageCheck> {
  const supabase = createServerClient();

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, memory_count')
    .eq('id', userId)
    .single();

  const plan = profile?.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  // Count API calls today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: apiCallsToday } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  const memoryCount = profile?.memory_count || 0;
  const callsToday = apiCallsToday || 0;

  // Check memory limit (only if not unlimited)
  if (limits.memories > 0 && memoryCount >= limits.memories) {
    return {
      allowed: false,
      reason: `Memory limit reached (${limits.memories.toLocaleString()} for ${plan} plan)`,
      usage: { memories: memoryCount, apiCallsToday: callsToday },
      limits,
      plan,
    };
  }

  // Check API call limit (only if not unlimited)
  if (limits.apiCallsDaily > 0 && callsToday >= limits.apiCallsDaily) {
    return {
      allowed: false,
      reason: `Daily API call limit reached (${limits.apiCallsDaily.toLocaleString()} for ${plan} plan)`,
      usage: { memories: memoryCount, apiCallsToday: callsToday },
      limits,
      plan,
    };
  }

  return {
    allowed: true,
    usage: { memories: memoryCount, apiCallsToday: callsToday },
    limits,
    plan,
  };
}

interface LogParams {
  userId: string;
  apiKeyId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  embeddingTokens?: number;
}

/**
 * Log API usage for tracking and billing
 */
export async function logApiUsage(params: LogParams): Promise<void> {
  const supabase = createServerClient();

  try {
    await supabase.from('usage_logs').insert({
      user_id: params.userId,
      api_key_id: params.apiKeyId,
      endpoint: params.endpoint,
      method: params.method,
      status_code: params.statusCode,
      latency_ms: params.latencyMs,
      input_tokens: params.inputTokens || 0,
      output_tokens: params.outputTokens || 0,
      embedding_tokens: params.embeddingTokens || 0,
      cost_cents: calculateCost(params),
    });
  } catch (error) {
    console.error('Failed to log API usage:', error);
    // Don't throw - logging failure shouldn't break the API
  }
}

/**
 * Calculate cost in cents based on token usage
 */
function calculateCost(params: LogParams): number {
  // Pricing (approximate):
  // Claude: $0.003/1K input, $0.015/1K output
  // Voyage: $0.00002/embedding
  const inputCost = ((params.inputTokens || 0) / 1000) * 0.3; // cents
  const outputCost = ((params.outputTokens || 0) / 1000) * 1.5; // cents
  const embeddingCost = (params.embeddingTokens || 0) * 0.002; // cents

  return Math.ceil(inputCost + outputCost + embeddingCost);
}

/**
 * Update API key last_used_at timestamp
 */
export async function updateApiKeyLastUsed(keyId: string): Promise<void> {
  const supabase = createServerClient();

  try {
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId);
  } catch (error) {
    console.error('Failed to update API key last used:', error);
  }
}
