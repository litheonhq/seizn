import type { SupabaseClient } from '@supabase/supabase-js';
import type { LookupAddress } from 'node:dns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { createMultimodalService } from '@/lib/spring/memory-v4/multimodal-service';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn(),
    };
  },
}));

vi.mock('node:dns/promises', async () => {
  const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');
  const mockedLookup = vi.fn();
  return {
    ...actual,
    default: {
      ...actual,
      lookup: mockedLookup,
    },
    lookup: mockedLookup,
  };
});

function createSupabaseStub(): SupabaseClient {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
  } as unknown as SupabaseClient;
}

describe('multimodal service remote image guardrails', () => {
  const lookupMock = vi.mocked(lookup);
  const publicLookup: LookupAddress[] = [{ address: '93.184.216.34', family: 4 }];

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    lookupMock.mockReset();
    lookupMock.mockResolvedValue(publicLookup);
    vi.unstubAllGlobals();
  });

  it('blocks private IP image URLs', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.processImage('user-1', {
        imageUrl: 'https://127.0.0.1/private.png',
      })
    ).rejects.toThrow(/(hostname is not allowed|private or internal ip)/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized remote image by content-length', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const fetchMock = vi.fn(async () =>
      new Response('x', {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '6291456',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.processImage('user-1', {
        imageUrl: 'https://example.com/too-big.png',
      })
    ).rejects.toThrow(/image too large/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported base64 mime types', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');

    await expect(
      service.processImage('user-1', {
        imageBase64: payload,
        mimeType: 'text/html',
      })
    ).rejects.toThrow(/unsupported image mime type/i);
  });

  it('rejects base64 payloads that fail image signature validation', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const payload = Buffer.from('not-an-image', 'utf8').toString('base64');

    await expect(
      service.processImage('user-1', {
        imageBase64: payload,
        mimeType: 'image/png',
      })
    ).rejects.toThrow(/known image signature/i);
  });

  it('rejects empty remote image bodies', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array(0), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.processImage('user-1', {
        imageUrl: 'https://example.com/empty.png',
      })
    ).rejects.toThrow(/decoded image is empty/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects remote payloads that fail image signature validation', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([0x41, 0x42, 0x43, 0x44]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.processImage('user-1', {
        imageUrl: 'https://example.com/not-image.png',
      })
    ).rejects.toThrow(/known image signature/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks redirects to private hosts', async () => {
    const service = createMultimodalService(createSupabaseStub());
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://127.0.0.1/redirected.png',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.processImage('user-1', {
        imageUrl: 'https://example.com/redirect.png',
      })
    ).rejects.toThrow(/(hostname is not allowed|private or internal ip)/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
