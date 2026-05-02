import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApiScopeMock = vi.hoisted(() => vi.fn());
const createKnowledgeGraphStoreMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const logServerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/api-scope', () => ({
  requireApiScope: requireApiScopeMock,
}));

vi.mock('@/lib/graph/graphrag', () => ({
  createKnowledgeGraphStore: createKnowledgeGraphStoreMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: logServerErrorMock,
}));

import { GET, POST } from './route';

function forbidden(scope: string) {
  return {
    response: NextResponse.json(
      { error: 'Forbidden', message: `Requires ${scope} scope` },
      { status: 403 }
    ),
  };
}

describe('/api/v1/graph scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 before creating a graph when graph:write is missing', async () => {
    requireApiScopeMock.mockResolvedValue(forbidden('graph:write'));

    const response = await POST(
      new NextRequest('https://test.seizn.com/api/v1/graph', {
        method: 'POST',
        body: JSON.stringify({ name: 'Canon Graph' }),
      })
    );

    expect(response.status).toBe(403);
    expect(requireApiScopeMock).toHaveBeenCalledWith(expect.any(NextRequest), 'graph:write');
    expect(createKnowledgeGraphStoreMock).not.toHaveBeenCalled();
  });

  it('returns 403 before listing graphs when graph:read is missing', async () => {
    requireApiScopeMock.mockResolvedValue(forbidden('graph:read'));

    const response = await GET(new NextRequest('https://test.seizn.com/api/v1/graph'));

    expect(response.status).toBe(403);
    expect(requireApiScopeMock).toHaveBeenCalledWith(expect.any(NextRequest), 'graph:read');
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});
