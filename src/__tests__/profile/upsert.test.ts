import { describe, expect, it, vi } from 'vitest';
import { buildProfileUpsertPayloads, upsertProfileWithFallback } from '@/lib/profile/upsert';

describe('profile upsert compatibility helper', () => {
  it('builds progressively richer fallback payloads', () => {
    const payloads = buildProfileUpsertPayloads(
      '123e4567-e89b-12d3-a456-426614174000',
      'Test.User+alias@example.com',
      'Test User'
    );

    expect(payloads[0]).toMatchObject({
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'Test.User+alias@example.com',
    });
    expect(payloads[payloads.length - 1]).toMatchObject({
      handle: 'test_user_alias_123e4567',
      display_name: 'Test User',
      role: 'buyer',
    });
  });

  it('succeeds after retrying richer payloads', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'missing column' } })
      .mockResolvedValueOnce({ error: null });
    const supabase = {
      from: vi.fn(() => ({ upsert })),
    };

    const result = await upsertProfileWithFallback(
      supabase,
      '123e4567-e89b-12d3-a456-426614174000',
      'user@example.com',
      'User'
    );

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
