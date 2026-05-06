import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildOpenAiChatParams, modelIsReasoningModel } from '../openai-client';

const ORIGINAL_ENV = { ...process.env };

const baseRequest = {
  userId: 'user-1',
  projectId: 'project-1',
  prompt: 'Outline a 12-chapter heist novel',
};

describe('buildOpenAiChatParams', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, AUTHOR_LLM_EFFORT: '' };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('uses max_completion_tokens + reasoning_effort on gpt-5.5 (reasoning model)', () => {
    const params = buildOpenAiChatParams(baseRequest, 'gpt-5.5');
    expect(params).toMatchObject({
      model: 'gpt-5.5',
      max_completion_tokens: 4_096,
      reasoning_effort: 'xhigh',
    });
    expect(params).not.toHaveProperty('max_tokens');
    expect(params).not.toHaveProperty('temperature');
  });

  it('honors per-request effort override (high → reasoning_effort:high)', () => {
    const params = buildOpenAiChatParams(
      { ...baseRequest, effort: 'high' },
      'gpt-5.5',
    );
    expect(params.reasoning_effort).toBe('high');
  });

  it('caps max effort at xhigh on OpenAI (max → xhigh)', () => {
    const params = buildOpenAiChatParams(
      { ...baseRequest, effort: 'max' },
      'gpt-5.5',
    );
    expect(params.reasoning_effort).toBe('xhigh');
  });

  it('uses max_tokens + temperature on non-reasoning models', () => {
    const params = buildOpenAiChatParams(
      { ...baseRequest, temperature: 0.7 },
      'gpt-4o',
    );
    expect(params).toMatchObject({
      model: 'gpt-4o',
      max_tokens: 4_096,
      temperature: 0.7,
    });
    expect(params).not.toHaveProperty('reasoning_effort');
    expect(params).not.toHaveProperty('max_completion_tokens');
  });

  it('attaches response_format json_object when responseFormat=json', () => {
    const params = buildOpenAiChatParams(
      { ...baseRequest, responseFormat: 'json' },
      'gpt-5.5',
    );
    expect(params.response_format).toEqual({ type: 'json_object' });
  });

  it('builds messages with system + user when system provided', () => {
    const params = buildOpenAiChatParams(
      { ...baseRequest, system: 'You are a novelist.' },
      'gpt-5.5',
    );
    expect(params.messages).toEqual([
      { role: 'system', content: 'You are a novelist.' },
      { role: 'user', content: baseRequest.prompt },
    ]);
  });

  it('appends JSON instruction to system when responseFormat=json', () => {
    const params = buildOpenAiChatParams(
      { ...baseRequest, system: 'You are a novelist.', responseFormat: 'json' },
      'gpt-5.5',
    );
    const messages = params.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toMatch(/Return valid JSON only/);
    expect(messages[0].content).toMatch(/You are a novelist/);
  });
});

describe('modelIsReasoningModel', () => {
  it('matches o1 / o3 / o4 / gpt-5 family', () => {
    expect(modelIsReasoningModel('o1-mini')).toBe(true);
    expect(modelIsReasoningModel('o3')).toBe(true);
    expect(modelIsReasoningModel('o4-mini')).toBe(true);
    expect(modelIsReasoningModel('gpt-5')).toBe(true);
    expect(modelIsReasoningModel('gpt-5.5')).toBe(true);
    expect(modelIsReasoningModel('gpt-5.5-pro-2026-04-23')).toBe(true);
  });

  it('rejects non-reasoning models', () => {
    expect(modelIsReasoningModel('gpt-4o')).toBe(false);
    expect(modelIsReasoningModel('gpt-4-turbo')).toBe(false);
    expect(modelIsReasoningModel('claude-opus-4-7')).toBe(false);
  });
});
