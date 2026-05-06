import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthorLlmError,
  resolveAuthorAnthropicKey,
  saveAuthorByokKey,
} from '@/lib/author/llm';

vi.mock('@/lib/byok/encryption', () => ({
  encryptApiKey: (apiKey: string) => `encrypted:${apiKey.slice(-4)}`,
  generateKeyHint: (apiKey: string) => `...${apiKey.slice(-4)}`,
  validateKeyFormat: (provider: string, apiKey: string) =>
    (provider === 'anthropic' && /^sk-ant-[a-zA-Z0-9-]{32,}$/.test(apiKey))
    || (provider === 'openai' && /^sk-[a-zA-Z0-9_-]{32,}$/.test(apiKey)),
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  AUTHOR_ANTHROPIC_DEV_API_KEY: process.env.AUTHOR_ANTHROPIC_DEV_API_KEY,
  AUTHOR_LLM_ANTHROPIC_API_KEY: process.env.AUTHOR_LLM_ANTHROPIC_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

describe('Author BYOK resolver', () => {
  afterEach(() => {
    restoreEnv('NODE_ENV', ORIGINAL_ENV.NODE_ENV);
    restoreEnv('ANTHROPIC_API_KEY', ORIGINAL_ENV.ANTHROPIC_API_KEY);
    restoreEnv('AUTHOR_ANTHROPIC_DEV_API_KEY', ORIGINAL_ENV.AUTHOR_ANTHROPIC_DEV_API_KEY);
    restoreEnv('AUTHOR_LLM_ANTHROPIC_API_KEY', ORIGINAL_ENV.AUTHOR_LLM_ANTHROPIC_API_KEY);
    restoreEnv('SUPABASE_URL', ORIGINAL_ENV.SUPABASE_URL);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY);
    restoreEnv('NEXTAUTH_SECRET', ORIGINAL_ENV.NEXTAUTH_SECRET);
  });

  it('prefers the author user Anthropic BYOK key', async () => {
    const resolved = await resolveAuthorAnthropicKey(
      { userId: 'user-1', projectId: 'knot' },
      {
        lookupProviderKey: async () => ({
          id: 'provider-key-1',
          provider: 'anthropic',
          apiKey: 'anthropic-user-key',
          isDefault: true,
        }),
        nodeEnv: 'production',
      }
    );

    expect(resolved).toEqual({
      apiKey: 'anthropic-user-key',
      source: 'byok',
      byok: true,
      providerKeyId: 'provider-key-1',
    });
  });

  it('uses the managed Anthropic key in production when BYOK is missing', async () => {
    await expect(resolveAuthorAnthropicKey(
      { userId: 'user-1', projectId: 'knot' },
      {
        lookupProviderKey: async () => null,
        nodeEnv: 'production',
        env: { ANTHROPIC_API_KEY: 'anthropic-managed-key' },
      }
    )).resolves.toEqual({
      apiKey: 'anthropic-managed-key',
      source: 'managed',
      byok: false,
    });
  });

  it('fails when neither BYOK nor managed Anthropic key is configured', async () => {
    await expect(resolveAuthorAnthropicKey(
      { userId: 'user-1', projectId: 'knot' },
      {
        lookupProviderKey: async () => null,
        nodeEnv: 'production',
        env: {},
      }
    )).rejects.toMatchObject<Partial<AuthorLlmError>>({
      code: 'LLM_NOT_CONFIGURED',
    });
  });

  it('allows managed Anthropic dev key fallback outside production', async () => {
    const resolved = await resolveAuthorAnthropicKey(
      { userId: 'user-1', projectId: 'knot' },
      {
        lookupProviderKey: async () => null,
        nodeEnv: 'test',
        env: { AUTHOR_ANTHROPIC_DEV_API_KEY: 'anthropic-dev-key' },
      }
    );

    expect(resolved).toEqual({
      apiKey: 'anthropic-dev-key',
      source: 'managed',
      byok: false,
    });
  });

  it('does not expose raw keys through AuthorLlmError JSON', () => {
    const error = new AuthorLlmError('BYOK_REQUIRED', 'Author Memory v3 requires BYOK');

    expect(JSON.stringify(error)).not.toContain('sk-ant');
    expect(error.toJSON()).toMatchObject({
      code: 'BYOK_REQUIRED',
      message: 'Author Memory v3 requires BYOK',
    });
  });

  it('stores Author BYOK keys against profile user IDs without returning raw key material', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret-for-test-only';
    const rawKey = `sk-ant-${'a'.repeat(40)}`;
    const writes: Record<string, unknown>[] = [];
    const filters: Array<[string, string | boolean]> = [];

    const client = {
      from(table: string) {
        expect(table).toBe('provider_keys');
        return {
          update(values: Record<string, unknown>) {
            writes.push({ type: 'update', values });
            return {
              eq(column: string, value: string | boolean) {
                filters.push([column, value]);
                return this;
              },
              then(resolve: (value: { error: null }) => void) {
                resolve({ error: null });
              },
            };
          },
          insert(values: Record<string, unknown>) {
            writes.push({ type: 'insert', values });
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: 'provider-key-1',
                      provider: 'anthropic',
                      key_hint: '...aaaa',
                      created_at: '2026-05-02T00:00:00.000Z',
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const saved = await saveAuthorByokKey({
      userId: 'profile-user-1',
      provider: 'anthropic',
      apiKey: rawKey,
    }, client);

    const inserted = writes.find((write) => write.type === 'insert')?.values as Record<string, unknown>;
    // Security invariants FIRST so a return-shape regression on `saved` does
    // not fail-fast and skip the load-bearing assertions below. (Pre-audit
    // these came after the toEqual on `saved`; an outdated assertion that
    // missed the new `provider` field on the return shape would throw and
    // cancel the rest of the test silently.)
    expect(filters).toContainEqual(['user_id', 'profile-user-1']);
    expect(inserted.user_id).toBe('profile-user-1');
    expect(inserted.key_encrypted).not.toBe(rawKey);
    expect(JSON.stringify(inserted)).not.toContain(rawKey);
    expect(saved).toEqual({ valid: true, key_last_4: 'aaaa', provider: 'anthropic' });
  });

  it('stores OpenAI BYOK keys with provider tag in the return value', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret-for-test-only';
    const rawKey = `sk-${'b'.repeat(48)}`;
    const writes: Record<string, unknown>[] = [];

    const client = {
      from(table: string) {
        expect(table).toBe('provider_keys');
        return {
          update(values: Record<string, unknown>) {
            writes.push({ type: 'update', values });
            return {
              eq() { return this; },
              then(resolve: (value: { error: null }) => void) { resolve({ error: null }); },
            };
          },
          insert(values: Record<string, unknown>) {
            writes.push({ type: 'insert', values });
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: 'provider-key-openai-1',
                      provider: 'openai',
                      key_hint: '...bbbb',
                      created_at: '2026-05-07T00:00:00.000Z',
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const saved = await saveAuthorByokKey({
      userId: 'profile-user-2',
      provider: 'openai',
      apiKey: rawKey,
    }, client);

    const inserted = writes.find((write) => write.type === 'insert')?.values as Record<string, unknown>;
    expect(inserted.user_id).toBe('profile-user-2');
    expect(inserted.provider).toBe('openai');
    expect(inserted.label).toMatch(/Author Memory v3 OpenAI/);
    expect(inserted.key_encrypted).not.toBe(rawKey);
    expect(JSON.stringify(inserted)).not.toContain(rawKey);
    expect(saved).toEqual({ valid: true, key_last_4: rawKey.slice(-4), provider: 'openai' });
  });
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
