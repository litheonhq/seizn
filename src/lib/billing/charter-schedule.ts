/**
 * Charter price → regular price auto-swap via Stripe Schedule.
 *
 * Locked 2026-05-07. When a v9 Charter subscription is created, we want
 * Stripe itself to swap the line-item price ID at the first cycle on or
 * after CHARTER_WINDOW_END_AT (2027-05-01). Stripe Schedule is the right
 * primitive: it lets us define multiple "phases" with different prices,
 * each with a hard end date.
 *
 * This module exposes scheduleCharterToRegularSwap() — call it after a
 * subscription.created webhook for any Charter customer.
 */

import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';

/**
 * Release a Stripe Subscription Schedule when its parent subscription is
 * canceled. Without this, schedules outlive cancellation and pollute
 * reporting; on resubscribe Stripe rejects `from_subscription` create
 * because the customer already has an attached schedule.
 *
 * Idempotent: returns false if no schedule exists or release fails.
 */
export async function releaseChartersOnCancel(
  subscriptionId: string,
): Promise<{ released: boolean; reason?: string }> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { released: false, reason: 'stripe_not_configured' };
  }
  const stripe = getStripeClient();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return { released: false, reason: 'subscription_retrieve_failed' };
  }
  const scheduleId = typeof subscription.schedule === 'string'
    ? subscription.schedule
    : subscription.schedule?.id;
  if (!scheduleId) {
    return { released: false, reason: 'no_schedule' };
  }
  try {
    await stripe.subscriptionSchedules.release(scheduleId);
    return { released: true };
  } catch (error) {
    return {
      released: false,
      reason: error instanceof Error ? `release_failed: ${error.message}` : 'release_failed',
    };
  }
}
import {
  CHARTER_WINDOW_END_AT,
  getAuthorTierFromStripePriceId,
  getBillingColumnFromStripePriceId,
  getBillingCadenceFromStripePriceId,
  getCharterStatusFromStripePriceId,
  getAuthorStripePriceId,
} from '@/lib/stripe-config';
import {
  V9_TRACK2_CHARTER_END_AT,
  getV9Track2BillingCadenceFromPriceId,
  getV9Track2CharterStatusFromPriceId,
  getV9Track2StripePriceId,
  getV9Track2TierFromStripePriceId,
} from '@/lib/billing/v9-products';

/**
 * Convert an existing subscription paying a Charter price into a Stripe
 * Schedule that swaps to the regular price at the launch-window cutoff.
 *
 * Returns { ok: true, scheduleId } if a schedule was created, or
 * { ok: false, reason } if no swap is needed (already past cutoff,
 * already on regular price, no regular price ID configured).
 *
 * Idempotent — Stripe rejects creating a second schedule for an already
 * scheduled subscription, in which case we surface that as { ok: false,
 * reason: 'already_scheduled' }.
 */
export async function scheduleCharterToRegularSwap(
  subscriptionId: string,
): Promise<
  | { ok: true; scheduleId: string }
  | { ok: false; reason: string }
> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, reason: 'stripe_not_configured' };
  }
  const stripe = getStripeClient();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? `subscription_retrieve_failed: ${error.message}` : 'subscription_retrieve_failed',
    };
  }

  if (subscription.schedule) {
    return { ok: false, reason: 'already_scheduled' };
  }

  const charterEnd = Math.floor(new Date(CHARTER_WINDOW_END_AT).getTime() / 1000);
  if (charterEnd <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'charter_window_already_ended' };
  }

  const charterItem = subscription.items.data[0];
  const charterPriceId = charterItem?.price.id;
  if (!charterPriceId) {
    return { ok: false, reason: 'no_price_on_subscription' };
  }

  const charterStatus = getCharterStatusFromStripePriceId(charterPriceId);
  if (charterStatus !== 'charter') {
    return { ok: false, reason: 'not_charter_price' };
  }

  const tier = getAuthorTierFromStripePriceId(charterPriceId);
  const column = getBillingColumnFromStripePriceId(charterPriceId);
  const cadence = getBillingCadenceFromStripePriceId(charterPriceId);
  if (!tier || !column || !cadence) {
    return { ok: false, reason: 'price_not_recognized' };
  }

  const regularPriceId = getAuthorStripePriceId(tier, column, cadence, 'regular');
  if (!regularPriceId) {
    return { ok: false, reason: 'regular_price_not_configured' };
  }

  try {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    // Stripe creates a default schedule mirroring the current subscription.
    // Update phases: first phase ends at charterEnd, second phase swaps to regular.
    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          items: [{ price: charterPriceId, quantity: charterItem.quantity ?? 1 }],
          end_date: charterEnd,
          proration_behavior: 'none',
        },
        {
          items: [{ price: regularPriceId, quantity: charterItem.quantity ?? 1 }],
          proration_behavior: 'none',
        },
      ],
      end_behavior: 'release',
    });
    return { ok: true, scheduleId: schedule.id };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? `schedule_failed: ${error.message}` : 'schedule_failed',
    };
  }
}

/**
 * Track 2 (API + MCP) variant of the Charter→regular swap. Same mechanics
 * as the Track 1 helper above but resolves the price IDs against the
 * v9-products.ts catalog. Without this, Track 2 Charter customers would
 * pay Charter pricing forever — Track 1's helper can't recognize Track 2
 * price IDs because the catalogs are separate.
 */
export async function scheduleTrack2CharterToRegularSwap(
  subscriptionId: string,
): Promise<
  | { ok: true; scheduleId: string }
  | { ok: false; reason: string }
> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, reason: 'stripe_not_configured' };
  }
  const stripe = getStripeClient();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? `subscription_retrieve_failed: ${error.message}` : 'subscription_retrieve_failed',
    };
  }

  if (subscription.schedule) {
    return { ok: false, reason: 'already_scheduled' };
  }

  const charterEnd = Math.floor(new Date(V9_TRACK2_CHARTER_END_AT).getTime() / 1000);
  if (charterEnd <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'charter_window_already_ended' };
  }

  // Find the BASE Track 2 subscription line item (not the metered Opus
  // overage line for Studio Managed). Iterate items, pick the first one
  // that resolves to a Track 2 price.
  const baseItem = subscription.items.data.find((item) => {
    const id = item.price?.id;
    return Boolean(id && getV9Track2TierFromStripePriceId(id));
  });
  const charterPriceId = baseItem?.price.id;
  if (!charterPriceId) {
    return { ok: false, reason: 'no_track2_price_on_subscription' };
  }

  const charterStatus = getV9Track2CharterStatusFromPriceId(charterPriceId);
  if (charterStatus !== 'charter') {
    return { ok: false, reason: 'not_charter_price' };
  }

  const tier = getV9Track2TierFromStripePriceId(charterPriceId);
  const cadence = getV9Track2BillingCadenceFromPriceId(charterPriceId);
  if (!tier || !cadence) {
    return { ok: false, reason: 'price_not_recognized' };
  }

  const regularPriceId = getV9Track2StripePriceId(tier, cadence, 'regular');
  if (!regularPriceId) {
    return { ok: false, reason: 'regular_price_not_configured' };
  }

  // Schedule must mirror ALL existing items, not just the base — otherwise
  // Stripe drops metered overage lines on the swap. Keep overage items as-is
  // across both phases.
  const allItems = subscription.items.data.map((item) => ({
    priceId: item.price.id,
    quantity: item.quantity ?? 1,
  }));
  const phaseOneItems = allItems.map(({ priceId, quantity }) =>
    priceId === charterPriceId ? { price: charterPriceId, quantity } : { price: priceId, quantity },
  );
  const phaseTwoItems = allItems.map(({ priceId, quantity }) =>
    priceId === charterPriceId ? { price: regularPriceId, quantity } : { price: priceId, quantity },
  );

  try {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          items: phaseOneItems,
          end_date: charterEnd,
          proration_behavior: 'none',
        },
        {
          items: phaseTwoItems,
          proration_behavior: 'none',
        },
      ],
      end_behavior: 'release',
    });
    return { ok: true, scheduleId: schedule.id };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? `schedule_failed: ${error.message}` : 'schedule_failed',
    };
  }
}
