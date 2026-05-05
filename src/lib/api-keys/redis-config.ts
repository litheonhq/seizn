import { Redis } from '@upstash/redis';
import type { RedisLike } from './types';

export const TRACK_2_REDIS_PRODUCTION_ERROR =
  'Track 2 API requires Upstash Redis. See docs/architecture/seizn-author-track-2-phase-0-task-pack-2026-05-06.md Pre-flight';

export function assertTrack2RedisConfiguredForProduction(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (
    process.env.NEXT_PUBLIC_E2E_MODE === 'true' ||
    process.env.SKIP_ENV_VALIDATION === 'true'
  ) {
    return;
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(TRACK_2_REDIS_PRODUCTION_ERROR);
  }
}

export function createTrack2RedisFromEnv(): RedisLike | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new Redis({ url, token });
  }

  assertTrack2RedisConfiguredForProduction();
  return null;
}
