import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureV8Track2OpusOverageAttached,
  ensureV8Track2OpusOverageDetached,
} from '@/lib/stripe-metered';

type FetchCall = {
  url: string;
  method: string;
  body: URLSearchParams | null;
};

const ORIGINAL_ENV = { ...process.env };
const V9_OPUS_OVERAGE_ENV = 'STRIPE_PRICE_ID_V9_TRACK2_STUDIO_MANAGED_OPUS_OVERAGE';

function asURLSearchParams(body: BodyInit | null | undefined): URLSearchParams | null {
  if (!body) return null;
  if (body instanceof URLSearchParams) return body;
  return new URLSearchParams(body.toString());
}

describe('ensureV8Track2OpusOverageAttached', () => {
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_PRICE_ID_V8_STUDIO_MANAGED_OPUS_OVERAGE: 'price_overage',
    };
    delete process.env[V9_OPUS_OVERAGE_ENV];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('skips when tier is not studio_managed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureV8Track2OpusOverageAttached('sub_123', 'studio');

    expect(result).toEqual({ attached: false, reason: 'non_managed_tier' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when subscriptionId is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureV8Track2OpusOverageAttached(null, 'studio_managed');

    expect(result).toEqual({ attached: false, reason: 'missing_subscription' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when overage price env is unset', async () => {
    delete process.env.STRIPE_PRICE_ID_V8_STUDIO_MANAGED_OPUS_OVERAGE;
    delete process.env[V9_OPUS_OVERAGE_ENV];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureV8Track2OpusOverageAttached('sub_123', 'studio_managed');

    expect(result).toEqual({ attached: false, reason: 'missing_overage_price_env' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips POST when overage price is already attached (idempotent)', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method || 'GET',
        body: asURLSearchParams(init?.body as BodyInit | null | undefined),
      });
      return new Response(
        JSON.stringify({
          id: 'sub_123',
          items: { data: [{ id: 'si_1', price: { id: 'price_overage' } }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureV8Track2OpusOverageAttached('sub_123', 'studio_managed');

    expect(result).toEqual({ attached: false, reason: 'already_attached' });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
  });

  it('attaches the overage price when missing on the subscription', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method || 'GET',
        body: asURLSearchParams(init?.body as BodyInit | null | undefined),
      });
      const isGet = (init?.method || 'GET') === 'GET';
      const payload = isGet
        ? { id: 'sub_123', items: { data: [{ id: 'si_base', price: { id: 'price_smgmt_m' } }] } }
        : { id: 'sub_123' };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureV8Track2OpusOverageAttached('sub_123', 'studio_managed');

    expect(result).toEqual({ attached: true, priceId: 'price_overage' });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'GET' });
    expect(calls[0].url).toContain('/subscriptions/sub_123');
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toContain('/subscriptions/sub_123');
    expect(calls[1].body?.get('items[0][price]')).toBe('price_overage');
    expect(calls[1].body?.get('proration_behavior')).toBe('none');
    expect(calls[1].body?.get('payment_behavior')).toBe('pending_if_incomplete');
  });

  it('propagates Stripe error when GET subscription fails', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'No such subscription: sub_unknown' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      ensureV8Track2OpusOverageAttached('sub_unknown', 'studio_managed'),
    ).rejects.toThrow(/No such subscription/);
  });
});

describe('ensureV8Track2OpusOverageDetached', () => {
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_PRICE_ID_V8_STUDIO_MANAGED_OPUS_OVERAGE: 'price_overage',
    };
    delete process.env[V9_OPUS_OVERAGE_ENV];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('skips when newTier is still studio_managed (no-op)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await ensureV8Track2OpusOverageDetached('sub_123', 'studio_managed');
    expect(result).toEqual({ detached: false, reason: 'still_managed_tier' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when subscription is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await ensureV8Track2OpusOverageDetached(null, 'studio');
    expect(result).toEqual({ detached: false, reason: 'missing_subscription' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when overage price env is unset', async () => {
    delete process.env.STRIPE_PRICE_ID_V8_STUDIO_MANAGED_OPUS_OVERAGE;
    delete process.env[V9_OPUS_OVERAGE_ENV];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await ensureV8Track2OpusOverageDetached('sub_123', 'studio');
    expect(result).toEqual({ detached: false, reason: 'missing_overage_price_env' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('idempotent — returns not_attached when overage line is not on the sub', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method || 'GET',
        body: asURLSearchParams(init?.body as BodyInit | null | undefined),
      });
      return new Response(
        JSON.stringify({
          id: 'sub_123',
          items: { data: [{ id: 'si_base', price: { id: 'price_smgmt_m' } }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await ensureV8Track2OpusOverageDetached('sub_123', 'studio');
    expect(result).toEqual({ detached: false, reason: 'not_attached' });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
  });

  it('detaches the overage subscription_item via items[0][deleted]=true', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method || 'GET',
        body: asURLSearchParams(init?.body as BodyInit | null | undefined),
      });
      const isGet = (init?.method || 'GET') === 'GET';
      return new Response(
        JSON.stringify(
          isGet
            ? {
                id: 'sub_123',
                items: {
                  data: [
                    { id: 'si_base', price: { id: 'price_smgmt_m' } },
                    { id: 'si_overage', price: { id: 'price_overage' } },
                  ],
                },
              }
            : { id: 'sub_123' },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await ensureV8Track2OpusOverageDetached('sub_123', 'studio');
    expect(result).toEqual({ detached: true, subscriptionItemId: 'si_overage' });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'GET' });
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toContain('/subscriptions/sub_123');
    expect(calls[1].body?.get('items[0][id]')).toBe('si_overage');
    expect(calls[1].body?.get('items[0][deleted]')).toBe('true');
    expect(calls[1].body?.get('proration_behavior')).toBe('none');
  });
});
