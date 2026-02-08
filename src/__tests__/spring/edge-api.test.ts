/**
 * Edge API Integration Tests
 *
 * Tests edge CRUD and neighborhood operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
  authErrorResponse: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

const mockGetEdge = vi.fn();
const mockUpdateEdgeWeight = vi.fn();
const mockDeleteEdge = vi.fn();

vi.mock('@/lib/spring/memory-v4', () => ({
  createEdgeService: vi.fn().mockReturnValue({
    getEdge: mockGetEdge,
    updateEdgeWeight: mockUpdateEdgeWeight,
    deleteEdge: mockDeleteEdge,
  }),
}));

import { authenticateRequest, isAuthError } from '@/lib/api-auth';

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, 'https://test.seizn.com'), options);
}

function mockAuth() {
  (authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: 'user-1',
    keyId: 'key-1',
    rateLimitHeaders: null,
  });
  (isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false);
}

describe('Edge API - Individual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('GET /api/spring/edges/[id] - should get an edge', async () => {
    const { GET } = await import('@/app/api/spring/edges/[id]/route');

    mockGetEdge.mockResolvedValue({
      id: 'edge-1',
      srcMemoryId: 'mem-a',
      dstMemoryId: 'mem-b',
      edgeType: 'supports',
      weight: 0.9,
      reason: 'semantically similar',
      createdAt: new Date('2026-01-01'),
    });

    const request = makeRequest('/api/spring/edges/edge-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'edge-1' }) });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.edge.edgeType).toBe('supports');
    expect(data.edge.weight).toBe(0.9);
  });

  it('GET /api/spring/edges/[id] - should return 404 for missing edge', async () => {
    const { GET } = await import('@/app/api/spring/edges/[id]/route');

    mockGetEdge.mockResolvedValue(null);

    const request = makeRequest('/api/spring/edges/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(response.status).toBe(404);
  });

  it('PATCH /api/spring/edges/[id] - should update edge weight', async () => {
    const { PATCH } = await import('@/app/api/spring/edges/[id]/route');

    mockGetEdge.mockResolvedValue({ id: 'edge-1' });
    mockUpdateEdgeWeight.mockResolvedValue({
      id: 'edge-1',
      srcMemoryId: 'mem-a',
      dstMemoryId: 'mem-b',
      edgeType: 'supports',
      weight: 0.5,
    });

    const request = makeRequest('/api/spring/edges/edge-1', {
      method: 'PATCH',
      body: JSON.stringify({ weight: 0.5 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'edge-1' }) });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.edge.weight).toBe(0.5);
  });

  it('DELETE /api/spring/edges/[id] - should delete edge', async () => {
    const { DELETE } = await import('@/app/api/spring/edges/[id]/route');

    mockGetEdge.mockResolvedValue({ id: 'edge-1' });
    mockDeleteEdge.mockResolvedValue(undefined);

    const request = makeRequest('/api/spring/edges/edge-1', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'edge-1' }) });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.deleted).toBe(true);
  });
});
