import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(),
}));

import { AIGateway } from './gateway';
import type { LLMProvider, ProviderConfig, RoutingDecision } from './types';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalGoogleKey = process.env.GOOGLE_API_KEY;

function makeProvider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'provider-id',
    name: 'Provider',
    provider: 'openai',
    apiKey: 'test-key',
    models: ['*'],
    enabled: true,
    priority: 1,
    weight: 100,
    maxConcurrent: 10,
    rateLimit: {
      requestsPerMinute: 100,
      tokensPerMinute: 100000,
    },
    timeout: 60000,
    retryConfig: {
      maxRetries: 1,
      initialDelayMs: 10,
      maxDelayMs: 20,
      backoffMultiplier: 2,
      retryableErrors: [],
    },
    ...overrides,
  };
}

type GatewaySelectProviderAccessor = {
  selectProvider: (model: string, preferred?: LLMProvider) => RoutingDecision | null;
};

describe('AIGateway selectProvider fallback', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }

    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }

    if (originalGoogleKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    }
  });

  it('falls back to other providers when preferred provider cannot serve the model', () => {
    const gateway = new AIGateway();

    gateway.addProvider(
      makeProvider({
        id: 'openai-primary',
        name: 'OpenAI',
        provider: 'openai',
        models: ['gpt-4o'],
      })
    );

    gateway.addProvider(
      makeProvider({
        id: 'google-secondary',
        name: 'Google',
        provider: 'google',
        models: ['gemini-1.5-pro'],
      })
    );

    const routing = (gateway as unknown as GatewaySelectProviderAccessor).selectProvider(
      'gpt-4o',
      'google'
    );

    expect(routing).not.toBeNull();
    expect(routing.provider).toBe('openai');
  });

  it('keeps preferred provider when it can serve the model', () => {
    const gateway = new AIGateway();

    gateway.addProvider(
      makeProvider({
        id: 'openai-primary',
        name: 'OpenAI',
        provider: 'openai',
        models: ['gpt-4o'],
      })
    );

    gateway.addProvider(
      makeProvider({
        id: 'google-secondary',
        name: 'Google',
        provider: 'google',
        models: ['gemini-1.5-pro'],
      })
    );

    const routing = (gateway as unknown as GatewaySelectProviderAccessor).selectProvider(
      'gemini-1.5-pro',
      'google'
    );

    expect(routing).not.toBeNull();
    expect(routing.provider).toBe('google');
  });
});
