import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorLlmError } from '@/lib/author/llm';
import { enforceAuthorTokenBudget } from '@/lib/author/billing/token-budget';

const mocks = vi.hoisted(() => ({
  profile: {
    plan: 'indie',
    stripe_customer_id: 'cus_author_123',
  } as { plan?: string | null; stripe_customer_id?: string | null },
  meterEventsCreate: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  hasServerSupabaseServiceRoleConfig: () => true,
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mocks.profile, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    billing: {
      meterEvents: {
        create: mocks.meterEventsCreate,
      },
    },
  }),
}));

const ORIGINAL_ENV = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_METER_ID_MEMORIES: process.env.STRIPE_METER_ID_MEMORIES,
  STRIPE_METER_ID_OPS: process.env.STRIPE_METER_ID_OPS,
};

describe('Author token budget enforcement', () => {
  afterEach(() => {
    mocks.profile = { plan: 'indie', stripe_customer_id: 'cus_author_123' };
    mocks.meterEventsCreate.mockReset();
    restoreEnv('STRIPE_SECRET_KEY', ORIGINAL_ENV.STRIPE_SECRET_KEY);
    restoreEnv('STRIPE_METER_ID_MEMORIES', ORIGINAL_ENV.STRIPE_METER_ID_MEMORIES);
    restoreEnv('STRIPE_METER_ID_OPS', ORIGINAL_ENV.STRIPE_METER_ID_OPS);
  });

  it('treats BYOK users as unlimited without metering', async () => {
    await expect(enforceAuthorTokenBudget({
      userId: 'user-1',
      byokActive: true,
      requestedTokens: 10_000_000,
      usageSummary: { tokens_in: 0, tokens_out: 0, total_tokens: 999_999_999, request_count: 1, byok_active: true },
    })).resolves.toMatchObject({
      cap: null,
      overageTokens: 0,
      metered: false,
    });
    expect(mocks.meterEventsCreate).not.toHaveBeenCalled();
  });

  it('allows managed usage below the Indie cap', async () => {
    await expect(enforceAuthorTokenBudget({
      userId: 'user-1',
      byokActive: false,
      requestedTokens: 10_000,
      usageSummary: { tokens_in: 400_000, tokens_out: 100_000, total_tokens: 500_000, request_count: 20, byok_active: false },
    })).resolves.toMatchObject({
      cap: 1_000_000,
      used: 500_000,
      projected: 510_000,
      overageTokens: 0,
      metered: false,
    });
  });

  it('emits a Stripe meter event when managed usage crosses the cap', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_meter';
    process.env.STRIPE_METER_ID_MEMORIES = 'meter_author_tokens';

    await expect(enforceAuthorTokenBudget({
      userId: 'user-1',
      byokActive: false,
      requestedTokens: 20_000,
      usageSummary: { tokens_in: 990_000, tokens_out: 0, total_tokens: 990_000, request_count: 40, byok_active: false },
    })).resolves.toMatchObject({
      cap: 1_000_000,
      overageTokens: 10_000,
      metered: true,
    });

    expect(mocks.meterEventsCreate).toHaveBeenCalledWith(expect.objectContaining({
      event_name: 'meter_author_tokens',
      payload: expect.objectContaining({
        stripe_customer_id: 'cus_author_123',
        value: '10000',
        user_id: 'user-1',
      }),
    }));
  });

  it('fails closed over cap when there is no meter path', async () => {
    await expect(enforceAuthorTokenBudget({
      userId: 'user-1',
      byokActive: false,
      requestedTokens: 2,
      usageSummary: { tokens_in: 1_000_000, tokens_out: 0, total_tokens: 1_000_000, request_count: 40, byok_active: false },
    })).rejects.toMatchObject<Partial<AuthorLlmError>>({
      code: 'TOKEN_LIMIT_EXCEEDED',
      status: 402,
    });
  });

  it('allows Enterprise managed usage without a token cap', async () => {
    mocks.profile = { plan: 'enterprise', stripe_customer_id: 'cus_enterprise' };

    await expect(enforceAuthorTokenBudget({
      userId: 'user-1',
      byokActive: false,
      requestedTokens: 50_000_000,
      usageSummary: { tokens_in: 40_000_000, tokens_out: 0, total_tokens: 40_000_000, request_count: 80, byok_active: false },
    })).resolves.toMatchObject({
      cap: null,
      overageTokens: 0,
      metered: false,
    });
  });
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
