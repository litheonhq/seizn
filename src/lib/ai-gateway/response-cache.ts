import { createHash } from 'node:crypto';
import type { GatewayRequest, GatewayResponse } from './types';

interface GatewayResponseCacheEntry {
  response: GatewayResponse;
  expiresAt: number;
  insertedAt: number;
}

const responseCache = new Map<string, GatewayResponseCacheEntry>();

const DEFAULT_TTL_MS = 60_000;
const MAX_CACHE_SIZE = 1_000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'request_id' && key !== 'timestamp' && key !== 'trace_id')
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function normalizeMessages(messages: GatewayRequest['messages']): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function getRequestIdentity(request: GatewayRequest): Record<string, unknown> {
  return {
    model: request.model,
    temperature: request.temperature ?? 0,
    maxTokens: request.maxTokens ?? 4096,
    messages: normalizeMessages(request.messages),
    preferredProvider: request.preferredProvider ?? null,
    fallbackProviders: request.fallbackProviders ?? [],
    orgId: request.metadata?.org_id ?? null,
    userId: request.metadata?.user_id ?? null,
  };
}

export function isGatewayResponseCacheEligible(request: GatewayRequest): boolean {
  if (request.stream) return false;
  if (request.tools && request.tools.length > 0) return false;
  if (request.toolChoice && request.toolChoice !== 'none') return false;

  const temperature = request.temperature ?? 0;
  return temperature <= 0.2;
}

export function buildGatewayResponseCacheKey(request: GatewayRequest): string {
  const identity = getRequestIdentity(request);
  return createHash('sha256').update(stableJson(identity)).digest('hex');
}

export function getGatewayResponseCache(request: GatewayRequest): GatewayResponse | null {
  if (!isGatewayResponseCacheEligible(request)) {
    return null;
  }

  const key = buildGatewayResponseCacheKey(request);
  const cached = responseCache.get(key);

  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (cached.expiresAt <= now) {
    responseCache.delete(key);
    return null;
  }

  return {
    ...cached.response,
    requestId: request.id,
    cached: true,
    metadata: {
      ...cached.response.metadata,
      cache_hit: true,
      cache_inserted_at: new Date(cached.insertedAt).toISOString(),
    },
  };
}

function evictIfNeeded(): void {
  if (responseCache.size < MAX_CACHE_SIZE) {
    return;
  }

  let oldestKey: string | null = null;
  let oldestTimestamp = Number.POSITIVE_INFINITY;

  for (const [key, entry] of responseCache.entries()) {
    if (entry.insertedAt < oldestTimestamp) {
      oldestTimestamp = entry.insertedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    responseCache.delete(oldestKey);
  }
}

export function setGatewayResponseCache(
  request: GatewayRequest,
  response: GatewayResponse,
  ttlMs = DEFAULT_TTL_MS
): void {
  if (!isGatewayResponseCacheEligible(request)) {
    return;
  }

  if (ttlMs <= 0) {
    return;
  }

  evictIfNeeded();

  const key = buildGatewayResponseCacheKey(request);
  const insertedAt = Date.now();

  responseCache.set(key, {
    response: {
      ...response,
      cached: true,
      metadata: {
        ...response.metadata,
        cache_inserted_at: new Date(insertedAt).toISOString(),
      },
    },
    insertedAt,
    expiresAt: insertedAt + ttlMs,
  });
}

export function clearGatewayResponseCache(): void {
  responseCache.clear();
}

export function getGatewayResponseCacheStats(): {
  entries: number;
  oldestEntryAgeMs: number | null;
} {
  if (responseCache.size === 0) {
    return { entries: 0, oldestEntryAgeMs: null };
  }

  const now = Date.now();
  let oldestAge = 0;

  for (const entry of responseCache.values()) {
    const age = now - entry.insertedAt;
    if (age > oldestAge) {
      oldestAge = age;
    }
  }

  return {
    entries: responseCache.size,
    oldestEntryAgeMs: oldestAge,
  };
}
