// Rate limiting with sliding window for burst protection
// Uses Upstash Redis for distributed rate limiting with in-memory fallback

import { getLimit } from './plan-limits';
import { Redis } from '@upstash/redis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// =============================================================================
// Redis Client (Lazy Initialization)
// =============================================================================

let redisClient: Redis | null = null;
let redisInitialized = false;
let redisAvailable = false;

/**
 * Get Redis client with lazy initialization
 * Returns null if Redis is not configured or connection fails
 */
function getRedisClient(): Redis | null {
  if (redisInitialized) {
    return redisAvailable ? redisClient : null;
  }

  redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log('[RateLimit] Redis not configured, using in-memory fallback');
    redisAvailable = false;
    return null;
  }

  try {
    redisClient = new Redis({
      url,
      token,
    });
    redisAvailable = true;
    console.log('[RateLimit] Redis client initialized');
    return redisClient;
  } catch (error) {
    console.error('[RateLimit] Failed to initialize Redis client:', error);
    redisAvailable = false;
    return null;
  }
}

// =============================================================================
// In-Memory Fallback Store
// =============================================================================

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

// =============================================================================
// Legacy Rate Limits (Backward Compatibility)
// =============================================================================

// Legacy rate limits (kept for backwards compatibility)
// New code should use getLimit(plan, 'rateLimit') from plan-limits.ts
export const RATE_LIMITS: Record<string, number> = {
  free: 60,        // 60 req/min = 1 req/sec
  starter: 120,    // 120 req/min = 2 req/sec
  plus: 300,       // 300 req/min = 5 req/sec
  pro: 600,        // 600 req/min = 10 req/sec
  enterprise: 3000, // 3000 req/min = 50 req/sec
};

// =============================================================================
// Rate Limit Result Interface
// =============================================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

// =============================================================================
// Redis-Based Rate Limiting (Sliding Window)
// =============================================================================

/**
 * Check rate limit using Redis with sliding window algorithm
 * Uses atomic INCR + EXPIRE for consistency
 */
async function checkRateLimitRedis(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowSeconds = Math.ceil(windowMs / 1000);
  const redisKey = `rate_limit:${key}:${Math.floor(now / windowMs)}`;

  try {
    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, windowSeconds + 1); // Extra second for safety

    const results = await pipeline.exec();
    const count = results[0] as number;

    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      resetAt,
      limit,
    };
  } catch (error) {
    console.error('[RateLimit] Redis error, falling back to in-memory:', error);
    // Fall back to in-memory on Redis error
    return checkRateLimitMemory(key, limit, windowMs);
  }
}

// =============================================================================
// In-Memory Rate Limiting
// =============================================================================

/**
 * Check rate limit using in-memory store
 */
function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const memKey = `ratelimit:${key}`;
  const entry = rateLimitStore.get(memKey);

  // New window or expired window
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(memKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
      limit,
    };
  }

  // Within current window
  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit,
    };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
    limit,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check rate limit for a user (async version with Redis support)
 * Uses sliding window algorithm with 1-minute window
 */
export async function checkRateLimitAsync(
  identifier: string,
  plan: string = 'free'
): Promise<RateLimitResult> {
  const limit = getLimit(plan, 'rateLimit');
  const windowMs = 60 * 1000; // 1 minute window
  const key = identifier;

  const redis = getRedisClient();

  if (redis) {
    return checkRateLimitRedis(redis, key, limit, windowMs);
  }

  return checkRateLimitMemory(key, limit, windowMs);
}


/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };
}

/**
 * Check IP-based rate limit for unauthenticated endpoints (async version)
 * More restrictive than user-based limits
 */
export async function checkIpRateLimitAsync(ip: string): Promise<RateLimitResult> {
  const limit = 30; // 30 requests per minute for unauthenticated
  const windowMs = 60 * 1000;
  const key = `ip:${ip}`;

  const redis = getRedisClient();

  if (redis) {
    return checkRateLimitRedis(redis, key, limit, windowMs);
  }

  return checkRateLimitMemory(key, limit, windowMs);
}


// =============================================================================
// Failed Auth Rate Limiting (Brute Force Protection)
// =============================================================================

/**
 * Stricter rate limit for failed authentication attempts.
 * 5 failures per IP per 15 minutes — blocks brute force attacks.
 */
export async function checkAuthFailRateLimit(ip: string): Promise<RateLimitResult> {
  const limit = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const key = `auth_fail:${ip}`;

  const redis = getRedisClient();

  if (redis) {
    return checkRateLimitRedis(redis, key, limit, windowMs);
  }

  return checkRateLimitMemory(key, limit, windowMs);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if Redis is available for distributed rate limiting
 */
export function isRedisAvailable(): boolean {
  getRedisClient(); // Trigger initialization if not done
  return redisAvailable;
}

/**
 * Reset rate limit for a specific identifier (useful for testing)
 * Only works with Redis
 */
export async function resetRateLimit(identifier: string): Promise<boolean> {
  const redis = getRedisClient();

  if (!redis) {
    // Clear from in-memory store
    const keysToDelete: string[] = [];
    for (const key of rateLimitStore.keys()) {
      if (key.includes(identifier)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => rateLimitStore.delete(key));
    return true;
  }

  try {
    // Redis pattern matching to delete all rate limit keys for this identifier
    // Note: SCAN is more efficient for large keyspaces but not available in Upstash REST API
    // For rate limiting, we use time-windowed keys, so old keys expire automatically
    const now = Date.now();
    const windowMs = 60 * 1000;
    const currentWindow = Math.floor(now / windowMs);

    // Delete current and previous window keys
    const keys = [
      `rate_limit:${identifier}:${currentWindow}`,
      `rate_limit:${identifier}:${currentWindow - 1}`,
      `rate_limit:ip:${identifier}:${currentWindow}`,
      `rate_limit:ip:${identifier}:${currentWindow - 1}`,
    ];

    await Promise.all(keys.map(key => redis.del(key)));
    return true;
  } catch (error) {
    console.error('[RateLimit] Failed to reset rate limit:', error);
    return false;
  }
}

/**
 * Get current rate limit status without incrementing counter
 * Only available with Redis
 */
export async function getRateLimitStatus(
  identifier: string,
  plan: string = 'free'
): Promise<RateLimitResult | null> {
  const redis = getRedisClient();

  if (!redis) {
    // For in-memory, return current state
    const key = `ratelimit:${identifier}`;
    const entry = rateLimitStore.get(key);
    const limit = getLimit(plan, 'rateLimit');
    const now = Date.now();
    const windowMs = 60 * 1000;

    if (!entry || entry.resetAt < now) {
      return {
        allowed: true,
        remaining: limit,
        resetAt: now + windowMs,
        limit,
      };
    }

    return {
      allowed: entry.count < limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt: entry.resetAt,
      limit,
    };
  }

  try {
    const limit = getLimit(plan, 'rateLimit');
    const now = Date.now();
    const windowMs = 60 * 1000;
    const redisKey = `rate_limit:${identifier}:${Math.floor(now / windowMs)}`;

    const count = await redis.get<number>(redisKey) || 0;
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;

    return {
      allowed: count < limit,
      remaining: Math.max(0, limit - count),
      resetAt,
      limit,
    };
  } catch (error) {
    console.error('[RateLimit] Failed to get rate limit status:', error);
    return null;
  }
}
