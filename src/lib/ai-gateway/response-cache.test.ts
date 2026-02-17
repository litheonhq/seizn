import { describe, expect, it, beforeEach } from 'vitest';
import type { GatewayRequest, GatewayResponse } from './types';
import {
  buildGatewayResponseCacheKey,
  clearGatewayResponseCache,
  getGatewayResponseCache,
  isGatewayResponseCacheEligible,
  setGatewayResponseCache,
} from './response-cache';

function createRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    id: 'req-1',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0,
    maxTokens: 256,
    ...overrides,
  };
}

function createResponse(): GatewayResponse {
  return {
    id: 'resp-1',
    requestId: 'req-1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    content: 'hi there',
    finishReason: 'stop',
    usage: {
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
    },
    latencyMs: 100,
    cost: 0.0001,
    cached: false,
  };
}

describe('gateway response cache', () => {
  beforeEach(() => {
    clearGatewayResponseCache();
  });

  it('creates stable cache keys for equivalent requests', () => {
    const requestA = createRequest({
      id: 'req-a',
      metadata: { org_id: 'org-1', trace_id: 'aaa' },
    });
    const requestB = createRequest({
      id: 'req-b',
      metadata: { org_id: 'org-1', trace_id: 'bbb' },
    });

    expect(buildGatewayResponseCacheKey(requestA)).toBe(buildGatewayResponseCacheKey(requestB));
  });

  it('returns cached response for eligible deterministic requests', () => {
    const request = createRequest({ metadata: { org_id: 'org-1' } });
    setGatewayResponseCache(request, createResponse(), 5_000);

    const cacheHit = getGatewayResponseCache({ ...request, id: 'req-2' });

    expect(cacheHit).not.toBeNull();
    expect(cacheHit?.cached).toBe(true);
    expect(cacheHit?.requestId).toBe('req-2');
    expect(cacheHit?.metadata?.cache_hit).toBe(true);
  });

  it('is not eligible when tools are provided', () => {
    const request = createRequest({
      tools: [
        {
          type: 'function',
          function: {
            name: 'tool',
            description: 'test',
          },
        },
      ],
    });

    expect(isGatewayResponseCacheEligible(request)).toBe(false);
  });

  it('is not eligible for high-temperature requests', () => {
    const request = createRequest({ temperature: 0.7 });
    expect(isGatewayResponseCacheEligible(request)).toBe(false);
  });
});
