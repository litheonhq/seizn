import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthorModelUsageSummary } from '@/lib/author/llm/usage-store';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ tokens_in?: number | null; tokens_out?: number | null; byok?: boolean | null }>,
}));

vi.mock('@/lib/supabase', () => ({
  hasServerSupabaseServiceRoleConfig: () => true,
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => ({ data: mocks.rows, error: null }),
        }),
      }),
    }),
  }),
}));

describe('Author model usage summary', () => {
  afterEach(() => {
    mocks.rows = [];
  });

  it('reports historic BYOK usage separately from current BYOK state', async () => {
    mocks.rows = [
      { tokens_in: 100, tokens_out: 50, byok: true },
      { tokens_in: 30, tokens_out: 20, byok: false },
    ];

    await expect(getAuthorModelUsageSummary('user-1', undefined, false)).resolves.toMatchObject({
      tokens_in: 130,
      tokens_out: 70,
      total_tokens: 200,
      request_count: 2,
      byok_had_this_month: true,
      byok_currently_active: false,
      byok_active: false,
    });
  });

  it('sets byok_active from the current BYOK state', async () => {
    mocks.rows = [
      { tokens_in: 10, tokens_out: 5, byok: false },
    ];

    await expect(getAuthorModelUsageSummary('user-1', undefined, true)).resolves.toMatchObject({
      byok_had_this_month: false,
      byok_currently_active: true,
      byok_active: true,
    });
  });
});
