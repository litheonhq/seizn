import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/billing/portal/route';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'user-1' } } as { user?: { id?: string | null } } | null,
  profile: { stripe_customer_id: 'cus_author_123' } as { stripe_customer_id?: string | null } | null,
  portalCreate: vi.fn(async () => ({ url: 'https://billing.stripe.test/session' })),
}));

vi.mock('@/lib/auth', () => ({
  auth: async () => mocks.session,
}));

vi.mock('@/lib/csrf', () => ({
  verifyCsrf: () => null,
}));

vi.mock('@/lib/supabase', () => ({
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
    billingPortal: {
      sessions: {
        create: mocks.portalCreate,
      },
    },
  }),
}));

describe('legacy billing portal route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: 'user-1' } };
    mocks.profile = { stripe_customer_id: 'cus_author_123' };
  });

  it('creates a portal session for existing Stripe customers', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: 'https://billing.stripe.test/session' });
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: 'cus_author_123',
      return_url: 'https://example.com/dashboard/author/settings?section=billing',
    });
  });

  it('sends accounts without a Stripe customer to pricing', async () => {
    mocks.profile = { stripe_customer_id: null };

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      url: '/pricing',
      destination: 'pricing',
      reason: 'no_billing_account',
    });
    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });
});

function request(): NextRequest {
  return new NextRequest('https://example.com/api/billing/portal', {
    method: 'POST',
  });
}
