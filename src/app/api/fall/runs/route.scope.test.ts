import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApiScopeMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/api-scope', () => ({
  requireApiScope: requireApiScopeMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
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

describe('/api/fall/runs scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 before creating a run when fall:write is missing', async () => {
    requireApiScopeMock.mockResolvedValue(forbidden('fall:write'));

    const response = await POST(
      new NextRequest('https://test.seizn.com/api/fall/runs', {
        method: 'POST',
        body: JSON.stringify({
          trace_id: 'trace-1',
          initial_input: 'start',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(requireApiScopeMock).toHaveBeenCalledWith(expect.any(NextRequest), 'fall:write');
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it('returns 403 before listing runs when fall:read is missing', async () => {
    requireApiScopeMock.mockResolvedValue(forbidden('fall:read'));

    const response = await GET(new NextRequest('https://test.seizn.com/api/fall/runs'));

    expect(response.status).toBe(403);
    expect(requireApiScopeMock).toHaveBeenCalledWith(expect.any(NextRequest), 'fall:read');
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});
