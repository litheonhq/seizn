import { vi } from 'vitest';

// Mock Supabase
vi.mock('@/lib/supabase', () => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const mockAuthGetUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
  const mockRequestAuthClient = {
    auth: {
      getUser: mockAuthGetUser,
    },
  };

  return {
    createServerClient: vi.fn(() => ({
      from: vi.fn(() => mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    createBrowserClient: vi.fn(() => ({
      from: vi.fn(() => mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    createServerAnonClient: vi.fn(() => mockRequestAuthClient),
    createRequestAuthClient: vi.fn(() => mockRequestAuthClient),
    getServerSupabaseUrl: vi.fn(() => 'https://example.supabase.co'),
    getServerSupabaseServiceRoleKey: vi.fn(() => 'service-role-key'),
    hasServerSupabasePublicConfig: vi.fn(() => true),
    hasServerSupabaseServiceRoleConfig: vi.fn(() => true),
    getSupabase: vi.fn(() => ({
      from: vi.fn(() => mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };
});

// Mock crypto for UUID generation
// Use explicit named exports for ESM compatibility
const mockCreateHash = vi.fn(() => ({
  update: vi.fn().mockReturnThis(),
  digest: vi.fn(() => 'testhash1234567890abcdef12345678'),
}));

const mockRandomUUID = vi.fn(() => 'test-uuid-12345678');

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    default: {
      ...actual,
      randomUUID: mockRandomUUID,
      createHash: mockCreateHash,
    },
    randomUUID: mockRandomUUID,
    createHash: mockCreateHash,
  };
});

// Global test utilities
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
