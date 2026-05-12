import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetInMemoryRateLimitForTests,
  __resetInMemoryUsageForTests,
  checkRateLimit,
  checkScope,
  enforceQuota,
  generateApiKey,
  hashApiKey,
  InvalidApiKeyError,
  recordAudit,
  recordUsage,
  rotateApiKey,
  validateBearer,
} from '..';

beforeEach(() => {
  __resetInMemoryRateLimitForTests();
  __resetInMemoryUsageForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Track 2 API key generation', () => {
  it('generates a high-entropy sk_seizn key with a SHA-256 hash', () => {
    const generated = generateApiKey();

    expect(generated.key).toMatch(/^sk_seizn_[a-f0-9]{8}_[A-Za-z0-9_-]+$/);
    expect(generated.prefix).toMatch(/^sk_seizn_[a-f0-9]{8}$/);
    expect(generated.hash).toBe(hashApiKey(generated.key));
    expect(generated.hash.length).toBeGreaterThan(0);
  });
});

describe('Track 2 API key validation', () => {
  it('validates a key by prefix lookup and timing-safe hash comparison', async () => {
    const generated = generateApiKey();
    const updates: unknown[] = [];
    const supabase = {
      from(table: string) {
        expect(table).toBe('api_keys');
        return {
          select() {
            return this;
          },
          or(expression: string) {
            expect(expression).toContain(generated.prefix);
            return this;
          },
          is() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: 'key-1',
              user_id: 'user-1',
              org_id: null,
              organization_id: null,
              scopes: ['recall'],
              prefix: generated.prefix,
              hash: generated.hash,
              rate_limit_per_minute: 30,
              monthly_quota: 100,
              monthly_quota_period: 'day',
              revoked_at: null,
              is_active: true,
            },
            error: null,
          }),
          update(value: unknown) {
            updates.push(value);
            return {
              eq: () => ({ error: null }),
            };
          },
        };
      },
    };

    const result = await validateBearer(generated.key, { supabase });

    expect(result).toMatchObject({
      apiKeyId: 'key-1',
      userId: 'user-1',
      scopes: ['recall'],
      monthlyQuotaPeriod: 'day',
    });
    expect(updates).toHaveLength(1);
  });

  it('rejects wrong hashes without accepting the prefix alone', async () => {
    const generated = generateApiKey();
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          or() {
            return this;
          },
          is() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: 'key-1',
              user_id: 'user-1',
              scopes: ['recall'],
              prefix: generated.prefix,
              hash: 'differenthash1234567890abcdef12345678',
              rate_limit_per_minute: 30,
              monthly_quota: 100,
              monthly_quota_period: 'day',
              revoked_at: null,
              is_active: true,
            },
            error: null,
          }),
        };
      },
    };

    await expect(validateBearer(generated.key, { supabase })).rejects.toBeInstanceOf(
      InvalidApiKeyError
    );
  });
});

describe('Track 2 rate limit and quota', () => {
  it('allows the configured per-minute limit and rejects the next call', async () => {
    for (let index = 0; index < 30; index += 1) {
      await checkRateLimit('key-1', 30);
    }

    await expect(checkRateLimit('key-1', 30)).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
    });
  });

  it('enforces daily quota using recorded usage', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'api_key_usage') {
          return {
            insert: async () => ({ error: null }),
          };
        }

        return {
          insert: async () => ({ error: null }),
        };
      },
    };

    for (let index = 0; index < 100; index += 1) {
      await recordUsage({ apiKeyId: 'key-1', tool: 'recall', supabase });
    }

    await expect(enforceQuota('key-1', 100, 'day', { supabase })).rejects.toMatchObject({
      code: 'quota_exceeded',
      status: 402,
    });
  });

  it('fails closed in production when Upstash Redis is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    await expect(checkRateLimit('key-1', 30)).rejects.toThrow(
      'Track 2 API requires Upstash Redis'
    );
  });
});

describe('Track 2 audit, scopes, and rotation', () => {
  it('records audit log events', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from(table: string) {
        expect(table).toBe('api_key_audit_log');
        return { insert };
      },
    };

    await recordAudit({
      apiKeyId: 'key-1',
      userId: 'user-1',
      action: 'created',
      supabase,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        api_key_id: 'key-1',
        user_id: 'user-1',
        action: 'created',
      })
    );
  });

  it('audits denied scopes', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from() {
        return { insert };
      },
    };

    await expect(
      checkScope(['recall'], 'check', {
        apiKeyId: 'key-1',
        userId: 'user-1',
        supabase,
      })
    ).rejects.toMatchObject({ code: 'scope_denied', status: 403 });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scope_denied',
        metadata: { required: 'check' },
      })
    );
  });

  it('rotates a key by revoking the old key and inserting a new key', async () => {
    const select = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              scopes: ['recall', 'extract'],
              rate_limit_per_minute: 120,
              monthly_quota: 10000,
              monthly_quota_period: 'month',
            },
            error: null,
          }),
        }),
      }),
    }));
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => ({ error: null }),
      }),
    }));
    const insert = vi.fn((value: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: { id: value.rotated_from_id === 'old-key' ? 'new-key' : 'unexpected' },
          error: null,
        }),
      }),
    }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from(table: string) {
        if (table === 'api_keys') {
          return { select, update, insert };
        }

        return { insert: auditInsert };
      },
    };

    const rotated = await rotateApiKey({
      oldKeyId: 'old-key',
      userId: 'user-1',
      scopes: ['recall'],
      supabase,
    });

    expect(rotated.id).toBe('new-key');
    expect(rotated.rotatedFromId).toBe('old-key');
    expect(rotated.key).toMatch(/^sk_seizn_/);
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('updated_at');
    expect(select).toHaveBeenCalledWith('scopes, rate_limit_per_minute, monthly_quota, monthly_quota_period');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        rotated_from_id: 'old-key',
        key_hash: rotated.hash,
        hash: rotated.hash,
        scopes: ['recall'],
        rate_limit_per_minute: 120,
        monthly_quota: 10000,
      })
    );
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'rotated' }));
  });
});
