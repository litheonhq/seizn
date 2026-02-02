/**
 * Idempotency Store
 *
 * Redis-based storage for idempotency records with TTL support.
 * Falls back gracefully when Redis is not configured.
 *
 * @module idempotency/store
 */

import { createHash } from 'crypto';
import { getRedis } from '@/lib/redis';
import type {
  IdempotencyRecord,
  StoredResponse,
  IdempotencyCheckResult,
  IdempotencyOptions,
} from './types';
import { DEFAULT_IDEMPOTENCY_OPTIONS } from './types';

// Key prefixes for Redis
const KEY_PREFIX = 'idem:';
const LOCK_PREFIX = 'idem_lock:';

/**
 * Generate a hash of the request body for conflict detection
 */
export function hashRequestBody(body: unknown): string {
  const normalized = JSON.stringify(body, Object.keys(body as object).sort());
  return createHash('sha256').update(normalized).digest('hex').substring(0, 32);
}

/**
 * Build the full Redis key for an idempotency record
 */
function buildKey(idempotencyKey: string, userId: string): string {
  return `${KEY_PREFIX}${userId}:${idempotencyKey}`;
}

/**
 * Build the lock key for concurrent request handling
 */
function buildLockKey(idempotencyKey: string, userId: string): string {
  return `${LOCK_PREFIX}${userId}:${idempotencyKey}`;
}

/**
 * Idempotency Store class
 *
 * Provides methods for checking, storing, and completing idempotent requests.
 */
export class IdempotencyStore {
  private options: Required<IdempotencyOptions>;

  constructor(options: IdempotencyOptions = {}) {
    this.options = {
      ...DEFAULT_IDEMPOTENCY_OPTIONS,
      ...options,
    };
  }

  /**
   * Check if an idempotency key exists and validate the request
   */
  async check(
    idempotencyKey: string,
    userId: string,
    endpoint: string,
    method: string,
    requestBody: unknown
  ): Promise<IdempotencyCheckResult> {
    const redis = getRedis();

    // Graceful fallback when Redis is not configured
    if (!redis) {
      console.warn('Redis not configured - idempotency disabled');
      return { type: 'new', key: idempotencyKey };
    }

    const key = buildKey(idempotencyKey, userId);
    const lockKey = buildLockKey(idempotencyKey, userId);
    const requestHash = hashRequestBody(requestBody);

    try {
      // Check for existing record
      const existing = await redis.get<IdempotencyRecord>(key);

      if (existing) {
        // Check for request body conflict
        if (existing.requestHash !== requestHash) {
          return {
            type: 'conflict',
            key: idempotencyKey,
            existingHash: existing.requestHash,
          };
        }

        // Request is still in progress
        if (existing.status === 'pending') {
          return { type: 'in_progress', key: idempotencyKey };
        }

        // Request completed - return cached response
        if (existing.status === 'completed' && existing.response) {
          return { type: 'cached', response: existing.response };
        }

        // Request failed - allow retry (treat as new)
        if (existing.status === 'failed') {
          // Delete the failed record to allow retry
          await redis.del(key);
        }
      }

      // Try to acquire lock (atomic set if not exists)
      const lockAcquired = await redis.set(lockKey, '1', {
        nx: true,
        ex: this.options.lockTimeoutSeconds,
      });

      if (!lockAcquired) {
        // Another request is processing with the same key
        return { type: 'in_progress', key: idempotencyKey };
      }

      // Create new pending record
      const record: IdempotencyRecord = {
        key: idempotencyKey,
        userId,
        endpoint,
        method,
        requestHash,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.options.ttlSeconds * 1000),
      };

      await redis.set(key, record, { ex: this.options.ttlSeconds });

      return { type: 'new', key: idempotencyKey };
    } catch (error) {
      console.error('Idempotency store error:', error);
      // On error, allow the request to proceed (fail-open)
      return { type: 'error', message: (error as Error).message };
    }
  }

  /**
   * Mark a request as completed and store the response
   */
  async complete(
    idempotencyKey: string,
    userId: string,
    response: Response | { status: number; headers: Headers; body: string }
  ): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = buildKey(idempotencyKey, userId);
    const lockKey = buildLockKey(idempotencyKey, userId);

    try {
      // Get existing record
      const existing = await redis.get<IdempotencyRecord>(key);
      if (!existing) return;

      // Extract response data
      const storedResponse: StoredResponse = {
        status: response.status,
        headers: this.extractHeaders(response.headers),
        body:
          typeof response.body === 'string'
            ? response.body
            : await this.extractBody(response),
      };

      // Update record with response
      const updated: IdempotencyRecord = {
        ...existing,
        status: 'completed',
        response: storedResponse,
        completedAt: new Date(),
      };

      // Calculate remaining TTL
      const remainingTtl = Math.max(
        0,
        Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000)
      );

      await redis.set(key, updated, {
        ex: remainingTtl || this.options.ttlSeconds,
      });

      // Release lock
      await redis.del(lockKey);
    } catch (error) {
      console.error('Idempotency complete error:', error);
      // Always try to release the lock
      try {
        await redis.del(lockKey);
      } catch {
        // Ignore lock release errors
      }
    }
  }

  /**
   * Mark a request as failed (allows retry with same key)
   */
  async fail(idempotencyKey: string, userId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = buildKey(idempotencyKey, userId);
    const lockKey = buildLockKey(idempotencyKey, userId);

    try {
      // Delete the record to allow retry
      await redis.del(key);
      await redis.del(lockKey);
    } catch (error) {
      console.error('Idempotency fail error:', error);
    }
  }

  /**
   * Delete an idempotency record (for cleanup)
   */
  async delete(idempotencyKey: string, userId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = buildKey(idempotencyKey, userId);
    const lockKey = buildLockKey(idempotencyKey, userId);

    try {
      await redis.del(key);
      await redis.del(lockKey);
    } catch (error) {
      console.error('Idempotency delete error:', error);
    }
  }

  /**
   * Get the current status of an idempotency key
   */
  async getStatus(
    idempotencyKey: string,
    userId: string
  ): Promise<IdempotencyRecord | null> {
    const redis = getRedis();
    if (!redis) return null;

    const key = buildKey(idempotencyKey, userId);

    try {
      return await redis.get<IdempotencyRecord>(key);
    } catch (error) {
      console.error('Idempotency getStatus error:', error);
      return null;
    }
  }

  /**
   * Extract headers to preserve from response
   */
  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};

    for (const headerName of this.options.preserveHeaders) {
      const value = headers.get(headerName);
      if (value) {
        result[headerName] = value;
      }
    }

    return result;
  }

  /**
   * Extract body from response
   */
  private async extractBody(
    response: Response | { body: string }
  ): Promise<string> {
    if ('body' in response && typeof response.body === 'string') {
      return response.body;
    }

    if (response instanceof Response) {
      try {
        return await response.clone().text();
      } catch {
        return '';
      }
    }

    return '';
  }
}

// Singleton instance with default options
let defaultStore: IdempotencyStore | null = null;

/**
 * Get the default idempotency store instance
 */
export function getIdempotencyStore(): IdempotencyStore {
  if (!defaultStore) {
    defaultStore = new IdempotencyStore();
  }
  return defaultStore;
}

/**
 * Create a custom idempotency store with specific options
 */
export function createIdempotencyStore(
  options: IdempotencyOptions
): IdempotencyStore {
  return new IdempotencyStore(options);
}
