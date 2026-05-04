import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  readJsonBody: vi.fn(),
  resolveConflict: vi.fn(),
  withAuthorUiService: vi.fn(),
}));

vi.mock('@/lib/author/ui', () => ({
  readJsonBody: mocks.readJsonBody,
  withAuthorUiService: mocks.withAuthorUiService,
  AuthorUiValidationError: class AuthorUiValidationError extends Error {
    constructor(message: string) { super(message); this.name = 'AuthorUiValidationError'; }
  },
}));

describe('/api/projects/[projectId]/conflicts/[conflictId]/resolve', () => {
  it.each([
    ['keep_existing', { decision: 'keep_existing' }],
    ['replace_with_new', { decision: 'replace_with_new' }],
    ['defer_both', { decision: 'defer_both' }],
    ['custom', { decision: 'custom', text: '직접 수정 메모', edits: { scope: 'short_demo_30day' } }],
  ])('accepts %s decisions and writes the normalized resolution payload', async (_name, payload) => {
    mocks.readJsonBody.mockResolvedValueOnce(payload);
    mocks.resolveConflict.mockResolvedValueOnce({ resolved: true, decision_id: 'decision-1' });
    mocks.withAuthorUiService.mockImplementationOnce(async (_request, handler) => {
      const result = await handler({ resolveConflict: mocks.resolveConflict } as never, 'user-1');
      return NextResponse.json(result);
    });

    const response = await POST(makeRequest(payload), {
      params: Promise.resolve({ projectId: 'saebyeok-sample', conflictId: 'conflict-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ resolved: true, decision_id: 'decision-1' });
    expect(mocks.resolveConflict).toHaveBeenCalledWith('saebyeok-sample', 'conflict-1', payload);
  });
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('https://test.seizn.com/api/projects/saebyeok-sample/conflicts/conflict-1/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
