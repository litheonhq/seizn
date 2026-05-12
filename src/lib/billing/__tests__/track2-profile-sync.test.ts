import { describe, expect, it, vi } from 'vitest';
import {
  stripeTimestampToIso,
  syncTrack2ProfileCancellation,
  syncTrack2ProfileSubscription,
  track2TierToProfilePlan,
} from '../track2-profile-sync';

// Minimal Supabase mock that records the `.from().update().eq()` chain.
function makeSupabaseMock(updateError: { message: string } | null = null) {
  const eqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ update: updateMock }));
  return {
    supabase: { from: fromMock } as unknown as Parameters<typeof syncTrack2ProfileSubscription>[0],
    fromMock,
    updateMock,
    eqMock,
  };
}

describe('track2TierToProfilePlan', () => {
  it('collapses studio_managed onto studio', () => {
    expect(track2TierToProfilePlan('studio_managed')).toBe('studio');
  });

  it('passes through indie / pro / studio / enterprise', () => {
    expect(track2TierToProfilePlan('indie')).toBe('indie');
    expect(track2TierToProfilePlan('pro')).toBe('pro');
    expect(track2TierToProfilePlan('studio')).toBe('studio');
    expect(track2TierToProfilePlan('enterprise')).toBe('enterprise');
  });
});

describe('stripeTimestampToIso', () => {
  it('returns null for null / undefined / 0', () => {
    expect(stripeTimestampToIso(null)).toBeNull();
    expect(stripeTimestampToIso(undefined)).toBeNull();
    expect(stripeTimestampToIso(0)).toBeNull();
  });

  it('converts unix-seconds to ISO 8601', () => {
    expect(stripeTimestampToIso(1700000000)).toBe(new Date(1700000000 * 1000).toISOString());
  });
});

describe('syncTrack2ProfileSubscription', () => {
  const baseParams = {
    userId: 'user-123',
    customerId: 'cus_abc',
    baseSubscriptionUpdates: {
      stripe_subscription_id: 'sub_xyz',
      subscription_status: 'active',
    },
    tier: 'pro' as const,
    priceLockVersion: 'v9.0',
  };

  it('updates profiles.plan from tier (Bug 3 fix — profile.plan now follows subscription)', async () => {
    const { supabase, fromMock, updateMock, eqMock } = makeSupabaseMock();
    const result = await syncTrack2ProfileSubscription(supabase, baseParams);

    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(eqMock).toHaveBeenCalledWith('id', 'user-123');

    const payload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.plan).toBe('pro');
    expect(payload.stripe_customer_id).toBe('cus_abc');
    expect(payload.price_lock_version).toBe('v9.0');
    expect(payload.plan_updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('layers tier-derived fields on top of baseSubscriptionUpdates', async () => {
    const { supabase, updateMock } = makeSupabaseMock();
    await syncTrack2ProfileSubscription(supabase, baseParams);

    const payload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    // base fields preserved
    expect(payload.stripe_subscription_id).toBe('sub_xyz');
    expect(payload.subscription_status).toBe('active');
    // tier fields override / extend
    expect(payload.plan).toBe('pro');
    expect(payload.stripe_customer_id).toBe('cus_abc');
  });

  it('collapses studio_managed tier onto studio plan', async () => {
    const { supabase, updateMock } = makeSupabaseMock();
    await syncTrack2ProfileSubscription(supabase, {
      ...baseParams,
      tier: 'studio_managed',
    });
    const payload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.plan).toBe('studio');
  });

  it('returns { ok:false } when supabase update errors', async () => {
    const { supabase } = makeSupabaseMock({ message: 'rls denied' });
    const result = await syncTrack2ProfileSubscription(supabase, baseParams);
    expect(result).toEqual({ ok: false, error: 'rls denied' });
  });
});

describe('syncTrack2ProfileCancellation', () => {
  it('downgrades profile.plan to free and stamps ended_at across legacy columns', async () => {
    const { supabase, fromMock, updateMock, eqMock } = makeSupabaseMock();
    const endedAtUnix = 1700000000;
    const result = await syncTrack2ProfileCancellation(supabase, 'user-cancel', {
      ended_at: endedAtUnix,
    });

    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(eqMock).toHaveBeenCalledWith('id', 'user-cancel');

    const payload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.plan).toBe('free');
    expect(payload.stripe_subscription_id).toBeNull();
    expect(payload.stripe_subscription_status).toBe('canceled');
    expect(payload.subscription_status).toBe('cancelled');
    expect(payload.stripe_price_id).toBeNull();
    expect(payload.subscription_cancelled).toBe(true);
    expect(payload.subscription_renews_at).toBeNull();

    const expectedIso = new Date(endedAtUnix * 1000).toISOString();
    expect(payload.subscription_ended_at).toBe(expectedIso);
    expect(payload.subscription_ends_at).toBe(expectedIso);
    expect(payload.stripe_current_period_end).toBe(expectedIso);
  });

  it('falls back to now() when Stripe omits ended_at', async () => {
    const { supabase, updateMock } = makeSupabaseMock();
    const before = Date.now();
    await syncTrack2ProfileCancellation(supabase, 'user-no-ended-at', {});
    const after = Date.now();

    const payload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const stamped = new Date(String(payload.subscription_ended_at)).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('returns { ok:false } when supabase update errors', async () => {
    const { supabase } = makeSupabaseMock({ message: 'network error' });
    const result = await syncTrack2ProfileCancellation(supabase, 'user-err', {
      ended_at: 1700000000,
    });
    expect(result).toEqual({ ok: false, error: 'network error' });
  });
});
