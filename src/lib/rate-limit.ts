// Rate limiting with sliding window for burst protection
// Uses in-memory cache with periodic cleanup

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (works per serverless instance)
// For production with multiple instances, use Upstash Redis
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

// Rate limits per plan (requests per minute)
export const RATE_LIMITS: Record<string, number> = {
  free: 60,      // 60 req/min = 1 req/sec
  plus: 300,     // 300 req/min = 5 req/sec
  pro: 600,      // 600 req/min = 10 req/sec
  enterprise: 3000, // 3000 req/min = 50 req/sec
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Check rate limit for a user
 * Uses sliding window algorithm with 1-minute window
 */
export function checkRateLimit(
  identifier: string,
  plan: string = 'free'
): RateLimitResult {
  cleanup();

  const limit = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const key = `ratelimit:${identifier}`;

  const entry = rateLimitStore.get(key);

  // New window or expired window
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, {
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
 * Check IP-based rate limit for unauthenticated endpoints
 * More restrictive than user-based limits
 */
export function checkIpRateLimit(ip: string): RateLimitResult {
  const limit = 30; // 30 requests per minute for unauthenticated
  const now = Date.now();
  const windowMs = 60 * 1000;
  const key = `ip:${ip}`;

  cleanup();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, {
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

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
    limit,
  };
}
