import { describe, expect, it } from 'vitest';

import { resolveAuthorLlmProvider } from '../provider-router';

describe('resolveAuthorLlmProvider', () => {
  it('returns the per-request override when valid', () => {
    expect(resolveAuthorLlmProvider('openai', {})).toBe('openai');
    expect(resolveAuthorLlmProvider('anthropic', {})).toBe('anthropic');
  });

  it('falls back to user preference when no request override', () => {
    expect(resolveAuthorLlmProvider(undefined, {}, 'openai')).toBe('openai');
    expect(resolveAuthorLlmProvider(undefined, {}, 'anthropic')).toBe('anthropic');
  });

  it('falls back to AUTHOR_LLM_PROVIDER env when no override or user pref', () => {
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'openai' })).toBe('openai');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: ' OPENAI ' })).toBe('openai');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'anthropic' })).toBe('anthropic');
  });

  it('defaults to anthropic when nothing matches', () => {
    expect(resolveAuthorLlmProvider(undefined, {})).toBe('anthropic');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: '' })).toBe('anthropic');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'bogus' })).toBe('anthropic');
    expect(resolveAuthorLlmProvider(undefined, {}, null)).toBe('anthropic');
  });

  it('priority order: request override > user pref > env > default', () => {
    // Request override beats everything
    expect(resolveAuthorLlmProvider('anthropic', { AUTHOR_LLM_PROVIDER: 'openai' }, 'openai')).toBe('anthropic');
    // User pref beats env
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'anthropic' }, 'openai')).toBe('openai');
    // null user pref does NOT beat env
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'openai' }, null)).toBe('openai');
  });
});
