// Redis client for caching (Upstash)
import { Redis } from "@upstash/redis";

// Create Redis client (only if configured)
function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Redis not configured - caching disabled
    return null;
  }

  return new Redis({ url, token });
}

// Singleton Redis instance
let redis: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (redis === undefined) {
    redis = createRedisClient();
  }
  return redis;
}

// Cache helper functions
const EMBEDDING_CACHE_PREFIX = "emb:";
const EMBEDDING_CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

// Simple hash function for cache keys
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Get cached embedding
export async function getCachedEmbedding(
  text: string,
  inputType: "document" | "query"
): Promise<number[] | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const key = `${EMBEDDING_CACHE_PREFIX}${inputType}:${hashText(text)}`;
    const cached = await client.get<number[]>(key);
    return cached;
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
}

// Set cached embedding
export async function setCachedEmbedding(
  text: string,
  inputType: "document" | "query",
  embedding: number[]
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const key = `${EMBEDDING_CACHE_PREFIX}${inputType}:${hashText(text)}`;
    await client.set(key, embedding, { ex: EMBEDDING_CACHE_TTL });
  } catch (error) {
    console.error("Redis set error:", error);
    // Don't throw - caching failure shouldn't break the app
  }
}

// Cache stats (for monitoring)
export async function getCacheStats(): Promise<{ keys: number } | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const keys = await client.dbsize();
    return { keys };
  } catch (error) {
    console.error("Redis stats error:", error);
    return null;
  }
}
