import { RateLimitExceededError } from './errors';
import { recordAudit } from './audit';
import { createTrack2RedisFromEnv } from './redis-config';
import type { RedisLike, SupabaseLike } from './types';

type RateLimitContext = {
  userId?: string;
  orgId?: string | null;
  supabase?: SupabaseLike;
  redis?: RedisLike;
  now?: Date;
};

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export function __resetInMemoryRateLimitForTests(): void {
  memoryBuckets.clear();
}

async function checkMemoryRateLimit(
  apiKeyId: string,
  perMinute: number,
  now: Date
): Promise<void> {
  const bucketKey = `${apiKeyId}:${Math.floor(now.getTime() / 60_000)}`;
  const resetAt = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  const bucket = memoryBuckets.get(bucketKey) ?? { count: 0, resetAt };
  bucket.count += 1;
  memoryBuckets.set(bucketKey, bucket);

  if (bucket.count > perMinute) {
    throw new RateLimitExceededError(Math.max(1, Math.ceil((bucket.resetAt - now.getTime()) / 1000)));
  }
}

export async function checkRateLimit(
  apiKeyId: string,
  perMinute: number,
  context: RateLimitContext = {}
): Promise<void> {
  const now = context.now ?? new Date();
  const redis = context.redis ?? createTrack2RedisFromEnv();

  try {
    if (!redis) {
      await checkMemoryRateLimit(apiKeyId, perMinute, now);
      return;
    }

    const bucketKey = `track2:rate:${apiKeyId}:${Math.floor(now.getTime() / 60_000)}`;
    const count = await redis.incr(bucketKey);
    if (count === 1) {
      await redis.expire(bucketKey, 65);
    }

    if (count > perMinute) {
      throw new RateLimitExceededError(60);
    }
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      if (context.userId) {
        await recordAudit({
          apiKeyId,
          userId: context.userId,
          orgId: context.orgId,
          action: 'rate_limited',
          metadata: { perMinute },
          supabase: context.supabase,
        });
      }

      throw error;
    }

    throw error;
  }
}
