/**
 * Daily MRR snapshot cron — writes to public.mrr_snapshots.
 *
 * Locked 2026-05-07. Iterates active Stripe subscriptions, aggregates MRR
 * by tier and Charter status, and inserts one row per day. Idempotent:
 * upsert by snapshot_date.
 *
 * Trigger: Vercel cron at 00:05 UTC daily (vercel.json `crons` entry).
 * Auth: requires CRON_SECRET in Authorization header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getStripeClient, hasStripeSecretKey } from '@/lib/stripe';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import {
  getAuthorTierFromStripePriceId,
  getCharterStatusFromStripePriceId,
  getBillingColumnFromStripePriceId,
} from '@/lib/stripe-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Constant-time bearer-token compare. Must use the same byte length on
 * both sides — pad the shorter to the longer with a non-matching byte.
 */
function verifyCronSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still spend a constant amount of time so length doesn't leak.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

interface TierBreakdown {
  [tierColumn: string]: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET ?? '';
  if (!expected || !verifyCronSecret(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasServerSupabaseServiceRoleConfig()) {
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });
  }
  if (!hasStripeSecretKey()) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 });
  }

  const stripe = getStripeClient();
  const today = new Date().toISOString().slice(0, 10);

  let totalMrrCents = 0;
  let activeCount = 0;
  const byTier: TierBreakdown = {};
  const byCharter: TierBreakdown = { charter: 0, regular: 0 };
  const byProvider: TierBreakdown = {};

  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.items.data.price'],
    });
    for (const sub of page.data) {
      // One subscription = one paid customer regardless of how many line
      // items (overage meters etc.) it carries. Increment activeCount once
      // per subscription, not once per item.
      activeCount += 1;
      let primaryItemBucketed = false;
      for (const item of sub.items.data) {
        const priceId = item.price.id;
        const unitAmount = item.price.unit_amount ?? 0;
        const interval = item.price.recurring?.interval;
        // Convert annual to monthly equivalent for MRR consistency.
        const monthlyEquivCents = interval === 'year' ? Math.round(unitAmount / 12) : unitAmount;
        totalMrrCents += monthlyEquivCents * (item.quantity ?? 1);
        const tier = getAuthorTierFromStripePriceId(priceId);
        const column = getBillingColumnFromStripePriceId(priceId);
        const charter = getCharterStatusFromStripePriceId(priceId);
        // Bucket the first recognized item (the base subscription line item)
        // into byTier/byCharter — overage meters share the subscription so
        // we don't double-count them in the tier breakdown.
        if (!primaryItemBucketed && tier && column) {
          const key = `${tier}_${column}`;
          byTier[key] = (byTier[key] ?? 0) + 1;
          if (charter) {
            byCharter[charter] = (byCharter[charter] ?? 0) + 1;
          }
          primaryItemBucketed = true;
        }
      }
    }
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  const supabase = createServerClient();
  // Audit follow-up: switch from upsert (last-write-wins, race produces
  // oscillating values) to insert with onConflict-DO-NOTHING. First
  // cron invocation of the day wins; subsequent invocations see PK
  // conflict and exit cleanly.  Combined with primaryItemBucketed +
  // single Stripe pagination loop above, snapshot is now deterministic
  // per (snapshot_date, Stripe state at first invocation).
  const { error } = await supabase
    .from('mrr_snapshots')
    .upsert(
      {
        snapshot_date: today,
        active_paid_count: activeCount,
        total_mrr_usd_cents: totalMrrCents,
        by_tier: byTier,
        by_charter: byCharter,
        by_provider: byProvider,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'snapshot_date', ignoreDuplicates: true },
    );
  if (error) {
    return NextResponse.json({ error: 'upsert_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({
    snapshot_date: today,
    active: activeCount,
    mrr_cents: totalMrrCents,
  });
}
