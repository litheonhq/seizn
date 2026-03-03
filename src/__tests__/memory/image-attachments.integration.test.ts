import type { SupabaseClient } from '@supabase/supabase-js';
import type { LookupAddress } from 'node:dns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { attachImageToMemory } from '@/lib/memory/image-attachments';

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

interface StoredAssetRow {
  id: string;
  user_id: string;
  storage_provider: string;
  storage_key: string;
  filename: string | null;
  mime_type: string;
  size_bytes: number | null;
  sha256_hash: string;
  extracted_metadata?: { source?: string; original_url?: string | null };
  created_at: string;
}

interface LinkRow {
  id: string;
  memory_id: string;
  asset_id: string;
  relation: 'attachment' | 'source' | 'reference' | 'derived';
  created_at: string;
}

function createSupabaseMock(): {
  supabase: SupabaseClient;
  state: { assets: StoredAssetRow[]; links: LinkRow[] };
  spies: {
    upload: ReturnType<typeof vi.fn>;
    createSignedUrl: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
} {
  const assets: StoredAssetRow[] = [];
  const links: LinkRow[] = [];
  let assetSeq = 0;
  let linkSeq = 0;

  const upload = vi.fn(async () => ({ error: null }));
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: 'https://signed.example.com/object' },
    error: null,
  }));
  const remove = vi.fn(async () => ({ error: null }));
  const createBucket = vi.fn(async () => ({ error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'spring_assets') {
      const filters: Record<string, unknown> = {};
      let insertPayload: Record<string, unknown> | null = null;

      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        in: vi.fn(() => query),
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertPayload = payload;
          return query;
        }),
        delete: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          const found =
            assets.find((asset) =>
              Object.entries(filters).every(([k, v]) => (asset as Record<string, unknown>)[k] === v)
            ) || null;
          return { data: found, error: null };
        }),
        single: vi.fn(async () => {
          if (!insertPayload) {
            return { data: null, error: { message: 'missing insert payload' } };
          }
          const now = '2026-03-03T00:00:00.000Z';
          const row: StoredAssetRow = {
            id: `asset-${++assetSeq}`,
            user_id: String(insertPayload.user_id),
            storage_provider: String(insertPayload.storage_provider),
            storage_key: String(insertPayload.storage_key),
            filename: (insertPayload.filename as string | null) ?? null,
            mime_type: String(insertPayload.mime_type),
            size_bytes: Number(insertPayload.size_bytes) || null,
            sha256_hash: String(insertPayload.sha256_hash),
            extracted_metadata: insertPayload.extracted_metadata as
              | { source?: string; original_url?: string | null }
              | undefined,
            created_at: now,
          };
          assets.push(row);
          return { data: row, error: null };
        }),
      };

      return query;
    }

    if (table === 'memory_asset_links') {
      const filters: Record<string, unknown> = {};
      let insertPayload: Record<string, unknown> | null = null;

      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return query;
        }),
        order: vi.fn(() => query),
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertPayload = payload;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          const found =
            links.find((link) =>
              Object.entries(filters).every(([k, v]) => (link as Record<string, unknown>)[k] === v)
            ) || null;
          return { data: found, error: null };
        }),
        single: vi.fn(async () => {
          if (!insertPayload) {
            return { data: null, error: { message: 'missing insert payload' } };
          }
          const now = '2026-03-03T00:00:00.000Z';
          const row: LinkRow = {
            id: `link-${++linkSeq}`,
            memory_id: String(insertPayload.memory_id),
            asset_id: String(insertPayload.asset_id),
            relation: (insertPayload.relation as LinkRow['relation']) || 'attachment',
            created_at: now,
          };
          links.push(row);
          return { data: row, error: null };
        }),
      };

      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const storage = {
    from: vi.fn(() => ({
      upload,
      createSignedUrl,
      remove,
    })),
    createBucket,
  };

  return {
    supabase: { from, storage } as unknown as SupabaseClient,
    state: { assets, links },
    spies: { upload, createSignedUrl, remove },
  };
}

describe('memory image attachment integration', () => {
  const lookupMock = vi.mocked(lookup);
  const publicLookup: LookupAddress[] = [{ address: '93.184.216.34', family: 4 }];

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue(publicLookup);
    vi.unstubAllGlobals();
  });

  it('attaches base64 image successfully', async () => {
    const { supabase, state, spies } = createSupabaseMock();
    const base64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString('base64');

    const result = await attachImageToMemory({
      supabase,
      userId: 'user-1',
      memoryId: 'memory-1',
      input: {
        image_base64: base64,
        image_mime_type: 'image/png',
      },
    });

    expect(result.relation).toBe('attachment');
    expect(result.storage_provider).toBe('r2');
    expect(result.signed_url).toBe('https://signed.example.com/object');
    expect(state.assets).toHaveLength(1);
    expect(state.links).toHaveLength(1);
    expect(spies.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects base64 payloads that fail image signature validation', async () => {
    const { supabase, spies } = createSupabaseMock();
    const base64 = Buffer.from('not-an-image', 'utf8').toString('base64');

    await expect(
      attachImageToMemory({
        supabase,
        userId: 'user-1',
        memoryId: 'memory-1',
        input: {
          image_base64: base64,
          image_mime_type: 'image/png',
        },
      })
    ).rejects.toThrow(/known image signature/i);

    expect(spies.upload).not.toHaveBeenCalled();
  });

  it('infers filename extension from remote content-type', async () => {
    const { supabase } = createSupabaseMock();
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await attachImageToMemory({
      supabase,
      userId: 'user-1',
      memoryId: 'memory-1',
      input: {
        image_url: 'https://example.com/image',
      },
    });

    expect(result.filename).toBe('memory-image.png');
    expect(result.mime_type).toBe('image/png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stores remote source URL without query string or fragment', async () => {
    const { supabase, state } = createSupabaseMock();
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await attachImageToMemory({
      supabase,
      userId: 'user-1',
      memoryId: 'memory-1',
      input: {
        image_url: 'https://example.com/image.png?token=secret#frag',
      },
    });

    expect(state.assets).toHaveLength(1);
    expect(state.assets[0]?.extracted_metadata?.original_url).toBe('https://example.com/image.png');
  });

  it('blocks private IP image URLs', async () => {
    const { supabase } = createSupabaseMock();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      attachImageToMemory({
        supabase,
        userId: 'user-1',
        memoryId: 'memory-1',
        input: { image_url: 'https://127.0.0.1/private.png' },
      })
    ).rejects.toThrow(/(hostname is not allowed|private or internal ip)/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized remote image by content-length', async () => {
    const { supabase } = createSupabaseMock();
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
      attachImageToMemory({
        supabase,
        userId: 'user-1',
        memoryId: 'memory-1',
        input: { image_url: 'https://example.com/too-big.png' },
      })
    ).rejects.toThrow(/image too large/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks redirect chain to private hosts', async () => {
    const { supabase } = createSupabaseMock();
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://127.0.0.1/secret.png',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      attachImageToMemory({
        supabase,
        userId: 'user-1',
        memoryId: 'memory-1',
        input: { image_url: 'https://example.com/redirect.png' },
      })
    ).rejects.toThrow(/(hostname is not allowed|private or internal ip)/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
