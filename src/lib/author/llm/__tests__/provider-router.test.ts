import { describe, expect, it } from 'vitest';

import { resolveAuthorLlmProvider } from '../provider-router';

describe('resolveAuthorLlmProvider', () => {
  it('returns the per-request override when valid', () => {
    expect(resolveAuthorLlmProvider('openai', {})).toBe('openai');
    expect(resolveAuthorLlmProvider('anthropic', {})).toBe('anthropic');
  });

  it('falls back to AUTHOR_LLM_PROVIDER env when no override', () => {
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'openai' })).toBe('openai');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: ' OPENAI ' })).toBe('openai');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'anthropic' })).toBe('anthropic');
  });

  it('defaults to anthropic when env is empty / unset / invalid', () => {
    expect(resolveAuthorLlmProvider(undefined, {})).toBe('anthropic');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: '' })).toBe('anthropic');
    expect(resolveAuthorLlmProvider(undefined, { AUTHOR_LLM_PROVIDER: 'bogus' })).toBe('anthropic');
  });

  it('per-request override beats env', () => {
    expect(
      resolveAuthorLlmProvider('anthropic', { AUTHOR_LLM_PROVIDER: 'openai' }),
    ).toBe('anthropic');
  });
});
