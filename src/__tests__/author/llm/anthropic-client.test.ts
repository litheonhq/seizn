import { describe, expect, it, vi } from 'vitest';
import {
  AuthorAnthropicClient,
  AuthorLlmError,
  type ResolvedAuthorAnthropicKey,
} from '@/lib/author/llm';

function resolvedKey(overrides: Partial<ResolvedAuthorAnthropicKey> = {}): ResolvedAuthorAnthropicKey {
  return {
    apiKey: 'anthropic-test-key',
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

function allowBudget() {
  return vi.fn().mockResolvedValue({
    allowed: true,
    cap: null,
    used: 0,
    projected: 0,
    overageTokens: 0,
    metered: false,
    stripeCustomerId: null,
  });
}

describe('Author Anthropic client', () => {
  it('generates text with the BYOK key and records usage', async () => {
    const create = vi.fn().mockResolvedValue(message('hello author'));
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const recordByokUsage = vi.fn().mockResolvedValue(undefined);
    const enforceBudget = allowBudget();

    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey(),
      createClient: (apiKey) => {
        expect(apiKey).toBe('anthropic-test-key');
        return { messages: { create } };
      },
      recordUsage,
      recordByokUsage,
      enforceBudget,
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
    expect(enforceBudget).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      byokActive: true,
      requestedTokens: expect.any(Number),
    }));
    expect(enforceBudget.mock.calls[0][0].requestedTokens).toBeGreaterThan(64);
  });

  it('parses and validates JSON response format', async () => {
    const create = vi.fn().mockResolvedValue(message('{"ok":true,"items":["a"]}'));
    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey({ source: 'managed', byok: false, providerKeyId: undefined }),
      createClient: () => ({ messages: { create } }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      recordByokUsage: vi.fn().mockResolvedValue(undefined),
      enforceBudget: allowBudget(),
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
    // Source resolves DEFAULT_AUTHOR_MODEL at module load as
    //   AUTHOR_LLM_DEFAULT_MODEL_ANTHROPIC ?? AUTHOR_LLM_DEFAULT_MODEL ?? 'claude-opus-4-7'
    // Mirror the same precedence here so the assertion is tight against the
    // real contract (pre-audit version only checked AUTHOR_LLM_DEFAULT_MODEL,
    // missing the per-provider override).
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model:
        process.env.AUTHOR_LLM_DEFAULT_MODEL_ANTHROPIC
        ?? process.env.AUTHOR_LLM_DEFAULT_MODEL
        ?? 'claude-opus-4-7',
    }));
  });

  it('fails invalid JSON schema responses explicitly', async () => {
    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey(),
      createClient: () => ({ messages: { create: vi.fn().mockResolvedValue(message('{"ok":"yes"}')) } }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      recordByokUsage: vi.fn().mockResolvedValue(undefined),
      enforceBudget: allowBudget(),
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
      enforceBudget: allowBudget(),
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

  it('meters managed overage only after a successful validated response', async () => {
    const create = vi.fn().mockResolvedValue(message('{"ok":true}', {
      usage: { input_tokens: 11, output_tokens: 17 },
    }));
    const budget = {
      allowed: true as const,
      cap: 1_000_000,
      used: 999_990,
      projected: 1_000_064,
      overageTokens: 64,
      metered: false,
      stripeCustomerId: 'cus_author_123',
    };
    const enforceBudget = vi.fn().mockResolvedValue(budget);
    const meterOverage = vi.fn().mockResolvedValue({
      metered: true,
      overageTokens: 7,
      actualProjected: 1_000_007,
    });

    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey({ source: 'managed', byok: false, providerKeyId: undefined }),
      createClient: () => ({ messages: { create } }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      recordByokUsage: vi.fn().mockResolvedValue(undefined),
      enforceBudget,
      meterOverage,
      sleep: async () => undefined,
    });

    await expect(client.generate({
      userId: 'user-1',
      projectId: 'knot',
      prompt: 'Return JSON.',
      maxTokens: 64,
      responseFormat: 'json',
      jsonSchema: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
    })).resolves.toMatchObject({
      json: { ok: true },
      byok: false,
      usage: { tokensIn: 11, tokensOut: 17 },
    });

    expect(enforceBudget).toHaveBeenCalledWith({
      userId: 'user-1',
      byokActive: false,
      requestedTokens: expect.any(Number),
    });
    expect(enforceBudget.mock.calls[0][0].requestedTokens).toBeGreaterThan(64);
    expect(meterOverage).toHaveBeenCalledWith({
      userId: 'user-1',
      byokActive: false,
      actualTotalTokens: 28,
      budget,
    });
  });

  it('does not meter or record usage when the Anthropic request fails', async () => {
    const meterOverage = vi.fn();
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const recordByokUsage = vi.fn().mockResolvedValue(undefined);
    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey({ source: 'managed', byok: false, providerKeyId: undefined }),
      createClient: () => ({ messages: { create: vi.fn().mockRejectedValue(new Error('timeout')) } }),
      recordUsage,
      recordByokUsage,
      enforceBudget: allowBudget(),
      meterOverage,
      sleep: async () => undefined,
      maxRetries: 0,
    });

    await expect(client.generate({
      userId: 'user-1',
      projectId: 'knot',
      prompt: 'fail',
    })).rejects.toMatchObject<Partial<AuthorLlmError>>({
      code: 'ANTHROPIC_REQUEST_FAILED',
    });
    // The user must NOT be billed for a failed request. If a future refactor
    // moves recordUsage above the throw, this catches the regression at unit
    // level rather than waiting for the next Stripe statement to surface it.
    expect(meterOverage).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
    expect(recordByokUsage).not.toHaveBeenCalled();
  });

  it('does not meter or record usage when JSON validation fails after the Anthropic response', async () => {
    const meterOverage = vi.fn();
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const recordByokUsage = vi.fn().mockResolvedValue(undefined);
    const client = new AuthorAnthropicClient({
      resolveKey: async () => resolvedKey({ source: 'managed', byok: false, providerKeyId: undefined }),
      createClient: () => ({ messages: { create: vi.fn().mockResolvedValue(message('{"ok":"yes"}')) } }),
      recordUsage,
      recordByokUsage,
      enforceBudget: allowBudget(),
      meterOverage,
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
    expect(meterOverage).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
    expect(recordByokUsage).not.toHaveBeenCalled();
  });
});
