import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserAuthorLlmProvider, setUserAuthorLlmProvider } from '../user-provider-pref';

vi.mock('@/lib/supabase', () => ({
  hasServerSupabaseServiceRoleConfig: () => true,
  createServerClient: () => undefined,
}));

type MaybeSingle = Promise<{ data?: { author_llm_provider?: string | null } | null; error?: { message?: string } | null }>;

function makeReadClient(value: string | null | undefined) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle(): MaybeSingle {
                  return Promise.resolve({ data: { author_llm_provider: value ?? null } });
                },
              };
            },
          };
        },
        update() {
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

function makeWriteClient(captureUpdate: (values: Record<string, unknown>) => void, error: { message?: string } | null = null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle(): MaybeSingle {
                  return Promise.resolve({ data: null });
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          captureUpdate(values);
          return { eq: async () => ({ error }) };
        },
      };
    },
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getUserAuthorLlmProvider', () => {
  it('returns "openai" when profile has openai stored', async () => {
    expect(await getUserAuthorLlmProvider('user-1', makeReadClient('openai'))).toBe('openai');
  });

  it('returns "anthropic" when profile has anthropic stored', async () => {
    expect(await getUserAuthorLlmProvider('user-1', makeReadClient('anthropic'))).toBe('anthropic');
  });

  it('returns null when profile column is NULL (= inherit env default)', async () => {
    expect(await getUserAuthorLlmProvider('user-1', makeReadClient(null))).toBeNull();
  });

  it('returns null when stored value is unrecognized (defensive)', async () => {
    expect(await getUserAuthorLlmProvider('user-1', makeReadClient('cohere'))).toBeNull();
  });

  it('normalizes case + whitespace', async () => {
    expect(await getUserAuthorLlmProvider('user-1', makeReadClient('  OpenAI  '))).toBe('openai');
  });
});

describe('setUserAuthorLlmProvider', () => {
  it('writes the provider value to profiles.author_llm_provider', async () => {
    let captured: Record<string, unknown> | null = null;
    await setUserAuthorLlmProvider('user-1', 'openai', makeWriteClient((v) => { captured = v; }));
    expect(captured).toEqual({ author_llm_provider: 'openai' });
  });

  it('clears the column when passed null', async () => {
    let captured: Record<string, unknown> | null = null;
    await setUserAuthorLlmProvider('user-1', null, makeWriteClient((v) => { captured = v; }));
    expect(captured).toEqual({ author_llm_provider: null });
  });

  it('rejects unknown providers with status 400', async () => {
    await expect(
      // @ts-expect-error - intentionally testing invalid input
      setUserAuthorLlmProvider('user-1', 'cohere', makeWriteClient(() => {})),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('forwards supabase errors', async () => {
    await expect(
      setUserAuthorLlmProvider('user-1', 'anthropic', makeWriteClient(() => {}, { message: 'permission denied' })),
    ).rejects.toMatchObject({ status: 500, message: expect.stringContaining('permission denied') });
  });
});
