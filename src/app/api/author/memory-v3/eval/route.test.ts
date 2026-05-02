import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AUTHOR_MEMORY_V3_SCHEMA_VERSION } from '@/lib/author/memory-v3';
import { hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
  isAuthError: (result: unknown) =>
    Boolean(result && typeof result === 'object' && 'authError' in result),
  authErrorResponse: (authError: { status: number; error: string }) =>
    NextResponse.json({ error: authError.error }, { status: authError.status }),
  logRequest: mocks.logRequest,
}));

const payload = {
  schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  projectId: 'knot',
  runId: 'route-run-1',
  mode: 'record',
  records: [
    {
      id: 'fact-current-student',
      kind: 'world_rule',
      status: 'canon',
      content: 'Sori is a student.',
    },
  ],
  cases: [
    {
      testCase: {
        schemaVersion: 'seizn.knot_author_eval.v1',
        id: 'case-current-role',
        kind: 'invalidated_fact_exclusion',
        prompt: 'What is Sori in current canon?',
        expected: {
          mustInclude: ['student'],
          mustExclude: ['agent'],
        },
      },
      request: {
        kind: 'llm',
        provider: 'anthropic',
        model: 'claude-opus-4.7',
        operation: 'answer-author-eval-case',
        input: {
          prompt: 'What is Sori in current canon?',
        },
      },
      liveOutput: {
        text: 'Sori is a student in the current canon.',
      },
    },
  ],
};

describe('/api/author/memory-v3/eval', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({
      userId: 'user-1',
      keyId: 'key-1',
      plan: 'pro',
      rateLimitHeaders: {
        'X-RateLimit-Remaining': '99',
      },
    });
    mocks.logRequest.mockResolvedValue(undefined);
  });

  it('runs a valid Author Memory v3 eval payload', async () => {
    const response = await POST(makeRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(body).toMatchObject({
      success: true,
      run: {
        runId: 'route-run-1',
        projectId: 'knot',
        totalCases: 1,
        passedCases: 1,
      },
      results: [
        {
          caseId: 'case-current-role',
          passed: true,
        },
      ],
    });
    expect(mocks.logRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        keyId: 'key-1',
        endpoint: '/api/author/memory-v3/eval',
        method: 'POST',
      }),
      200
    );
  });

  it('returns auth errors before parsing the payload', async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({
      authError: {
        status: 401,
        error: 'Invalid API key',
      },
    });

    const response = await POST(makeRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Invalid API key' });
    expect(mocks.logRequest).not.toHaveBeenCalled();
  });

  it('maps invalid JSON to a stable 400 response', async () => {
    const response = await POST(makeRawRequest('{not json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'AUTHOR_MEMORY_V3_INVALID_JSON',
        message: 'Invalid JSON request body',
      },
    });
    expect(mocks.logRequest).toHaveBeenCalledWith(expect.any(Object), 400);
  });

  it('fails closed when Supabase persistence is requested without config', async () => {
    vi.stubEnv('AUTHOR_MEMORY_V3_STORE', 'supabase');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.mocked(hasServerSupabaseServiceRoleConfig).mockReturnValue(false);

    const response = await POST(makeRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'AUTHOR_MEMORY_V3_EXECUTION_ERROR',
        message: 'Author Memory v3 execution failed',
      },
    });
    expect(mocks.logRequest).toHaveBeenCalledWith(expect.any(Object), 500);
  });
});

function makeRequest(body: unknown): NextRequest {
  return makeRawRequest(JSON.stringify(body));
}

function makeRawRequest(body: string): NextRequest {
  return new NextRequest('https://example.com/api/author/memory-v3/eval', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
