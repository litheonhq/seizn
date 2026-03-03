import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authenticateRequestMock = vi.fn();
const isAuthErrorMock = vi.fn();
const authErrorResponseMock = vi.fn();
const logRequestMock = vi.fn();
const createServerClientMock = vi.fn();
const safeJsonParseMock = vi.fn();
const createEmbeddingMock = vi.fn();
const createQueryEmbeddingMock = vi.fn();
const attachImageToMemoryMock = vi.fn();
const hasMemoryImagePayloadMock = vi.fn();
const validateMemoryImagePayloadMock = vi.fn();
const incrementMemoryVersionMock = vi.fn();
const getRequestUserMock = vi.fn();
const verifyCsrfTokenMock = vi.fn();
const ensureCsrfCookieMock = vi.fn();
const analyzeContentIntegrityMock = vi.fn();
const canUseEncryptedMemoriesMock = vi.fn();
const authMock = vi.fn();
const findDuplicateMock = vi.fn();
const createDetectorMock = vi.fn();
const compareThreatLevelMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: authenticateRequestMock,
  isAuthError: isAuthErrorMock,
  authErrorResponse: authErrorResponseMock,
  logRequest: logRequestMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('@/lib/safe-json', () => ({
  safeJsonParse: safeJsonParseMock,
}));

vi.mock('@/lib/ai', () => ({
  createEmbedding: createEmbeddingMock,
  createQueryEmbedding: createQueryEmbeddingMock,
}));

vi.mock('@/lib/memory/image-attachments', () => ({
  attachImageToMemory: attachImageToMemoryMock,
  hasMemoryImagePayload: hasMemoryImagePayloadMock,
  validateMemoryImagePayload: validateMemoryImagePayloadMock,
}));

vi.mock('@/lib/api-error', () => ({
  ValidationErrors: {
    invalidField: vi.fn((field: string, message: string) =>
      jsonResponse(400, {
        success: false,
        error: { error_code: 'INVALID_FIELD_VALUE', field, message },
      })
    ),
    missingField: vi.fn((field: string) =>
      jsonResponse(400, {
        success: false,
        error: { error_code: 'MISSING_REQUIRED_FIELD', field },
      })
    ),
    invalidBody: vi.fn((message: string) =>
      jsonResponse(400, {
        success: false,
        error: { error_code: 'INVALID_REQUEST_BODY', message },
      })
    ),
  },
  ServerErrors: {
    internal: vi.fn((code: string) =>
      jsonResponse(500, {
        success: false,
        error: { error_code: 'INTERNAL_SERVER_ERROR', code },
      })
    ),
    database: vi.fn((code: string) =>
      jsonResponse(500, {
        success: false,
        error: { error_code: 'DATABASE_ERROR', code },
      })
    ),
  },
}));

vi.mock('@/lib/memory-optimizer', () => ({
  trackMemoryAccess: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logMemoryAccess: vi.fn(),
}));

vi.mock('@/lib/memory/entitlements', () => ({
  canUseEncryptedMemories: canUseEncryptedMemoriesMock,
  getEncryptedMemoryPlanError: vi.fn(() => ({ code: 'FEATURE_NOT_AVAILABLE' })),
}));

vi.mock('@/lib/memory/query-cache', () => ({
  getCachedQueryResults: vi.fn(async () => ({ hit: false, results: [], fromCache: false })),
  setCachedQueryResults: vi.fn(),
  incrementMemoryVersion: incrementMemoryVersionMock,
}));

vi.mock('@/lib/memory/auto-router', () => ({
  routeQuery: vi.fn(() => ({ strategy: 'keyword', confidence: 1, reason: 'test' })),
}));

vi.mock('@/lib/memory/slot', () => ({
  detectSlotQuery: vi.fn(),
  getSlots: vi.fn(async () => new Map()),
}));

vi.mock('@/lib/parse-params', () => ({
  parsePagination: vi.fn(() => ({ limit: 20, offset: 0 })),
}));

vi.mock('@/lib/memory/personalization', () => ({
  applyPersonalizedRanking: vi.fn((rows: unknown[]) => rows),
  getOrCreateLearningProfile: vi.fn(async () => ({
    available: false,
    reason: 'disabled',
    profile: { personalizationEnabled: false },
  })),
}));

vi.mock('@/lib/memory/content-integrity', () => ({
  analyzeContentIntegrity: analyzeContentIntegrityMock,
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: getRequestUserMock,
}));

vi.mock('@/lib/csrf', () => ({
  verifyCsrfToken: verifyCsrfTokenMock,
  ensureCsrfCookie: ensureCsrfCookieMock,
}));

vi.mock('@/lib/memory/search-executor', () => ({
  executeMemorySearch: vi.fn(async () => ({
    results: [],
    resolvedMode: 'keyword',
    fallback: null,
    error: null,
  })),
}));

vi.mock('@/lib/memory/search-types', () => ({
  toCachedMemories: vi.fn((rows: unknown[]) => rows),
}));

vi.mock('@/lib/memory/semantic-cache-experiment', () => ({
  resolveSemanticCacheDecision: vi.fn(() => ({
    enabled: false,
    variant: null,
    scope: 'none',
    allowRead: false,
    allowWrite: false,
    reason: 'disabled',
    bucket: null,
  })),
  recordSemanticCacheExperimentEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/memory/dedup', () => ({
  findDuplicate: findDuplicateMock,
}));

vi.mock('@/lib/memory/auto-score', () => ({
  scoreImportance: vi.fn(async () => 5),
}));

vi.mock('@/lib/prompt-firewall/scanner', () => ({
  createDetector: createDetectorMock,
}));

vi.mock('@/lib/prompt-firewall/patterns', () => ({
  compareThreatLevel: compareThreatLevelMock,
}));

vi.mock('@/lib/webhook-emit', () => ({
  emitWebhookEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/fall/canary', () => ({
  getActiveAssignment: vi.fn(async () => null),
  recordRequestResult: vi.fn(),
}));

vi.mock('@/lib/memory/router-learning', () => ({
  applyRouterLearning: vi.fn(async () => ({
    strategy: 'keyword',
    learningApplied: false,
    reason: 'none',
    queryBucket: 'default',
    statsAvailable: false,
    sampleCount: 0,
    scoreDelta: 0,
    scores: {},
  })),
  recordRouterOutcome: vi.fn(),
}));

function makeRequest(path: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(path, 'https://test.seizn.com'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function createMemoriesSupabaseMock() {
  const memoryRow = {
    id: 'memory-1',
    content: 'hello',
    encrypted_content: null,
    is_encrypted: false,
    memory_type: 'fact',
    tags: [],
    namespace: 'default',
    companion_meta: null,
    importance: 5,
    created_at: '2026-03-03T00:00:00.000Z',
  };

  const insertSingleMock = vi.fn(async () => ({ data: memoryRow, error: null }));
  const insertSelectMock = vi.fn(() => ({ single: insertSingleMock }));
  const memoriesInsertMock = vi.fn(() => ({ select: insertSelectMock }));

  const updateEqUserMock = vi.fn(async () => ({ data: null, error: null }));
  const updateEqIdMock = vi.fn(() => ({ eq: updateEqUserMock }));
  const memoriesUpdateMock = vi.fn(() => ({ eq: updateEqIdMock }));

  const profilesMaybeSingleMock = vi.fn(async () => ({ data: { plan: 'pro' }, error: null }));
  const profilesEqMock = vi.fn(() => ({ maybeSingle: profilesMaybeSingleMock }));
  const profilesSelectMock = vi.fn(() => ({ eq: profilesEqMock }));

  const fromMock = vi.fn((table: string) => {
    if (table === 'memories') {
      return {
        insert: memoriesInsertMock,
        update: memoriesUpdateMock,
      };
    }

    if (table === 'profiles') {
      return {
        select: profilesSelectMock,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const supabase = {
    from: fromMock,
    rpc: vi.fn(),
  };

  return {
    supabase,
    spies: {
      memoriesUpdateMock,
      updateEqIdMock,
      updateEqUserMock,
      memoriesInsertMock,
    },
  };
}

describe('memories POST attachment rollback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    const { supabase } = createMemoriesSupabaseMock();
    createServerClientMock.mockReturnValue(supabase);

    authenticateRequestMock.mockResolvedValue({
      userId: 'user-1',
      keyId: 'key-1',
      plan: 'pro',
      rateLimitHeaders: null,
    });
    isAuthErrorMock.mockReturnValue(false);
    authErrorResponseMock.mockReturnValue(jsonResponse(401, { error: 'unauthorized' }));
    logRequestMock.mockResolvedValue(undefined);
    safeJsonParseMock.mockImplementation(async (request: NextRequest) => request.json());
    createEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    createQueryEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    hasMemoryImagePayloadMock.mockReturnValue(true);
    validateMemoryImagePayloadMock.mockReturnValue(null);
    analyzeContentIntegrityMock.mockReturnValue({ warnings: [] });
    verifyCsrfTokenMock.mockReturnValue(null);
    ensureCsrfCookieMock.mockImplementation((_request: NextRequest, response: Response) => response);
    incrementMemoryVersionMock.mockResolvedValue(undefined);
    canUseEncryptedMemoriesMock.mockReturnValue(true);
    getRequestUserMock.mockResolvedValue({ id: 'user-1' });
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findDuplicateMock.mockResolvedValue(null);
    createDetectorMock.mockReturnValue({
      scan: () => ({ detected: false, threatLevel: 'low', sanitizedInput: 'hello' }),
    });
    compareThreatLevelMock.mockReturnValue(-1);
  });

  it('v0 route returns 400 and rolls back inserted memory on attachment client error', async () => {
    const { supabase, spies } = createMemoriesSupabaseMock();
    createServerClientMock.mockReturnValue(supabase);
    attachImageToMemoryMock.mockRejectedValue(new Error('image_url must use https'));

    const { POST } = await import('@/app/api/memories/route');
    const response = await POST(
      makeRequest(
        '/api/memories',
        {
          content: 'hello',
          image_url: 'http://example.com/a.png',
        },
        { 'x-api-key': 'key-1' }
      )
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error?.error_code).toBe('INVALID_FIELD_VALUE');
    expect(spies.memoriesUpdateMock).toHaveBeenCalledTimes(1);
    expect(spies.updateEqIdMock).toHaveBeenCalledWith('id', 'memory-1');
    expect(spies.updateEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('v1 route returns 500 and rolls back inserted memory on attachment unknown error', async () => {
    const { supabase, spies } = createMemoriesSupabaseMock();
    createServerClientMock.mockReturnValue(supabase);
    attachImageToMemoryMock.mockRejectedValue(new Error('unexpected attach failure'));

    const { POST } = await import('@/app/api/v1/memories/route');
    const response = await POST(
      makeRequest('/api/v1/memories', {
        content: 'hello',
        image_url: 'https://example.com/a.png',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error?.error_code).toBe('INTERNAL_SERVER_ERROR');
    expect(spies.memoriesUpdateMock).toHaveBeenCalledTimes(1);
    expect(spies.updateEqIdMock).toHaveBeenCalledWith('id', 'memory-1');
    expect(spies.updateEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
