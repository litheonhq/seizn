import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTenantPolicyClientCache,
  fetchTenantPolicyWithCache,
  getTenantPolicyCachedEtag,
} from './client';

describe('tenant policy client cache', () => {
  beforeEach(() => {
    clearTenantPolicyClientCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores etag from successful response and sends If-None-Match on next request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ETag: 'W/"tenant-policy-abc"' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchTenantPolicyWithCache('tenant-1');
    const second = await fetchTenantPolicyWithCache('tenant-1');

    expect(first.notModified).toBe(false);
    expect(first.etag).toBe('W/"tenant-policy-abc"');
    expect(getTenantPolicyCachedEtag('tenant-1')).toBe('W/"tenant-policy-abc"');

    expect(second.notModified).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/tenant-policy?tenant_id=tenant-1',
      expect.objectContaining({
        headers: {
          'If-None-Match': 'W/"tenant-policy-abc"',
        },
      })
    );
  });

  it('includes optional query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    vi.stubGlobal('fetch', fetchMock);

    await fetchTenantPolicyWithCache('tenant-2', {
      includeBudget: true,
      includeDegrade: true,
      includePresets: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tenant-policy?tenant_id=tenant-2&include_budget=true&include_degrade=true&include_presets=true',
      expect.any(Object)
    );
  });
});
