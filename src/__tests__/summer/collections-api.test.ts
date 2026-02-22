import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
  authErrorResponse: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

import {
  authenticateRequest,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'https://test.seizn.com'), options);
}

function mockAuth() {
  (authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: 'user-1',
    keyId: 'key-1',
    plan: 'free',
  });
  (isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false);
}

function mockDeleteResult(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eqUser = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqUser });
  const deleteFn = vi.fn().mockReturnValue({ eq: eqId });
  const from = vi.fn().mockReturnValue({ delete: deleteFn });

  (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from, deleteFn, eqId, eqUser, select, maybeSingle };
}

describe('Summer collections API - DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('returns 400 when collection_id is missing', async () => {
    const { DELETE } = await import('@/app/api/summer/collections/route');
    const response = await DELETE(makeRequest('/api/summer/collections', { method: 'DELETE' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('collection_id is required');
    expect(logRequest).toHaveBeenCalled();
  });

  it('returns 400 when collection_id is not a UUID', async () => {
    const { DELETE } = await import('@/app/api/summer/collections/route');
    const response = await DELETE(makeRequest('/api/summer/collections?collection_id=abc', { method: 'DELETE' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('must be a valid UUID');
  });

  it('returns 404 when collection is not found', async () => {
    mockDeleteResult({ data: null, error: null });

    const { DELETE } = await import('@/app/api/summer/collections/route');
    const response = await DELETE(
      makeRequest('/api/summer/collections?collection_id=123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Collection not found');
  });

  it('deletes collection when UUID is valid and owned by user', async () => {
    mockDeleteResult({
      data: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'My Collection' },
      error: null,
    });

    const { DELETE } = await import('@/app/api/summer/collections/route');
    const response = await DELETE(
      makeRequest('/api/summer/collections?collection_id=123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deleted.id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});
