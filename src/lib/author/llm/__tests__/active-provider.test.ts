import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveAuthorProvider,
  getActiveAuthorProviderSync,
} from '../active-provider';

vi.mock('../user-provider-pref', () => ({
  getUserAuthorLlmProvider: vi.fn(),
}));

import { getUserAuthorLlmProvider } from '../user-provider-pref';
const mockedGetUserPref = vi.mocked(getUserAuthorLlmProvider);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
  mockedGetUserPref.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getActiveAuthorProvider (async)', () => {
  it('priority 1: explicit override wins over everything', async () => {
    process.env.AUTHOR_LLM_PROVIDER = 'openai';
    mockedGetUserPref.mockResolvedValueOnce('openai');
    const result = await getActiveAuthorProvider('user-1', 'anthropic');
    expect(result).toBe('anthropic');
    // override short-circuits — DB should not be hit
    expect(mockedGetUserPref).not.toHaveBeenCalled();
  });

  it('priority 2: user pref beats env', async () => {
    process.env.AUTHOR_LLM_PROVIDER = 'anthropic';
    mockedGetUserPref.mockResolvedValueOnce('openai');
    const result = await getActiveAuthorProvider('user-1');
    expect(result).toBe('openai');
  });

  it('priority 3: env when no user pref', async () => {
    process.env.AUTHOR_LLM_PROVIDER = 'openai';
    mockedGetUserPref.mockResolvedValueOnce(null);
    const result = await getActiveAuthorProvider('user-1');
    expect(result).toBe('openai');
  });

  it('priority 4: anthropic default when nothing matches', async () => {
    delete process.env.AUTHOR_LLM_PROVIDER;
    mockedGetUserPref.mockResolvedValueOnce(null);
    const result = await getActiveAuthorProvider('user-1');
    expect(result).toBe('anthropic');
  });

  it('ignores invalid env value', async () => {
    process.env.AUTHOR_LLM_PROVIDER = 'cohere';
    mockedGetUserPref.mockResolvedValueOnce(null);
    expect(await getActiveAuthorProvider('user-1')).toBe('anthropic');
  });

  it('normalizes case + whitespace in env', async () => {
    process.env.AUTHOR_LLM_PROVIDER = '  OPENAI  ';
    mockedGetUserPref.mockResolvedValueOnce(null);
    expect(await getActiveAuthorProvider('user-1')).toBe('openai');
  });
});

describe('getActiveAuthorProviderSync', () => {
  it('priority 1: explicit override wins', () => {
    expect(getActiveAuthorProviderSync('anthropic', 'openai', { AUTHOR_LLM_PROVIDER: 'openai' })).toBe('anthropic');
  });

  it('priority 2: user pref over env', () => {
    expect(getActiveAuthorProviderSync(undefined, 'openai', { AUTHOR_LLM_PROVIDER: 'anthropic' })).toBe('openai');
  });

  it('priority 3: env when no user pref', () => {
    expect(getActiveAuthorProviderSync(undefined, null, { AUTHOR_LLM_PROVIDER: 'openai' })).toBe('openai');
  });

  it('priority 4: anthropic default', () => {
    expect(getActiveAuthorProviderSync(undefined, null, {})).toBe('anthropic');
  });

  it('null override does not short-circuit user pref', () => {
    expect(getActiveAuthorProviderSync(null, 'openai', {})).toBe('openai');
  });

  it('invalid override falls through to user pref', () => {
    // @ts-expect-error - intentionally testing invalid input
    expect(getActiveAuthorProviderSync('cohere', 'openai', {})).toBe('openai');
  });
});
