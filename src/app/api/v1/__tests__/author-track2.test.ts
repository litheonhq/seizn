import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateBearerMock = vi.hoisted(() => vi.fn());
const checkScopeMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const enforceQuotaMock = vi.hoisted(() => vi.fn());
const recordUsageMock = vi.hoisted(() => vi.fn());
const getUsageMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-keys')>('@/lib/api-keys');
  return {
    ...actual,
    validateBearer: validateBearerMock,
    checkScope: checkScopeMock,
    checkRateLimit: checkRateLimitMock,
    enforceQuota: enforceQuotaMock,
    recordUsage: recordUsageMock,
    getUsage: getUsageMock,
  };
});

import {
  InvalidApiKeyError,
  QuotaExceededError,
  RateLimitExceededError,
  ScopeDeniedError,
} from '@/lib/api-keys';
import { resetAuthorUiServiceForTests } from '@/lib/author/ui/service';
import { __resetApiV1IdempotencyForTests } from '@/lib/api-v1/middleware';
import { GET as projectsGET, POST as projectsPOST } from '../projects/route';
import { GET as usageGET } from '../usage/route';
import { POST as approvePOST } from '../projects/[id]/canon/[entityId]/approve/route';
import { POST as checkPOST } from '../projects/[id]/conflicts/check/route';
import { GET as recallGET, OPTIONS as recallOPTIONS } from '../projects/[id]/recall/route';
import { GET as searchGET } from '../projects/[id]/search/route';
import { GET as timelineGET } from '../projects/[id]/timeline/route';

const baseKey = {
  apiKeyId: 'key-1',
  userId: 'user-1',
  orgId: null,
  scopes: ['*'],
  rateLimitPerMinute: 30,
  monthlyQuota: 100,
  monthlyQuotaPeriod: 'month' as const,
};

function request(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): NextRequest {
  return new NextRequest(`https://test.seizn.com/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: 'Bearer sk_seizn_test_token',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function projectParams(id = 'saebyeok-main') {
  return { params: Promise.resolve({ id }) };
}

function canonParams(id = 'saebyeok-main', entityId = 'saebyeok-entity-primary') {
  return { params: Promise.resolve({ id, entityId }) };
}

describe('Track 2 /api/v1 author facade', () => {
  const originalFlag = process.env.TRACK_2_API_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRACK_2_API_ENABLED = 'true';
    __resetApiV1IdempotencyForTests();
    resetAuthorUiServiceForTests('user-1');
    validateBearerMock.mockResolvedValue({ ...baseKey });
    checkScopeMock.mockResolvedValue(undefined);
    checkRateLimitMock.mockResolvedValue(undefined);
    enforceQuotaMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);
    getUsageMock.mockResolvedValue(7);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.TRACK_2_API_ENABLED;
    } else {
      process.env.TRACK_2_API_ENABLED = originalFlag;
    }
  });

  it('returns recall entities for a valid API key with request id and version headers', async () => {
    const response = await recallGET(request('/projects/saebyeok-main/recall'), projectParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(/^req_/);
    expect(response.headers.get('seizn-api-version')).toBe('1.0');
    expect(body.entities.length).toBeGreaterThan(0);
    expect(checkScopeMock).toHaveBeenCalledWith(['*'], 'recall', expect.objectContaining({
      apiKeyId: 'key-1',
      userId: 'user-1',
    }));
    expect(recordUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      apiKeyId: 'key-1',
      tool: 'recall',
      costUnits: 1,
    }));
    expect(JSON.stringify(body)).not.toMatch(/char\.sori|knot\.short1|청학여/);
  });

  it('returns RFC 7807 problem json for invalid or revoked keys', async () => {
    validateBearerMock.mockRejectedValueOnce(new InvalidApiKeyError('Invalid or inactive API key'));

    const response = await recallGET(request('/projects/saebyeok-main/recall'), projectParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(body).toMatchObject({
      code: 'invalid_api_key',
      status: 401,
      instance: '/api/v1/projects/saebyeok-main/recall',
    });
  });

  it('returns scope_denied before running a check when the key lacks the check scope', async () => {
    checkScopeMock.mockRejectedValueOnce(new ScopeDeniedError('check'));

    const response = await checkPOST(
      request('/projects/saebyeok-main/conflicts/check', {
        method: 'POST',
        headers: {
          'x-llm-provider': 'anthropic',
          'x-llm-key': 'sk-ant-test',
        },
        body: { text: 'canon check' },
      }),
      projectParams()
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('scope_denied');
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('returns rate limit errors with Retry-After', async () => {
    checkRateLimitMock.mockRejectedValueOnce(new RateLimitExceededError(60));

    const response = await recallGET(request('/projects/saebyeok-main/recall'), projectParams());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(body.code).toBe('rate_limited');
  });

  it('returns payment required when quota is exhausted', async () => {
    enforceQuotaMock.mockRejectedValueOnce(new QuotaExceededError('month'));

    const response = await searchGET(
      request('/projects/saebyeok-main/search?q=test'),
      projectParams()
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.code).toBe('quota_exceeded');
  });

  it('requires BYOK headers on LLM-backed conflict checks', async () => {
    const response = await checkPOST(
      request('/projects/saebyeok-main/conflicts/check', {
        method: 'POST',
        body: { text: 'canon check' },
      }),
      projectParams()
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.code).toBe('precondition_required');
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('accepts BYOK headers and records LLM usage for conflict checks', async () => {
    const response = await checkPOST(
      request('/projects/saebyeok-main/conflicts/check', {
        method: 'POST',
        headers: {
          'x-llm-provider': 'anthropic',
          'x-llm-key': 'sk-ant-test',
        },
        body: { text: 'canon check' },
      }),
      projectParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.conflicts)).toBe(true);
    expect(recordUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'check',
      costUnits: 5,
      llmProvider: 'anthropic',
      llmCostUsdMilli: 1,
    }));
  });

  it('replays idempotent POST responses without duplicate usage writes', async () => {
    const first = await approvePOST(
      request('/projects/saebyeok-main/canon/saebyeok-entity-primary/approve', {
        method: 'POST',
        headers: { 'idempotency-key': 'idem-1' },
        body: { fact: 'stable public fact' },
      }),
      canonParams()
    );
    const second = await approvePOST(
      request('/projects/saebyeok-main/canon/saebyeok-entity-primary/approve', {
        method: 'POST',
        headers: { 'idempotency-key': 'idem-1' },
        body: { fact: 'stable public fact' },
      }),
      canonParams()
    );

    expect(second.headers.get('idempotency-replayed')).toBe('true');
    expect(await second.json()).toEqual(await first.json());
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
  });

  it('paginates timeline responses with starting_after cursors', async () => {
    const first = await timelineGET(
      request('/projects/saebyeok-main/timeline?limit=2', {
        headers: {
          'x-llm-provider': 'anthropic',
          'x-llm-key': 'sk-ant-test',
        },
      }),
      projectParams()
    );
    const firstBody = await first.json();
    const cursor = firstBody.next_starting_after;
    const second = await timelineGET(
      request(`/projects/saebyeok-main/timeline?limit=2&starting_after=${cursor}`, {
        headers: {
          'x-llm-provider': 'anthropic',
          'x-llm-key': 'sk-ant-test',
        },
      }),
      projectParams()
    );
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(firstBody.data).toHaveLength(2);
    expect(firstBody.has_more).toBe(true);
    expect(secondBody.data[0].id).not.toBe(firstBody.data[0].id);
  });

  it('handles CORS preflight for public API routes', () => {
    const response = recallOPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-llm-key');
  });

  it('returns usage for the current API key without charging quota', async () => {
    const response = await usageGET(request('/usage'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      api_key_id: 'key-1',
      used: 7,
      quota: 100,
      remaining: 93,
    });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('lists public projects without exposing internal fixture identifiers', async () => {
    const response = await projectsGET(request('/projects'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].id).toBe('saebyeok-main');
    expect(JSON.stringify(body)).not.toMatch(/char\.sori|knot\.short1|청학여/);
  });

  it('round-trips a freshly created project through recall (POST → GET)', async () => {
    const created = await projectsPOST(
      request('/projects', {
        method: 'POST',
        headers: { 'idempotency-key': 'create-smoke-1' },
        body: { name: 'Smoke Roundtrip Project' },
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(typeof createdBody.id).toBe('string');

    const recall = await recallGET(
      request(`/projects/${createdBody.id}/recall?q=anything`),
      { params: Promise.resolve({ id: createdBody.id }) }
    );
    expect(recall.status).toBe(200);
    const recallBody = await recall.json();
    expect(Array.isArray(recallBody.entities)).toBe(true);
  });

  it('returns 503 problem+json when Track 2 feature flag is off', async () => {
    delete process.env.TRACK_2_API_ENABLED;
    const response = await recallGET(request('/projects/saebyeok-main/recall'), projectParams());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(body).toMatchObject({
      code: 'feature_disabled',
      status: 503,
    });
    expect(validateBearerMock).not.toHaveBeenCalled();
  });

  it('returns 404 when recalling a project that does not exist', async () => {
    const response = await recallGET(
      request('/projects/totally-missing-project/recall?q=x'),
      { params: Promise.resolve({ id: 'totally-missing-project' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(body).toMatchObject({
      code: 'not_found',
      status: 404,
      instance: '/api/v1/projects/totally-missing-project/recall',
    });
  });
});
