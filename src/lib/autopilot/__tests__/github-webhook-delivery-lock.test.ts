import { describe, expect, it, vi } from 'vitest';
import {
  claimWebhookDelivery,
  finalizeWebhookDelivery,
  upsertWebhookEvent,
} from '../github-webhook-delivery-lock';

type MaybeSingleResponse = { data: unknown; error: unknown };

function createSupabaseMock(options?: {
  updateResponses?: MaybeSingleResponse[];
  selectResponses?: MaybeSingleResponse[];
  upsertResponse?: { data: unknown; error: unknown };
}) {
  const updateResponses = options?.updateResponses ?? [];
  const selectResponses = options?.selectResponses ?? [];
  let updateCursor = 0;
  let selectCursor = 0;

  const table = {
    upsert: vi.fn(async () => options?.upsertResponse ?? { data: null, error: null }),
    update: vi.fn(() => {
      const response = updateResponses[updateCursor++] ?? { data: null, error: null };
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        lt: vi.fn(() => chain),
        contains: vi.fn(() => chain),
        select: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => response),
      };
      return chain;
    }),
    select: vi.fn(() => {
      const response = selectResponses[selectCursor++] ?? { data: null, error: null };
      const chain = {
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => response),
      };
      return chain;
    }),
  };

  return {
    from: vi.fn(() => table),
    table,
  };
}

describe('autopilot webhook delivery lock', () => {
  it('upserts webhook event row by delivery id', async () => {
    const supabase = createSupabaseMock();

    await upsertWebhookEvent(
      supabase,
      'delivery-1',
      'pull_request',
      'iruhana/seizn',
      {
        event: 'pull_request',
        deliveryId: 'delivery-1',
        signatureValid: true,
        receivedAt: new Date().toISOString(),
        repository: {
          owner: 'iruhana',
          name: 'seizn',
          fullName: 'iruhana/seizn',
        },
        payload: { action: 'opened' },
      }
    );

    expect(supabase.from).toHaveBeenCalledWith('autopilot_webhooks');
    expect(supabase.table.upsert).toHaveBeenCalledOnce();
  });

  it('acquires claim on first try when row is unlocked', async () => {
    const supabase = createSupabaseMock({
      updateResponses: [{ data: { id: 'delivery-1' }, error: null }],
    });

    const result = await claimWebhookDelivery(supabase, 'delivery-1');

    expect(result.acquired).toBe(true);
    if (result.acquired) {
      expect(result.processorId).toBeTypeOf('string');
      expect(result.processorId.length).toBeGreaterThan(0);
    }
  });

  it('returns deduped processed status when already finished elsewhere', async () => {
    const supabase = createSupabaseMock({
      updateResponses: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      selectResponses: [
        {
          data: {
            processed: true,
            processed_at: '2026-02-16T00:00:00.000Z',
            result: { processed: true, action: 'duplicate' },
          },
          error: null,
        },
      ],
    });

    const result = await claimWebhookDelivery(supabase, 'delivery-1');

    expect(result.acquired).toBe(false);
    if (!result.acquired) {
      expect(result.status?.processed).toBe(true);
      expect(result.status?.result).toEqual({ processed: true, action: 'duplicate' });
    }
  });

  it('returns in-progress status when another worker holds lock', async () => {
    const supabase = createSupabaseMock({
      updateResponses: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      selectResponses: [
        {
          data: {
            processed: false,
            processed_at: '2026-02-16T00:00:00.000Z',
            result: { state: 'processing', processorId: 'worker-1' },
          },
          error: null,
        },
      ],
    });

    const result = await claimWebhookDelivery(supabase, 'delivery-1');

    expect(result.acquired).toBe(false);
    if (!result.acquired) {
      expect(result.status?.processed).toBe(false);
      expect(result.status?.result).toEqual({
        state: 'processing',
        processorId: 'worker-1',
      });
    }
  });

  it('finalizes successfully when lock owner matches', async () => {
    const supabase = createSupabaseMock({
      updateResponses: [{ data: { id: 'delivery-1' }, error: null }],
    });

    await expect(
      finalizeWebhookDelivery(supabase, 'delivery-1', 'worker-1', {
        processed: true,
        action: 'processed',
      })
    ).resolves.toBeUndefined();
  });

  it('throws when finalize cannot match lock owner', async () => {
    const supabase = createSupabaseMock({
      updateResponses: [{ data: null, error: null }],
    });

    await expect(
      finalizeWebhookDelivery(supabase, 'delivery-1', 'worker-1', {
        processed: true,
        action: 'processed',
      })
    ).rejects.toThrow('Failed to finalize webhook delivery lock for delivery-1');
  });
});
