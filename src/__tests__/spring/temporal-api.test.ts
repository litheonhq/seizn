/**
 * Temporal API Integration Tests
 *
 * Tests the 5 temporal API endpoints with mocked service layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the dependencies
vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
  authErrorResponse: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

const mockSearchValidAt = vi.fn();
const mockGetTimeline = vi.fn();
const mockGetFactHistory = vi.fn();
const mockGetChangedFacts = vi.fn();
const mockCountByTemporalStatus = vi.fn();

vi.mock('@/lib/spring/memory-v4/temporal-query', () => ({
  createTemporalQueryService: vi.fn().mockReturnValue({
    searchValidAt: mockSearchValidAt,
    getTimeline: mockGetTimeline,
    getFactHistory: mockGetFactHistory,
    getChangedFacts: mockGetChangedFacts,
    countByTemporalStatus: mockCountByTemporalStatus,
  }),
}));

import { authenticateRequest, isAuthError } from '@/lib/api-auth';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'https://test.seizn.com'));
}

function mockAuth() {
  (authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: 'user-1',
    keyId: 'key-1',
    rateLimitHeaders: null,
  });
  (isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false);
}

describe('Temporal Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('GET /api/spring/temporal/search - should search valid at a time', async () => {
    const { GET } = await import('@/app/api/spring/temporal/search/route');

    mockSearchValidAt.mockResolvedValue([
      {
        id: 'mem-1',
        content: 'Active fact',
        type: 'fact',
        similarity: null,
        validFrom: new Date('2025-01-01'),
        validTo: null,
        eventTime: null,
        createdAt: new Date('2025-01-01'),
        metadata: {},
      },
    ]);

    const request = makeRequest('/api/spring/temporal/search?valid_at=2026-01-15T00:00:00Z&top_k=10');
    const response = await GET(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].content).toBe('Active fact');
    expect(data.count).toBe(1);
  });

  it('GET /api/spring/temporal/search - should require valid_at', async () => {
    const { GET } = await import('@/app/api/spring/temporal/search/route');

    const request = makeRequest('/api/spring/temporal/search');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
  });
});

describe('Timeline API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('GET /api/spring/temporal/timeline - should return timeline entries', async () => {
    const { GET } = await import('@/app/api/spring/temporal/timeline/route');

    mockGetTimeline.mockResolvedValue([
      {
        id: 'mem-1',
        content: 'Event happened',
        type: 'experience',
        eventTime: new Date('2026-01-10'),
        validFrom: null,
        validTo: null,
        isCurrentlyValid: true,
      },
    ]);

    const request = makeRequest('/api/spring/temporal/timeline?limit=20');
    const response = await GET(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].isCurrentlyValid).toBe(true);
  });
});

describe('Fact History API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('GET /api/spring/temporal/history/[factId] - should return fact versions', async () => {
    const { GET } = await import('@/app/api/spring/temporal/history/[factId]/route');

    mockGetFactHistory.mockResolvedValue([
      {
        id: 'mem-2',
        content: 'Updated fact v2',
        type: 'fact',
        createdAt: new Date('2026-02-01'),
        metadata: {},
      },
      {
        id: 'mem-1',
        content: 'Original fact v1',
        type: 'fact',
        createdAt: new Date('2026-01-01'),
        supersededById: 'mem-2',
        metadata: {},
      },
    ]);

    const request = makeRequest('/api/spring/temporal/history/mem-2');
    const response = await GET(request, { params: Promise.resolve({ factId: 'mem-2' }) });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.history).toHaveLength(2);
    expect(data.count).toBe(2);
  });
});

describe('Changed Facts API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('GET /api/spring/temporal/changes - should return changed facts', async () => {
    const { GET } = await import('@/app/api/spring/temporal/changes/route');

    mockGetChangedFacts.mockResolvedValue([
      {
        oldFact: {
          id: 'mem-1',
          content: 'Old version',
          type: 'fact',
          createdAt: new Date('2026-01-01'),
        },
        newFact: {
          id: 'mem-2',
          content: 'New version',
          type: 'fact',
          createdAt: new Date('2026-01-15'),
        },
        changedAt: new Date('2026-01-15'),
      },
    ]);

    const request = makeRequest('/api/spring/temporal/changes?start_date=2026-01-01&end_date=2026-02-01');
    const response = await GET(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.changes).toHaveLength(1);
  });

  it('GET /api/spring/temporal/changes - should require both dates', async () => {
    const { GET } = await import('@/app/api/spring/temporal/changes/route');

    const request = makeRequest('/api/spring/temporal/changes?start_date=2026-01-01');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });
});

describe('Temporal Status API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('GET /api/spring/temporal/status - should return status counts', async () => {
    const { GET } = await import('@/app/api/spring/temporal/status/route');

    mockCountByTemporalStatus.mockResolvedValue({
      active: 100,
      expired: 5,
      superseded: 10,
      expiringSoon: 3,
    });

    const request = makeRequest('/api/spring/temporal/status');
    const response = await GET(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.active).toBe(100);
    expect(data.expired).toBe(5);
    expect(data.superseded).toBe(10);
    expect(data.expiringSoon).toBe(3);
    expect(data.total).toBe(115);
  });
});
