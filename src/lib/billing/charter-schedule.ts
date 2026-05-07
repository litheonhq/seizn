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
import {
  CHARTER_WINDOW_END_AT,
  getAuthorTierFromStripePriceId,
  getBillingColumnFromStripePriceId,
  getBillingCadenceFromStripePriceId,
  getCharterStatusFromStripePriceId,
  getAuthorStripePriceId,
} from '@/lib/stripe-config';

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
