// Coach analysis result cache.
//
// 7-day TTL on Redis. Identical input prompts (hash-keyed) return the cached
// CoachAnalysis without re-running the LLM. This is what PR C #8 originally
// promised; the previous `cached: false` was hardcoded.
//
// Cache writes are best-effort: a Redis outage falls through to a normal
// LLM call. Cache reads are likewise best-effort — a parse error or
// connection failure returns null and we re-run the LLM.

import { getRedis } from '@/lib/redis';
import type { CoachAnalysis } from './schema';

const REDIS_KEY_PREFIX = 'coach:analysis:';
const REDIS_TTL_SECONDS = 60 * 60 * 24 * 7;

function cacheKey(hash: string): string {
  return `${REDIS_KEY_PREFIX}${hash}`;
}

export async function getCachedCoachAnalysis(hash: string): Promise<CoachAnalysis | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<CoachAnalysis>(cacheKey(hash));
    if (!cached) return null;
    // Upstash returns the value as-is; we trust the shape since we wrote it.
    return cached;
  } catch {
    return null;
  }
}

export async function setCachedCoachAnalysis(hash: string, analysis: CoachAnalysis): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey(hash), analysis, { ex: REDIS_TTL_SECONDS });
  } catch {
    // Non-fatal: cache write failure means the next request just re-runs the LLM.
  }
}
