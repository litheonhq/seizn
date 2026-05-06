import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AUTHOR_LLM_EFFORT,
  getAnthropicThinkingBudget,
  getOpenAiReasoningEffort,
  isAuthorLlmEffort,
  modelSupportsExtendedThinking,
  resolveAuthorLlmEffort,
} from '../effort-mapping';

describe('effort-mapping', () => {
  it('defaults to xhigh', () => {
    expect(DEFAULT_AUTHOR_LLM_EFFORT).toBe('xhigh');
  });

  it('isAuthorLlmEffort guards string narrowing', () => {
    expect(isAuthorLlmEffort('xhigh')).toBe(true);
    expect(isAuthorLlmEffort('high')).toBe(true);
    expect(isAuthorLlmEffort('mid')).toBe(false);
    expect(isAuthorLlmEffort(undefined)).toBe(false);
  });

  it('resolveAuthorLlmEffort reads env, falls back to xhigh', () => {
    expect(resolveAuthorLlmEffort({ AUTHOR_LLM_EFFORT: 'high' })).toBe('high');
    expect(resolveAuthorLlmEffort({ AUTHOR_LLM_EFFORT: '  XHIGH  ' })).toBe('xhigh');
    expect(resolveAuthorLlmEffort({ AUTHOR_LLM_EFFORT: 'bogus' })).toBe('xhigh');
    expect(resolveAuthorLlmEffort({})).toBe('xhigh');
  });

  it('Anthropic thinking budgets escalate monotonically', () => {
    expect(getAnthropicThinkingBudget('low')).toBe(4_000);
    expect(getAnthropicThinkingBudget('medium')).toBe(8_000);
    expect(getAnthropicThinkingBudget('high')).toBe(16_000);
    expect(getAnthropicThinkingBudget('xhigh')).toBe(32_000);
    expect(getAnthropicThinkingBudget('max')).toBe(64_000);
  });

  it('OpenAI reasoning_effort tops out at xhigh (max → xhigh)', () => {
    expect(getOpenAiReasoningEffort('low')).toBe('low');
    expect(getOpenAiReasoningEffort('high')).toBe('high');
    expect(getOpenAiReasoningEffort('xhigh')).toBe('xhigh');
    expect(getOpenAiReasoningEffort('max')).toBe('xhigh');
  });

  it('modelSupportsExtendedThinking matches Opus 4.7 + future Opus/Sonnet 5+', () => {
    expect(modelSupportsExtendedThinking('claude-opus-4-7')).toBe(true);
    expect(modelSupportsExtendedThinking('claude-opus-4-7-20260101')).toBe(true);
    expect(modelSupportsExtendedThinking('claude-opus-5')).toBe(true);
    expect(modelSupportsExtendedThinking('claude-sonnet-6-1')).toBe(true);
    expect(modelSupportsExtendedThinking('claude-sonnet-4-6')).toBe(false);
    expect(modelSupportsExtendedThinking('claude-3-5-sonnet-20241022')).toBe(false);
    expect(modelSupportsExtendedThinking('gpt-5.5')).toBe(false);
  });
});
