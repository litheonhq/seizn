import { describe, expect, it, vi } from 'vitest';
import {
  AuthorAnthropicClient,
  AuthorLlmError,
  type ResolvedAuthorAnthropicKey,
} from '@/lib/author/llm';

function resolvedKey(overrides: Partial<ResolvedAuthorAnthropicKey> = {}): ResolvedAuthorAnthropicKey {
  return {
    apiKey: 'sk-ant-test-key',
    source: 'byok',
    byok: true,
    providerKeyId: 'provider-key-1',
    ...overrides,
  };
}

function message(text: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_123',
    _request_id: 'req_123',
    model: 'claude-test',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 11, output_tokens: 7 },
    stop_reason: 'end_turn',
    ...overrides,
  };
}

describe('Author Anthropic client', () => {
  it('generates text with the BYOK key and records usage', async () => {
    const create = vi.fn().mockResolvedValue(message('hello author'));
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const recordByokUsage = vi.fn().mockResolvedValue(undefined);

    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey(),
      createClient: (apiKey) => {
        expect(apiKey).toBe('sk-ant-test-key');
        return { messages: { create } };
      },
      recordUsage,
      recordByokUsage,
      sleep: async () => undefined,
    });

    const response = await client.generate({
      userId: 'user-1',
      projectId: 'knot',
      prompt: 'Write a safe test response.',
      model: 'claude-test',
      maxTokens: 64,
    });

    expect(response).toMatchObject({
      provider: 'anthropic',
      model: 'claude-test',
      text: 'hello author',
      requestId: 'req_123',
      byok: true,
      usage: { tokensIn: 11, tokensOut: 7 },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-test',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Write a safe test response.' }],
    }));
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'knot',
      provider: 'anthropic',
      tokensIn: 11,
      tokensOut: 7,
      byok: true,
      requestId: 'req_123',
    }));
    expect(recordByokUsage).toHaveBeenCalledWith(expect.objectContaining({
      providerKeyId: 'provider-key-1',
    }), 0);
  });

  it('parses and validates JSON response format', async () => {
    const create = vi.fn().mockResolvedValue(message('{"ok":true,"items":["a"]}'));
    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey({ source: 'managed', byok: false, providerKeyId: undefined }),
      createClient: () => ({ messages: { create } }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      recordByokUsage: vi.fn().mockResolvedValue(undefined),
      sleep: async () => undefined,
    });

    const response = await client.generate<{ ok: boolean; items: string[] }>({
      userId: 'user-1',
      projectId: 'knot',
      prompt: 'Return JSON.',
      responseFormat: 'json',
      jsonSchema: {
        type: 'object',
        required: ['ok', 'items'],
        properties: {
          ok: { type: 'boolean' },
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    });

    expect(response.json).toEqual({ ok: true, items: ['a'] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: process.env.AUTHOR_LLM_DEFAULT_MODEL ?? 'claude-opus-4-7',
    }));
  });

  it('fails invalid JSON schema responses explicitly', async () => {
    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey(),
      createClient: () => ({ messages: { create: vi.fn().mockResolvedValue(message('{"ok":"yes"}')) } }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      recordByokUsage: vi.fn().mockResolvedValue(undefined),
      sleep: async () => undefined,
    });

    await expect(client.generate({
      userId: 'user-1',
      projectId: 'knot',
      prompt: 'Return JSON.',
      responseFormat: 'json',
      jsonSchema: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
    })).rejects.toMatchObject<Partial<AuthorLlmError>>({
      code: 'JSON_SCHEMA_VALIDATION_FAILED',
    });
  });

  it('retries Anthropic 429s with exponential backoff', async () => {
    const rateLimitError = Object.assign(new Error('429 rate limit'), { status: 429 });
    const create = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue(message('ok'));
    const sleeps: number[] = [];

    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey(),
      createClient: () => ({ messages: { create } }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      recordByokUsage: vi.fn().mockResolvedValue(undefined),
      sleep: async (ms) => { sleeps.push(ms); },
      maxRetries: 3,
    });

    await expect(client.generate({
      userId: 'user-1',
      projectId: 'knot',
      prompt: 'retry',
    })).resolves.toMatchObject({ text: 'ok' });

    expect(create).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
  });
});
