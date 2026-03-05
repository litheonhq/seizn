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
const hasMemoryImagePayloadMock = vi.fn();
const validateMemoryImagePayloadMock = vi.fn();
const analyzeContentIntegrityMock = vi.fn();
const canUseEncryptedMemoriesMock = vi.fn();
const findDuplicateMock = vi.fn();
const createDetectorMock = vi.fn();
const compareThreatLevelMock = vi.fn();
const mirrorLegacyMemoryToSpringV4Mock = vi.fn();
const authMock = vi.fn();

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
  attachImageToMemory: vi.fn(),
  hasMemoryImagePayload: hasMemoryImagePayloadMock,
  validateMemoryImagePayload: validateMemoryImagePayloadMock,
}));

vi.mock('@/lib/memory/content-integrity', () => ({
  analyzeContentIntegrity: analyzeContentIntegrityMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/memory/entitlements', () => ({
  canUseEncryptedMemories: canUseEncryptedMemoriesMock,
  getEncryptedMemoryPlanError: vi.fn(() => ({ code: 'FEATURE_NOT_AVAILABLE' })),
}));

vi.mock('@/lib/memory/query-cache', () => ({
  getCachedQueryResults: vi.fn(async () => ({ hit: false, results: [], fromCache: false })),
  setCachedQueryResults: vi.fn(),
  incrementMemoryVersion: vi.fn(async () => undefined),
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

vi.mock('@/lib/memory/dedup', () => ({
  findDuplicate: findDuplicateMock,
}));

vi.mock('@/lib/memory/auto-score', () => ({
  scoreImportance: vi.fn(async () => 5),
}));

vi.mock('@/lib/memory/personalization', () => ({
  applyPersonalizedRanking: vi.fn((rows: unknown[]) => rows),
  getOrCreateLearningProfile: vi.fn(async () => ({
    available: false,
    reason: 'disabled',
    profile: { personalizationEnabled: false },
  })),
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

vi.mock('@/lib/memory/v1-spring-bridge', () => ({
  mirrorLegacyMemoryToSpringV4: mirrorLegacyMemoryToSpringV4Mock,
  searchViaSpringV4Bridge: vi.fn(async () => []),
  softDeleteSpringMirrorsByLegacyIds: vi.fn(async () => ({ deletedCount: 0, failedIds: [] })),
}));

function createMockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('/api/v1/memories', 'https://test.seizn.com'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock() {
  const memoryRow = {
    id: 'memory-1',
    content: 'bridge test',
    encrypted_content: null,
    is_encrypted: false,
    memory_type: 'fact',
    tags: [],
    namespace: 'default',
    importance: 5,
    created_at: '2026-03-05T00:00:00.000Z',
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

  return {
    supabase: { from: fromMock, rpc: vi.fn() },
    spies: {
      memoriesUpdateMock,
      updateEqIdMock,
      updateEqUserMock,
    },
  };
}

describe('v1 memories spring bridge strictness', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    delete process.env.MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED;
    delete process.env.MEMORY_V1_SPRING_BRIDGE_MIRROR;

    const { supabase } = createSupabaseMock();
    createServerClientMock.mockReturnValue(supabase);
    authenticateRequestMock.mockResolvedValue({
      userId: 'user-1',
      keyId: 'key-1',
      plan: 'pro',
      rateLimitHeaders: null,
    });
    isAuthErrorMock.mockReturnValue(false);
    authErrorResponseMock.mockReturnValue(createMockResponse(401, { error: 'unauthorized' }));
    logRequestMock.mockResolvedValue(undefined);
    safeJsonParseMock.mockImplementation(async (request: NextRequest) => request.json());
    createEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    createQueryEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    hasMemoryImagePayloadMock.mockReturnValue(false);
    validateMemoryImagePayloadMock.mockReturnValue(null);
    analyzeContentIntegrityMock.mockReturnValue({ warnings: [] });
    canUseEncryptedMemoriesMock.mockReturnValue(true);
    findDuplicateMock.mockResolvedValue(null);
    createDetectorMock.mockReturnValue({
      scan: () => ({ detected: false, threatLevel: 'low', sanitizedInput: 'bridge test' }),
    });
    compareThreatLevelMock.mockReturnValue(-1);
  });

  it('continues with success when mirror fails in non-strict mode', async () => {
    mirrorLegacyMemoryToSpringV4Mock.mockRejectedValue(new Error('mirror fail'));

    const { POST } = await import('@/app/api/v1/memories/route');
    const response = await POST(
      makeRequest({
        content: 'bridge test',
        memory_type: 'fact',
        namespace: 'default',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.bridge.springV4).toMatchObject({
      mirrored: false,
      springNoteId: null,
      skippedReason: 'mirror_failed',
    });
  });

  it('rolls back and returns 500 when mirror fails in strict mode', async () => {
    process.env.MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED = 'true';
    mirrorLegacyMemoryToSpringV4Mock.mockRejectedValue(new Error('mirror fail'));

    const { supabase, spies } = createSupabaseMock();
    createServerClientMock.mockReturnValue(supabase);

    const { POST } = await import('@/app/api/v1/memories/route');
    const response = await POST(
      makeRequest({
        content: 'bridge test',
        memory_type: 'fact',
        namespace: 'default',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(spies.memoriesUpdateMock).toHaveBeenCalledTimes(1);
    expect(spies.updateEqIdMock).toHaveBeenCalledWith('id', 'memory-1');
    expect(payload.error?.code || payload.error?.error_code).toBeTruthy();
  });
});
