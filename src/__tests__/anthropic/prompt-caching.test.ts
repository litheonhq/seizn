import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANTHROPIC_PROMPT_CACHING_BETA,
  buildAnthropicHeaders,
  buildCachedSystemPrompt,
  extractAnthropicCacheUsage,
  isAnthropicPromptCachingEnabled,
} from '@/lib/anthropic/prompt-caching';

const ORIGINAL_ENV = process.env.ANTHROPIC_PROMPT_CACHING;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ANTHROPIC_PROMPT_CACHING;
  } else {
    process.env.ANTHROPIC_PROMPT_CACHING = ORIGINAL_ENV;
  }
  vi.restoreAllMocks();
});

describe('anthropic prompt caching helpers', () => {
  it('enables prompt caching by default', () => {
    delete process.env.ANTHROPIC_PROMPT_CACHING;
    expect(isAnthropicPromptCachingEnabled()).toBe(true);
  });

  it('disables prompt caching when flag is false', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = 'false';
    expect(isAnthropicPromptCachingEnabled()).toBe(false);
  });

  it('adds anthropic-beta prompt-caching header when enabled', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = '1';

    const headers = buildAnthropicHeaders('test-key');

    expect(headers['anthropic-beta']).toContain(ANTHROPIC_PROMPT_CACHING_BETA);
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('merges existing anthropic-beta header values', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = '1';

    const headers = buildAnthropicHeaders('test-key', {
      'anthropic-beta': 'other-feature-2025-01-01',
    });

    expect(headers['anthropic-beta']).toContain('other-feature-2025-01-01');
    expect(headers['anthropic-beta']).toContain(ANTHROPIC_PROMPT_CACHING_BETA);
  });

  it('returns cached system prompt blocks when enabled', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = '1';

    const system = buildCachedSystemPrompt('System instructions');

    expect(Array.isArray(system)).toBe(true);
    expect(system).toEqual([
      {
        type: 'text',
        text: 'System instructions',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('returns plain string system prompt when disabled', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = '0';

    const system = buildCachedSystemPrompt('System instructions');

    expect(system).toBe('System instructions');
  });

  it('extracts cache usage counters safely', () => {
    const usage = extractAnthropicCacheUsage({
      cache_creation_input_tokens: 120,
      cache_read_input_tokens: 80,
    });

    expect(usage.cacheCreationInputTokens).toBe(120);
    expect(usage.cacheReadInputTokens).toBe(80);
  });
});

