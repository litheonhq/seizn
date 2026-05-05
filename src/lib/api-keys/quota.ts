import { createServerClient } from '@/lib/supabase';
import { QuotaExceededError } from './errors';
import { recordAudit } from './audit';
import { createTrack2RedisFromEnv } from './redis-config';
import type { ApiKeyPeriod, ApiKeyTool, RedisLike, SupabaseLike } from './types';

type UsageInput = {
  apiKeyId: string;
  tool: ApiKeyTool;
  projectId?: string | null;
  costUnits?: number;
  llmCostUsdMilli?: number;
  llmProvider?: string | null;
  llmModel?: string | null;
  supabase?: SupabaseLike;
  redis?: RedisLike;
  now?: Date;
};

const memoryUsage = new Map<string, number>();

export function __resetInMemoryUsageForTests(): void {
  memoryUsage.clear();
}

function periodStart(now: Date, period: ApiKeyPeriod): Date {
  if (period === 'day') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function usageKey(apiKeyId: string, period: ApiKeyPeriod, now: Date): string {
  const start = periodStart(now, period).toISOString().slice(0, period === 'day' ? 10 : 7);
  return `track2:usage:${apiKeyId}:${period}:${start}`;
}

export async function recordUsage(input: UsageInput): Promise<void> {
  const supabase = input.supabase ?? createServerClient();
  const costUnits = input.costUnits ?? 1;
  const { error } = await supabase.from('api_key_usage').insert({
    api_key_id: input.apiKeyId,
    tool: input.tool,
    project_id: input.projectId ?? null,
    cost_units: costUnits,
    llm_cost_usd_milli: input.llmCostUsdMilli ?? 0,
    llm_provider: input.llmProvider ?? null,
    llm_model: input.llmModel ?? null,
    occurred_at: (input.now ?? new Date()).toISOString(),
  });

  if (error) {
    throw error;
  }

  const redis = input.redis ?? createTrack2RedisFromEnv();
  const now = input.now ?? new Date();
  for (const period of ['day', 'month'] as const) {
    const key = usageKey(input.apiKeyId, period, now);
    if (redis) {
      const next = await redis.incr(key);
      if (next === 1) {
        await redis.expire(key, period === 'day' ? 2 * 86_400 : 31 * 86_400);
      }
      if (costUnits > 1) {
        await redis.set(key, next + costUnits - 1, {
          ex: period === 'day' ? 2 * 86_400 : 31 * 86_400,
        });
      }
    } else {
      memoryUsage.set(key, (memoryUsage.get(key) ?? 0) + costUnits);
    }
  }
}

export async function getUsage(
  apiKeyId: string,
  period: ApiKeyPeriod,
  deps: { supabase?: SupabaseLike; redis?: RedisLike; now?: Date } = {}
): Promise<number> {
  const now = deps.now ?? new Date();
  const key = usageKey(apiKeyId, period, now);
  const redis = deps.redis ?? createTrack2RedisFromEnv();

  if (redis) {
    const cached = await redis.get<number>(key);
    if (typeof cached === 'number') {
      return cached;
    }
  } else if (memoryUsage.has(key)) {
    return memoryUsage.get(key) ?? 0;
  }

  const supabase = deps.supabase ?? createServerClient();
  const { data, error } = await supabase
    .from('api_key_usage')
    .select('cost_units')
    .eq('api_key_id', apiKeyId)
    .gte('occurred_at', periodStart(now, period).toISOString());

  if (error) {
    throw error;
  }

  const total = (data ?? []).reduce(
    (sum: number, row: { cost_units?: number }) => sum + (row.cost_units ?? 0),
    0
  );

  if (redis) {
    await redis.set(key, total, { ex: period === 'day' ? 2 * 86_400 : 31 * 86_400 });
  } else {
    memoryUsage.set(key, total);
  }

  return total;
}

export async function enforceQuota(
  apiKeyId: string,
  quota: number,
  period: ApiKeyPeriod,
  context: {
    userId?: string;
    orgId?: string | null;
    supabase?: SupabaseLike;
    redis?: RedisLike;
    now?: Date;
  } = {}
): Promise<void> {
  const used = await getUsage(apiKeyId, period, context);
  if (used < quota) {
    return;
  }

  if (context.userId) {
    await recordAudit({
      apiKeyId,
      userId: context.userId,
      orgId: context.orgId,
      action: 'quota_exceeded',
      metadata: { quota, period, used },
      supabase: context.supabase,
    });
  }

  throw new QuotaExceededError(period);
}
