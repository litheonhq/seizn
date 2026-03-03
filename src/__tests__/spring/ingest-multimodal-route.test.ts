import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const processImageMock = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
  authErrorResponse: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/spring/memory-v4/multimodal-service', () => ({
  createMultimodalService: vi.fn(() => ({
    processImage: processImageMock,
  })),
}));

import { authenticateRequest, isAuthError } from '@/lib/api-auth';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('/api/spring/ingest-multimodal', 'https://test.seizn.com'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ingest-multimodal route error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processImageMock.mockReset();
    (authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-1',
      keyId: 'key-1',
      rateLimitHeaders: null,
    });
    (isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it('maps image validation errors to 400 invalid field', async () => {
    processImageMock.mockRejectedValue(new Error('imageUrl must use https'));
    const { POST } = await import('@/app/api/spring/ingest-multimodal/route');

    const response = await POST(makeRequest({ imageUrl: 'http://example.com/a.png' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error?.error_code).toBe('INVALID_FIELD_VALUE');
    expect(String(data.error?.message || '')).toContain('imageUrl must use https');
  });

  it('maps unsupported mime errors to 400 invalid field', async () => {
    processImageMock.mockRejectedValue(
      new Error('Unsupported image mime type. Allowed: image/jpeg, image/png, image/gif, image/webp')
    );
    const { POST } = await import('@/app/api/spring/ingest-multimodal/route');

    const response = await POST(
      makeRequest({
        imageBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
        mimeType: 'text/html',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error?.error_code).toBe('INVALID_FIELD_VALUE');
    expect(String(data.error?.message || '')).toContain('Unsupported image mime type');
  });

  it('returns 500 for unknown processing errors', async () => {
    processImageMock.mockRejectedValue(new Error('unexpected failure'));
    const { POST } = await import('@/app/api/spring/ingest-multimodal/route');

    const response = await POST(makeRequest({ imageUrl: 'https://example.com/a.png' }));

    expect(response.status).toBe(500);
  });
});
