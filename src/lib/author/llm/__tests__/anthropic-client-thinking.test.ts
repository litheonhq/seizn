import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildAnthropicMessageParams } from '../anthropic-client';

const ORIGINAL_ENV = { ...process.env };

const baseRequest = {
  userId: 'user-1',
  projectId: 'project-1',
  prompt: 'Outline a 12-chapter heist novel',
};

describe('buildAnthropicMessageParams (extended thinking)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, AUTHOR_LLM_EFFORT: '' };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('attaches extended-thinking block on Opus 4.7 at default xhigh effort', () => {
    const params = buildAnthropicMessageParams(baseRequest, 'claude-opus-4-7');
    expect(params).toMatchObject({
      model: 'claude-opus-4-7',
      thinking: { type: 'enabled', budget_tokens: 32_000 },
    });
    // max_tokens must accommodate the thinking budget + output room
    expect(params.max_tokens as number).toBeGreaterThanOrEqual(32_000 + 4096);
  });

  it('honors per-request effort override (high → 16k budget)', () => {
    const params = buildAnthropicMessageParams(
      { ...baseRequest, effort: 'high' },
      'claude-opus-4-7',
    );
    expect(params).toMatchObject({
      thinking: { type: 'enabled', budget_tokens: 16_000 },
    });
  });

  it('respects AUTHOR_LLM_EFFORT env override', () => {
    process.env.AUTHOR_LLM_EFFORT = 'high';
    const params = buildAnthropicMessageParams(baseRequest, 'claude-opus-4-7');
    expect(params).toMatchObject({
      thinking: { type: 'enabled', budget_tokens: 16_000 },
    });
  });

  it('skips thinking block on legacy models that do not support it', () => {
    const params = buildAnthropicMessageParams(baseRequest, 'claude-3-5-sonnet-20241022');
    expect(params).not.toHaveProperty('thinking');
    // legacy models still accept temperature
    const withTemp = buildAnthropicMessageParams(
      { ...baseRequest, temperature: 0.7 },
      'claude-3-5-sonnet-20241022',
    );
    expect(withTemp).toMatchObject({ temperature: 0.7 });
  });

  it('drops temperature on Opus 4.7 even when caller passes it (extended-thinking models)', () => {
    const params = buildAnthropicMessageParams(
      { ...baseRequest, temperature: 0.7 },
      'claude-opus-4-7',
    );
    expect(params).not.toHaveProperty('temperature');
  });

  it('appends JSON instruction to system when responseFormat=json', () => {
    const params = buildAnthropicMessageParams(
      { ...baseRequest, system: 'You are a novelist.', responseFormat: 'json' },
      'claude-opus-4-7',
    );
    expect(params.system).toMatch(/Return valid JSON only/);
    expect(params.system).toMatch(/You are a novelist/);
  });

  it('preserves caller maxTokens when it already exceeds thinking budget + output room', () => {
    const params = buildAnthropicMessageParams(
      { ...baseRequest, maxTokens: 64_000 },
      'claude-opus-4-7',
    );
    expect(params.max_tokens).toBe(64_000);
  });
});
