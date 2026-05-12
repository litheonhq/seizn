import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { createServerClient } from "@/lib/supabase";
import {
  AUTHOR_PRICE_LOCK_VERSION,
  mapStripeSubscriptionStatus,
  resolveCharterStatus,
} from "@/lib/stripe-config";
import {
  applyV8Track2TierToApiKeys,
  getV8Track2TierFromStripePriceId,
  V8_PRICE_LOCK_VERSION,
  type V8Track2Tier,
} from "@/lib/billing/v8-products";
import {
  applyV9Track2TierToApiKeys,
  getV9Track2CharterStatusFromPriceId,
  getV9Track2TierFromStripePriceId,
  V9_PRICE_LOCK_VERSION,
  type V9Track2Tier,
} from "@/lib/billing/v9-products";
import {
  ensureMeteredPriceAttached,
  ensureV8Track2OpusOverageAttached,
  ensureV8Track2OpusOverageDetached,
} from "@/lib/stripe-metered";
import { sendEmail, paymentFailedEmail } from "@/lib/email";
import { recordFunnelEvent } from "@/lib/analytics/funnel";
import {
  releaseChartersOnCancel,
  scheduleCharterToRegularSwap,
  scheduleTrack2CharterToRegularSwap,
} from "@/lib/billing/charter-schedule";
import { syncManagedEntitlements } from "@/lib/author/billing/managed-entitlements";
import {
  buildTrack2StateFromStripeSubscription,
  downgradeTrack2ProfileAndKeys,
  syncTrack2ProfileAndKeys,
} from "@/lib/billing/track2-subscription-state";
import {
  getAuthorTierFromStripePriceId,
  getBillingColumnFromStripePriceId,
  getCharterStatusFromStripePriceId,
  isAuthorBillingTier,
} from "@/lib/stripe-config";

// Stripe webhook event types we handle
type StripeEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "customer.created"
  | "customer.updated";

// Stripe webhook payload structure
interface StripeWebhookPayload {
  id: string;
  object: "event";
  api_version: string;
  created: number;
  data: {
    object: StripeEventObject;
    previous_attributes?: Record<string, unknown>;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string | null;
    idempotency_key: string | null;
  };
  type: StripeEventType;
}

// Generic Stripe event object (union of all possible objects)
interface StripeEventObject {
  id: string;
  object: string;
  // Checkout Session fields
  customer?: string;
  subscription?: string;
  mode?: "payment" | "setup" | "subscription";
  payment_status?: string;
  status?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  customer_email?: string;
  // Subscription fields
  items?: {
    data: StripeSubscriptionItem[];
  };
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  ended_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  start_date?: number | null;
  // Invoice fields
  billing_reason?: string;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  // Customer fields
  email?: string;
  name?: string;
}

interface StripeSubscriptionItem {
  id: string;
  object: "subscription_item";
  price: {
    id: string;
    product: string;
    unit_amount: number | null;
    currency: string;
    recurring: {
      interval: "day" | "week" | "month" | "year";
      interval_count: number;
    } | null;
  };
  quantity: number;
}

/**
 * Verify Stripe webhook signature
 * Uses Stripe-Signature header with t and v1 components
 */
function verifyStripeSignature(
  payload: string,
  signature: string,
  secrets: readonly string[]
): boolean {
  try {
    // Parse Stripe-Signature header: t=xxx,v1=xxx,v0=xxx (v0 is deprecated)
    const parts = signature.split(",");
    const signatureData: Record<string, string> = {};

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key && value) {
        signatureData[key.trim()] = value.trim();
      }
    }

    const timestamp = signatureData["t"];
    const expectedSignature = signatureData["v1"];

    if (!timestamp || !expectedSignature) {
      console.error("Missing timestamp or signature in Stripe-Signature header");
      return false;
    }

    // Check timestamp is within acceptable range (5 minutes)
    const timestampInt = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300; // 5 minutes

    if (Math.abs(now - timestampInt) > tolerance) {
      console.error("Stripe webhook timestamp is outside acceptable range");
      return false;
    }

    // Build signed payload: timestamp.payload
    const signedPayload = `${timestamp}.${payload}`;
    const expectedBuf = Buffer.from(expectedSignature);

    // Try every configured secret. We always test all of them to keep
    // verification time independent of which secret matches (no timing
    // oracle for "is the next secret rotated yet"). Returns true if ANY
    // secret produces a matching HMAC.
    let matched = false;
    for (const secret of secrets) {
      const hmac = crypto.createHmac("sha256", secret);
      const digest = hmac.update(signedPayload).digest("hex");
      const digestBuf = Buffer.from(digest);
      if (digestBuf.length !== expectedBuf.length) continue;
      if (crypto.timingSafeEqual(digestBuf, expectedBuf)) {
        matched = true;
        // Don't break — keep going so wall-clock is constant across secrets.
      }
    }
    return matched;
  } catch (error) {
    console.error("Error verifying Stripe signature:", error);
    return false;
  }
}

/**
 * Returns the active set of webhook signing secrets. STRIPE_WEBHOOK_SECRET
 * is the primary; STRIPE_WEBHOOK_SECRET_NEXT is set during rotation so the
 * receiver accepts both old and new signatures while operations swaps the
 * Stripe Dashboard endpoint. After rotation, drop the old secret and unset
 * NEXT.
 */
function getStripeWebhookSecrets(): string[] {
  const primary = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const next = process.env.STRIPE_WEBHOOK_SECRET_NEXT?.trim();
  return [primary, next].filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/**
 * Extract price ID from subscription items
 */
function extractPriceId(items?: { data: StripeSubscriptionItem[] }): string | null {
  if (!items || items.data.length === 0) return null;
  return items.data[0]?.price?.id || null;
}

function stripeTimestampToIso(value?: number | null): string | null {
  return value ? new Date(value * 1000).toISOString() : null;
}

function buildSubscriptionProfileUpdates(eventData: StripeEventObject): Record<string, unknown> {
  const priceId = extractPriceId(eventData.items);
  const plan = priceId ? getAuthorTierFromStripePriceId(priceId) : null;
  const periodEnd = stripeTimestampToIso(eventData.current_period_end);
  const cancelAtPeriodEnd = eventData.cancel_at_period_end === true;
  // Prefer start_date → current_period_start → fallback to now(). Late
  // webhook retries (delivered after CHARTER_WINDOW_END_AT) for pre-cutoff
  // subs need start_date, otherwise charterEligible flips false incorrectly.
  const startedAtIso =
    stripeTimestampToIso(eventData.start_date) ??
    stripeTimestampToIso(eventData.current_period_start) ??
    new Date().toISOString();
  // v9: Charter eligibility = subscription started before CHARTER_WINDOW_END_AT.
  // Single source of truth: resolveCharterStatus() — keeps this in lock-step
  // with checkout / Stripe Schedule / pricing UI.
  const charterEligible = resolveCharterStatus(startedAtIso) === 'charter';
  const updates: Record<string, unknown> = {
    stripe_subscription_id: eventData.id,
    stripe_subscription_status: eventData.status ?? null,
    subscription_status: mapStripeSubscriptionStatus(eventData.status),
    stripe_price_id: priceId,
    stripe_current_period_start: stripeTimestampToIso(eventData.current_period_start),
    stripe_current_period_end: periodEnd,
    subscription_started_at: startedAtIso,
    subscription_ended_at: null,
    subscription_ends_at: periodEnd,
    subscription_renews_at: cancelAtPeriodEnd ? null : periodEnd,
    subscription_trial_ends_at: stripeTimestampToIso(eventData.trial_end),
    subscription_cancelled: cancelAtPeriodEnd || eventData.status === "canceled",
    subscription_payment_failed: eventData.status === "past_due" || eventData.status === "unpaid",
    charter_eligible: charterEligible,
    charter_signup_at: charterEligible ? startedAtIso : null,
  };

  // Only set price_lock_version when the price ID actually resolves to a v9
  // catalog entry. Legacy v7/v8 grandfathered subs (none expected at v9
  // launch but possible later) keep their original lock_version on disk.
  if (plan) {
    updates.plan = plan;
    updates.plan_updated_at = new Date().toISOString();
    updates.price_lock_version = AUTHOR_PRICE_LOCK_VERSION;
  }

  return updates;
}

type Track2ProfilePlan = "free" | "indie" | "pro" | "studio" | "enterprise";

function track2TierToProfilePlan(tier: V8Track2Tier | V9Track2Tier): Track2ProfilePlan {
  if (tier === "studio_managed") return "studio";
  return tier;
}

function failTrack2Webhook(message: string, error?: string): never {
  throw new Error(error ? `${message}: ${error}` : message);
}

async function syncTrack2ProfileSubscription(
  supabase: ReturnType<typeof createServerClient>,
  params: {
    userId: string;
    customerId: string;
    eventData: StripeEventObject;
    tier: V8Track2Tier | V9Track2Tier;
    priceLockVersion: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({
      ...buildSubscriptionProfileUpdates(params.eventData),
      stripe_customer_id: params.customerId,
      plan: track2TierToProfilePlan(params.tier),
      plan_updated_at: new Date().toISOString(),
      price_lock_version: params.priceLockVersion,
    })
    .eq("id", params.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function syncTrack2ProfileCancellation(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  eventData: StripeEventObject,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const endedAtIso = stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      plan: "free",
      plan_updated_at: new Date().toISOString(),
      stripe_subscription_id: null,
      stripe_subscription_status: "canceled",
      subscription_status: "cancelled",
      stripe_price_id: null,
      stripe_current_period_end: endedAtIso,
      subscription_cancelled: true,
      subscription_ends_at: endedAtIso,
      subscription_ended_at: endedAtIso,
      subscription_renews_at: null,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Find user by Stripe customer ID or custom user ID
 */
async function findUser(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string | undefined,
  customUserId: string | undefined | null
): Promise<{ id: string; email?: string; full_name?: string; language?: string } | null> {
  // Try finding by Stripe customer ID first
  if (customerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, language")
      .eq("stripe_customer_id", customerId)
      .single();

    if (profile) return profile;
  }

  // Try finding by custom user ID from checkout metadata
  if (customUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, language")
      .eq("id", customUserId)
      .single();

    if (profile) return profile;
  }

  return null;
}

/**
 * Log billing event to audit_logs table
 */
async function logBillingEvent(
  supabase: ReturnType<typeof createServerClient>,
  userId: string | null,
  action: string,
  details: Record<string, unknown>,
  status: "success" | "failed" = "success",
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: `billing.${action}`,
      resource_type: "subscription",
      details,
      status,
      error_message: errorMessage,
    });
  } catch (error) {
    console.error("Failed to log billing event:", error);
  }
}

async function syncTrack2StateFromWebhook(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  eventData: StripeEventObject,
): Promise<void> {
  const state = buildTrack2StateFromStripeSubscription(
    eventData as unknown as Parameters<typeof buildTrack2StateFromStripeSubscription>[0],
  );
  if (!state) return;

  const sync = await syncTrack2ProfileAndKeys(
    supabase as unknown as Parameters<typeof syncTrack2ProfileAndKeys>[0],
    userId,
    state,
  );
  if (!sync.ok) {
    console.error("[track2] profile subscription sync failed", {
      userId,
      subscriptionId: eventData.id,
      error: sync.error,
    });
  }
}

type V8AdjustmentResult =
  | { matched: true; tier: V8Track2Tier; updated: boolean; error?: string }
  | { matched: false };

type V9AdjustmentResult =
  | { matched: true; tier: V9Track2Tier; updated: boolean; error?: string }
  | { matched: false };

async function maybeApplyV8Track2(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  priceId: string,
): Promise<V8AdjustmentResult> {
  const tier = getV8Track2TierFromStripePriceId(priceId);
  if (!tier) {
    return { matched: false };
  }
  const result = await applyV8Track2TierToApiKeys(
    userId,
    tier,
    supabase as unknown as Parameters<typeof applyV8Track2TierToApiKeys>[2],
  );
  if (!result.ok) {
    return { matched: true, tier, updated: false, error: result.error };
  }
  return { matched: true, tier, updated: true };
}

async function maybeApplyV9Track2(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  priceId: string,
): Promise<V9AdjustmentResult> {
  const tier = getV9Track2TierFromStripePriceId(priceId);
  if (!tier) {
    return { matched: false };
  }
  const result = await applyV9Track2TierToApiKeys(
    userId,
    tier,
    supabase as unknown as Parameters<typeof applyV9Track2TierToApiKeys>[2],
  );
  if (!result.ok) {
    return { matched: true, tier, updated: false, error: result.error };
  }
  return { matched: true, tier, updated: true };
}

async function attachMeteredOverageItems(subscriptionId: string, plan: string): Promise<void> {
  try {
    const result = await ensureMeteredPriceAttached(subscriptionId, plan);
    if (result.attached.length > 0) {
      console.log("Attached metered overage subscription items", {
        subscription_id: subscriptionId,
        plan,
        attached_count: result.attached.length,
      });
    }
  } catch (error) {
    console.error("Failed to attach metered overage subscription items:", error);
  }
}

async function attachV8Track2ManagedOverage(
  subscriptionId: string,
  tier: V8Track2Tier,
): Promise<void> {
  try {
    const result = await ensureV8Track2OpusOverageAttached(subscriptionId, tier);
    if (result.attached) {
      console.log("Attached v8 Track 2 Studio Managed Opus overage", {
        subscription_id: subscriptionId,
        tier,
        price_id: result.priceId,
      });
    } else if (result.reason !== 'non_managed_tier' && result.reason !== 'already_attached') {
      console.warn("v8 Track 2 Studio Managed Opus overage attach skipped", {
        subscription_id: subscriptionId,
        tier,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.error("Failed to attach v8 Track 2 Studio Managed Opus overage:", error);
  }
}

async function detachV8Track2ManagedOverageIfDowngrade(
  subscriptionId: string,
  newTier: V8Track2Tier,
): Promise<void> {
  // Only fires on subscription.updated when the user moved OFF Studio Managed.
  // No-op when the user is still on Studio Managed (the attach helper handles
  // the upgrade case separately).
  if (newTier === 'studio_managed') return;
  try {
    const result = await ensureV8Track2OpusOverageDetached(subscriptionId, newTier);
    if (result.detached) {
      console.log("Detached v8 Track 2 Studio Managed Opus overage on downgrade", {
        subscription_id: subscriptionId,
        new_tier: newTier,
        subscription_item_id: result.subscriptionItemId,
      });
    } else if (result.reason !== 'still_managed_tier' && result.reason !== 'not_attached') {
      console.warn("v8 Track 2 Studio Managed Opus overage detach skipped", {
        subscription_id: subscriptionId,
        new_tier: newTier,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.error("Failed to detach v8 Track 2 Studio Managed Opus overage:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecrets = getStripeWebhookSecrets();

    if (webhookSecrets.length === 0) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("Stripe-Signature");

    if (!signature) {
      console.error("Missing Stripe-Signature header");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    // Verify signature against all active secrets (rotation support)
    if (!verifyStripeSignature(rawBody, signature, webhookSecrets)) {
      console.error("Invalid Stripe webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: StripeWebhookPayload = JSON.parse(rawBody);
    const eventType = payload.type;
    const eventData = payload.data.object;

    console.log(`Received Stripe webhook: ${eventType}`, {
      event_id: payload.id,
      customer: eventData.customer,
      livemode: payload.livemode,
    });

    const supabase = createServerClient();

    // v9 idempotency dedupe (audit follow-up). Stripe retries on 5xx /
    // >20s timeout re-deliver the same event ID. Without this, retries
    // doubled funnel_events rows + audit_log rows + Stripe Schedule
    // creation attempts.
    //
    // Round 5 refinement: round-2's "in_flight" return-200 path was a
    // foot-gun. If the original worker crashed (OOM / SIGKILL / late-
    // arrival 503) before reaching the markEventProcessed UPDATE at the
    // bottom, processed_at stays NULL and Stripe stops retrying because
    // round-2 returned 200. Effect: events permanently dropped.
    //
    // New rule on duplicate-key:
    //   - processed_at IS NOT NULL  → finished, return 200 (true dedupe).
    //   - processed_at IS NULL AND created_at < NOW() - 30s
    //                                → presumed crashed, allow reprocess.
    //   - processed_at IS NULL AND created_at within 30s
    //                                → genuine concurrent in-flight; return
    //                                  200 in_flight so the other worker
    //                                  can finish without contention.
    // 30s is comfortably above the typical webhook latency (~2-5s) and
    // below Stripe's first retry interval (~5min).
    const STALE_INFLIGHT_THRESHOLD_MS = 30_000;
    const { error: dedupeInsertError } = await supabase
      .from('stripe_webhook_events')
      .insert({
        id: payload.id,
        type: eventType,
        livemode: Boolean(payload.livemode),
      });
    if (dedupeInsertError) {
      const message = dedupeInsertError.message || '';
      const isDuplicate =
        message.includes('duplicate key') ||
        message.includes('stripe_webhook_events_pkey');
      if (isDuplicate) {
        const { data: existing } = await supabase
          .from('stripe_webhook_events')
          .select('processed_at, created_at')
          .eq('id', payload.id)
          .maybeSingle();
        if (existing?.processed_at) {
          console.log(`Skipping completed Stripe webhook ${payload.id}`);
          return NextResponse.json({ received: true, deduped: true });
        }
        const createdAtMs = existing?.created_at
          ? new Date(existing.created_at).getTime()
          : 0;
        const ageMs = Date.now() - createdAtMs;
        if (ageMs < STALE_INFLIGHT_THRESHOLD_MS) {
          console.log(
            `Skipping in-flight Stripe webhook ${payload.id} (age ${ageMs}ms)`,
          );
          return NextResponse.json({ received: true, in_flight: true });
        }
        // Stale — the previous attempt likely crashed before marking
        // processed_at. Fall through to reprocess. Side effects below
        // (Stripe Schedule.create, funnel_events writes) must remain
        // idempotent on retry; that's a pre-existing requirement for
        // Stripe's own retries.
        console.warn(
          `Reprocessing stale Stripe webhook ${payload.id} (age ${ageMs}ms, processed_at NULL)`,
        );
      } else {
        console.warn(`stripe_webhook_events insert failed (continuing): ${message}`);
      }
    }

    // Handle different event types
    switch (eventType) {
      case "checkout.session.completed": {
        // Checkout completed - new subscription or one-time payment
        const customerId = eventData.customer;
        const subscriptionId = eventData.subscription;
        const customUserId = eventData.client_reference_id || eventData.metadata?.user_id;

        if (eventData.mode !== "subscription") {
          console.log("Checkout is not for subscription, skipping plan update");
          await logBillingEvent(supabase, customUserId || null, "checkout_completed", {
            mode: eventData.mode,
            customer_id: customerId,
            payment_status: eventData.payment_status,
          });
          break;
        }

        if (!subscriptionId || !customerId) {
          console.error("Missing subscription or customer ID in checkout session");
          break;
        }

        // Find or create user association
        let user = await findUser(supabase, customerId as string, customUserId);

        if (!user && customUserId) {
          user = { id: customUserId };
        }

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_subscription_status: eventData.status ?? null,
              price_lock_version: eventData.metadata?.price_lock_version ?? AUTHOR_PRICE_LOCK_VERSION,
              plan_updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          if (error) {
            console.error("Failed to update user with checkout info:", error);
            await logBillingEvent(supabase, user.id, "checkout_completed", {
              customer_id: customerId,
              subscription_id: subscriptionId,
            }, "failed", error.message);
          } else {
            console.log(`Checkout completed for user ${user.id}`);
            await logBillingEvent(supabase, user.id, "checkout_completed", {
              customer_id: customerId,
              subscription_id: subscriptionId,
              payment_status: eventData.payment_status,
            });
          }
        } else {
          console.error("Could not find user for checkout session", {
            customerId,
            customUserId,
          });
        }
        break;
      }

      case "customer.subscription.created": {
        const customerId = eventData.customer as string;
        const subscriptionId = eventData.id;
        const priceId = extractPriceId(eventData.items);
        const customUserId = eventData.metadata?.user_id;

        if (!priceId) {
          console.error("No price ID in subscription");
          break;
        }

        // Find or create user association
        let user = await findUser(supabase, customerId, customUserId);

        if (!user && customUserId) {
          user = { id: customUserId };
        }

        if (!user) {
          console.error("Could not find user for subscription", {
            customerId,
            customUserId,
          });
          break;
        }

        // v9 Track 2 lookup runs BEFORE v8 fallback. v9 is the active catalog
        // for new subscriptions; v8 only matches grandfathered/test prices.
        const v9 = await maybeApplyV9Track2(supabase, user.id, priceId);
        if (v9.matched) {
          if (!v9.updated) {
            console.error("Failed to apply v9 Track 2 tier on api_keys:", v9.error);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              channel: "track2",
              catalog: "v9",
              tier: v9.tier,
              price_id: priceId,
            }, "failed", v9.error);
            failTrack2Webhook("Failed to apply v9 Track 2 tier on api_keys", v9.error);
          } else {
            console.log(`v9 Track 2 subscription created for user ${user.id}: ${v9.tier}`);
            const profileSync = await syncTrack2ProfileSubscription(supabase, {
              userId: user.id,
              customerId,
              eventData,
              tier: v9.tier,
              priceLockVersion: V9_PRICE_LOCK_VERSION,
            });
            if (!profileSync.ok) {
              console.error("Failed to sync v9 Track 2 profile plan:", profileSync.error);
              await logBillingEvent(supabase, user.id, "subscription_created_profile_sync", {
                subscription_id: subscriptionId,
                channel: "track2",
                catalog: "v9",
                tier: v9.tier,
                price_id: priceId,
              }, "failed", profileSync.error);
              failTrack2Webhook("Failed to sync v9 Track 2 profile plan", profileSync.error);
            }
            await attachV8Track2ManagedOverage(subscriptionId, v9.tier);
            await syncTrack2StateFromWebhook(supabase, user.id, eventData);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              channel: "track2",
              catalog: "v9",
              tier: v9.tier,
              price_id: priceId,
              current_period_end: eventData.current_period_end,
            });
            void recordFunnelEvent({
              userId: user.id,
              eventType: 'subscription_created',
              metadata: {
                subscription_id: subscriptionId,
                tier: v9.tier,
                price_id: priceId,
                channel: 'track2',
              },
            });
            // v9 Track 2 Charter → regular auto-swap. Track 1 helper above
            // can't recognize Track 2 price IDs, so without this Track 2
            // Charter customers would pay Charter price forever after the
            // 2027-05-01 cutoff (revenue leak).
            try {
              const swap = await scheduleTrack2CharterToRegularSwap(subscriptionId);
              if (!swap.ok) {
                console.log(`[charter track2] swap not scheduled for ${subscriptionId}: ${swap.reason}`);
              } else {
                console.log(`[charter track2] swap scheduled ${swap.scheduleId} for ${subscriptionId}`);
              }
            } catch (swapError) {
              console.error(`[charter track2] swap unexpected error for ${subscriptionId}`, swapError);
            }
            // v9 audit follow-up: Studio Managed and Enterprise Track 2
            // tiers grant Managed perks (xhigh, seats, founding badge,
            // 48h support, Continuity Report). Map to the Track 1
            // entitlements row so author/billing reads them. Other Track 2
            // tiers (BYOK Indie/Pro/Studio) get no Managed perks — skip.
            if (v9.tier === 'studio_managed' || v9.tier === 'enterprise') {
              const charterStatusForEnt = getV9Track2CharterStatusFromPriceId(priceId);
              const mappedTier = v9.tier === 'studio_managed' ? 'studio' : 'enterprise';
              try {
                await syncManagedEntitlements({
                  userId: user.id,
                  tier: mappedTier,
                  column: 'managed',
                  charterEligible: charterStatusForEnt === 'charter',
                });
              } catch (entError) {
                console.error(`[entitlements track2] sync failed for ${user.id}`, entError);
              }
            }
          }
          break;
        }

        const v8 = await maybeApplyV8Track2(supabase, user.id, priceId);
        if (v8.matched) {
          if (!v8.updated) {
            console.error("Failed to apply v8 Track 2 tier on api_keys:", v8.error);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              channel: "track2",
              catalog: "v8",
              tier: v8.tier,
              price_id: priceId,
            }, "failed", v8.error);
            failTrack2Webhook("Failed to apply v8 Track 2 tier on api_keys", v8.error);
          } else {
            console.log(`v8 Track 2 subscription created for user ${user.id}: ${v8.tier}`);
            const profileSync = await syncTrack2ProfileSubscription(supabase, {
              userId: user.id,
              customerId,
              eventData,
              tier: v8.tier,
              priceLockVersion: V8_PRICE_LOCK_VERSION,
            });
            if (!profileSync.ok) {
              console.error("Failed to sync v8 Track 2 profile plan:", profileSync.error);
              await logBillingEvent(supabase, user.id, "subscription_created_profile_sync", {
                subscription_id: subscriptionId,
                channel: "track2",
                catalog: "v8",
                tier: v8.tier,
                price_id: priceId,
              }, "failed", profileSync.error);
              failTrack2Webhook("Failed to sync v8 Track 2 profile plan", profileSync.error);
            }
            await attachV8Track2ManagedOverage(subscriptionId, v8.tier);
            await syncTrack2StateFromWebhook(supabase, user.id, eventData);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              channel: "track2",
              catalog: "v8",
              tier: v8.tier,
              price_id: priceId,
              current_period_end: eventData.current_period_end,
            });
          }
          break;
        }

        const plan = getAuthorTierFromStripePriceId(priceId);
        if (!plan) {
          console.error(`Unknown price ID: ${priceId}`);
          break;
        }

        const { error } = await supabase
          .from("profiles")
          .update({
            ...buildSubscriptionProfileUpdates(eventData),
            stripe_customer_id: customerId,
          })
          .eq("id", user.id);

        if (error) {
          console.error("Failed to update user plan:", error);
          await logBillingEvent(supabase, user.id, "subscription_created", {
            subscription_id: subscriptionId,
            plan,
            price_id: priceId,
          }, "failed", error.message);
        } else {
          console.log(`Subscription created for user ${user.id}: ${plan} plan`);
          await attachMeteredOverageItems(subscriptionId, plan);
          await logBillingEvent(supabase, user.id, "subscription_created", {
            subscription_id: subscriptionId,
            plan,
            price_id: priceId,
            current_period_end: eventData.current_period_end,
          });
          // v9 funnel: record paid conversion for cohort/CAC analytics.
          void recordFunnelEvent({
            userId: user.id,
            eventType: 'subscription_created',
            metadata: {
              subscription_id: subscriptionId,
              plan,
              price_id: priceId,
              channel: 'track1',
            },
          });
          // v9 Charter: schedule the price swap to regular at 2027-05-01.
          // Idempotent on Stripe side (skips if already scheduled). We await
          // because if Stripe rate-limits this, a fire-and-forget loses the
          // schedule entirely with no retry — Charter customers would then
          // pay Charter price forever (revenue leak).
          try {
            const swap = await scheduleCharterToRegularSwap(subscriptionId);
            if (!swap.ok) {
              console.log(`[charter] swap not scheduled for ${subscriptionId}: ${swap.reason}`);
            } else {
              console.log(`[charter] swap scheduled ${swap.scheduleId} for ${subscriptionId}`);
            }
          } catch (swapError) {
            console.error(`[charter] swap unexpected error for ${subscriptionId}`, swapError);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              charter_swap: "failed",
            }, "failed", swapError instanceof Error ? swapError.message : 'unknown');
          }
          // v9 Managed: sync entitlements (priority queue, seats, xhigh, etc.).
          // Awaited because feature gates (xhighEffortIncluded, seats) read
          // managed_entitlements directly. A missing row silently demotes a
          // paid Pro+ user to medium-effort LLM responses.
          const tierForEnt = getAuthorTierFromStripePriceId(priceId);
          const columnForEnt = getBillingColumnFromStripePriceId(priceId);
          const charterForEnt = getCharterStatusFromStripePriceId(priceId);
          if (tierForEnt && columnForEnt && isAuthorBillingTier(tierForEnt)) {
            try {
              await syncManagedEntitlements({
                userId: user.id,
                tier: tierForEnt,
                column: columnForEnt,
                charterEligible: charterForEnt === 'charter',
              });
            } catch (entError) {
              console.error(`[entitlements] sync failed for ${user.id}`, entError);
              await logBillingEvent(supabase, user.id, "subscription_created", {
                subscription_id: subscriptionId,
                entitlements_sync: "failed",
              }, "failed", entError instanceof Error ? entError.message : 'unknown');
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const customerId = eventData.customer as string;
        const subscriptionId = eventData.id;
        const priceId = extractPriceId(eventData.items);

        if (!customerId) {
          console.error("Missing customer ID in subscription update");
          break;
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.metadata?.user_id
        );

        if (!user) {
          // Late-arrival ordering: customer.subscription.updated can land
          // before customer.subscription.created (Stripe doesn't guarantee
          // event order across topics). Return 503 so Stripe retries with
          // backoff. The dedupe table tracks processed_at — since we
          // never reach the markEventProcessed call below on this path,
          // the retry will be allowed through.
          console.warn(`User not found for customer ${customerId} on subscription.updated — returning 503 for Stripe retry`);
          return NextResponse.json(
            { error: "user_not_found_retry" },
            { status: 503 }
          );
        }

        if (priceId) {
          // v9 first — handles in-portal Pro→Studio Managed upgrades and
          // downgrades. Pre-fix, v9 subs silently skipped api_keys sync on
          // upgrade because only v8 was checked here.
          const v9Update = await maybeApplyV9Track2(supabase, user.id, priceId);
          if (v9Update.matched) {
            if (!v9Update.updated) {
              console.error("Failed to apply v9 Track 2 tier on api_keys:", v9Update.error);
              await logBillingEvent(supabase, user.id, "subscription_updated", {
                subscription_id: subscriptionId,
                channel: "track2",
                catalog: "v9",
                tier: v9Update.tier,
                price_id: priceId,
              }, "failed", v9Update.error);
              failTrack2Webhook("Failed to apply v9 Track 2 tier on api_keys", v9Update.error);
            } else {
              console.log(`v9 Track 2 subscription updated for user ${user.id}: ${v9Update.tier}`);
              const profileSync = await syncTrack2ProfileSubscription(supabase, {
                userId: user.id,
                customerId,
                eventData,
                tier: v9Update.tier,
                priceLockVersion: V9_PRICE_LOCK_VERSION,
              });
              if (!profileSync.ok) {
                console.error("Failed to sync v9 Track 2 profile plan:", profileSync.error);
                await logBillingEvent(supabase, user.id, "subscription_updated_profile_sync", {
                  subscription_id: subscriptionId,
                  channel: "track2",
                  catalog: "v9",
                  tier: v9Update.tier,
                  price_id: priceId,
                }, "failed", profileSync.error);
                failTrack2Webhook("Failed to sync v9 Track 2 profile plan", profileSync.error);
              }
              await attachV8Track2ManagedOverage(subscriptionId, v9Update.tier);
              await detachV8Track2ManagedOverageIfDowngrade(subscriptionId, v9Update.tier);
              await syncTrack2StateFromWebhook(supabase, user.id, eventData);
              await logBillingEvent(supabase, user.id, "subscription_updated", {
                subscription_id: subscriptionId,
                channel: "track2",
                catalog: "v9",
                tier: v9Update.tier,
                price_id: priceId,
                cancel_at_period_end: eventData.cancel_at_period_end,
                status: eventData.status,
              });
            }
            break;
          }

          const v8 = await maybeApplyV8Track2(supabase, user.id, priceId);
          if (v8.matched) {
            if (!v8.updated) {
              console.error("Failed to apply v8 Track 2 tier on api_keys:", v8.error);
              await logBillingEvent(supabase, user.id, "subscription_updated", {
                subscription_id: subscriptionId,
                channel: "track2",
                catalog: "v8",
                tier: v8.tier,
                price_id: priceId,
              }, "failed", v8.error);
              failTrack2Webhook("Failed to apply v8 Track 2 tier on api_keys", v8.error);
            } else {
              console.log(`v8 Track 2 subscription updated for user ${user.id}: ${v8.tier}`);
              const profileSync = await syncTrack2ProfileSubscription(supabase, {
                userId: user.id,
                customerId,
                eventData,
                tier: v8.tier,
                priceLockVersion: V8_PRICE_LOCK_VERSION,
              });
              if (!profileSync.ok) {
                console.error("Failed to sync v8 Track 2 profile plan:", profileSync.error);
                await logBillingEvent(supabase, user.id, "subscription_updated_profile_sync", {
                  subscription_id: subscriptionId,
                  channel: "track2",
                  catalog: "v8",
                  tier: v8.tier,
                  price_id: priceId,
                }, "failed", profileSync.error);
                failTrack2Webhook("Failed to sync v8 Track 2 profile plan", profileSync.error);
              }
              // Symmetric upgrade/downgrade handling for the Studio Managed
              // Opus overage line: attach if user is now on Studio Managed,
              // detach if they moved off it. Both calls are idempotent.
              await attachV8Track2ManagedOverage(subscriptionId, v8.tier);
              await detachV8Track2ManagedOverageIfDowngrade(subscriptionId, v8.tier);
              await syncTrack2StateFromWebhook(supabase, user.id, eventData);
              await logBillingEvent(supabase, user.id, "subscription_updated", {
                subscription_id: subscriptionId,
                channel: "track2",
                catalog: "v8",
                tier: v8.tier,
                price_id: priceId,
                cancel_at_period_end: eventData.cancel_at_period_end,
                status: eventData.status,
              });
            }
            break;
          }
        }

        const updates = buildSubscriptionProfileUpdates(eventData);

        const { error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", user.id);

        if (error) {
          console.error("Failed to update subscription:", error);
          await logBillingEvent(supabase, user.id, "subscription_updated", {
            subscription_id: eventData.id,
            updates,
          }, "failed", error.message);
        } else {
          console.log(`Subscription updated for user ${user.id}`);
          if (typeof updates.plan === "string") {
            await attachMeteredOverageItems(subscriptionId, updates.plan);
          }
          await logBillingEvent(supabase, user.id, "subscription_updated", {
            subscription_id: eventData.id,
            cancel_at_period_end: eventData.cancel_at_period_end,
            status: eventData.status,
            price_id: priceId,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const customerId = eventData.customer as string;
        const subscriptionId = eventData.id;
        const priceId = extractPriceId(eventData.items);

        if (!customerId) {
          console.error("Missing customer ID in subscription deletion");
          break;
        }

        // v9 audit follow-up: release any attached Charter Schedule so it
        // doesn't outlive the subscription (orphan schedules pollute
        // reporting and break re-subscribe via from_subscription).
        // Idempotent — releaseChartersOnCancel returns early when no
        // schedule is attached. Errors logged but not blocking.
        try {
          const release = await releaseChartersOnCancel(subscriptionId);
          if (release.released) {
            console.log(`[charter] schedule released for ${subscriptionId}`);
          } else if (release.reason && release.reason !== 'no_schedule') {
            console.log(`[charter] schedule release skipped for ${subscriptionId}: ${release.reason}`);
          }
        } catch (releaseError) {
          console.error(`[charter] release unexpected error for ${subscriptionId}`, releaseError);
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.metadata?.user_id
        );

        if (!user) {
          // Late-arrival ordering or pre-link manual cancellation.
          // We've already released any Charter Schedule above (idempotent
          // and side-effect-safe), so it's OK to bail here. Return 503 so
          // Stripe retries; by the next attempt customer.subscription.created
          // should have linked the profile.
          console.warn(`User not found for customer ${customerId} on subscription.deleted — returning 503 for Stripe retry`);
          return NextResponse.json(
            { error: "user_not_found_retry" },
            { status: 503 }
          );
        }

        if (priceId) {
          // v9 first: downgrade Track 2 v9 subscriptions to free.
          const v9Tier = getV9Track2TierFromStripePriceId(priceId);
            if (v9Tier) {
            const downgrade = await downgradeTrack2ProfileAndKeys(
              supabase as unknown as Parameters<typeof downgradeTrack2ProfileAndKeys>[0],
              user.id,
              {
                subscriptionId,
                priceId,
                endedAt: stripeTimestampToIso(eventData.ended_at),
                catalog: "v9",
              },
            );
            const profileSync = await syncTrack2ProfileCancellation(supabase, user.id, eventData);
            if (!profileSync.ok) {
              console.error("Failed to sync v9 Track 2 profile cancellation:", profileSync.error);
            }
            await logBillingEvent(supabase, user.id, "subscription_deleted", {
              subscription_id: subscriptionId,
              channel: "track2",
              catalog: "v9",
              previous_tier: v9Tier,
              downgraded_to: "free",
              ended_at: eventData.ended_at,
              profile_synced: profileSync.ok,
            },
            downgrade.ok && profileSync.ok ? "success" : "failed",
            !downgrade.ok ? downgrade.error : profileSync.ok ? undefined : profileSync.error);
            if (!downgrade.ok) {
              failTrack2Webhook("Failed to downgrade v9 Track 2 api_keys", downgrade.error);
            }
            if (!profileSync.ok) {
              failTrack2Webhook("Failed to sync v9 Track 2 profile cancellation", profileSync.error);
            }
            // v9 funnel: Track 2 cancellation. Pre-fix this branch broke
            // out before the Track 1 funnel hook below, silently dropping
            // Track 2 cancel events from cohort/retention analytics.
            void recordFunnelEvent({
              userId: user.id,
              eventType: 'subscription_canceled',
              metadata: {
                subscription_id: subscriptionId,
                channel: 'track2',
                catalog: 'v9',
                previous_tier: v9Tier,
                ended_at: eventData.ended_at,
                canceled_at: eventData.canceled_at,
              },
            });
            // v9 audit follow-up: Track 2 Studio Managed / Enterprise had
            // a managed_entitlements row written on subscription.created.
            // Pre-fix the deleted branch broke out before the Track 1
            // entitlements downgrade below, leaving the row alive — user
            // retained xhigh/seats/badge after cancellation (free perks).
            if (v9Tier === 'studio_managed' || v9Tier === 'enterprise') {
              try {
                await syncManagedEntitlements({
                  userId: user.id,
                  tier: 'indie', // unused on downgrade path
                  column: 'managed',
                  charterEligible: false,
                  downgrade: true,
                });
              } catch (entError) {
                console.error(`[entitlements track2] downgrade failed for ${user.id}`, entError);
              }
            }
            break;
          }
          const v8Tier = getV8Track2TierFromStripePriceId(priceId);
          if (v8Tier) {
            const downgrade = await downgradeTrack2ProfileAndKeys(
              supabase as unknown as Parameters<typeof downgradeTrack2ProfileAndKeys>[0],
              user.id,
              {
                subscriptionId,
                priceId,
                endedAt: stripeTimestampToIso(eventData.ended_at),
                catalog: "v8",
              },
            );
            const profileSync = await syncTrack2ProfileCancellation(supabase, user.id, eventData);
            if (!profileSync.ok) {
              console.error("Failed to sync v8 Track 2 profile cancellation:", profileSync.error);
            }
            await logBillingEvent(supabase, user.id, "subscription_deleted", {
              subscription_id: subscriptionId,
              channel: "track2",
              catalog: "v8",
              previous_tier: v8Tier,
              downgraded_to: "free",
              ended_at: eventData.ended_at,
              profile_synced: profileSync.ok,
            },
            downgrade.ok && profileSync.ok ? "success" : "failed",
            !downgrade.ok ? downgrade.error : profileSync.ok ? undefined : profileSync.error);
            if (!downgrade.ok) {
              failTrack2Webhook("Failed to downgrade v8 Track 2 api_keys", downgrade.error);
            }
            if (!profileSync.ok) {
              failTrack2Webhook("Failed to sync v8 Track 2 profile cancellation", profileSync.error);
            }
            // Same Track 2 cancel funnel for v8 fallback path.
            void recordFunnelEvent({
              userId: user.id,
              eventType: 'subscription_canceled',
              metadata: {
                subscription_id: subscriptionId,
                channel: 'track2',
                catalog: 'v8',
                previous_tier: v8Tier,
                ended_at: eventData.ended_at,
                canceled_at: eventData.canceled_at,
              },
            });
            break;
          }
        }

        if (user) {
          const endedAtIso = stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString();
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: "free",
              plan_updated_at: new Date().toISOString(),
              stripe_subscription_id: null,
              stripe_subscription_status: "canceled",
              subscription_status: "cancelled",
              stripe_price_id: null,
              stripe_current_period_end: endedAtIso,
              subscription_cancelled: true,
              subscription_ends_at: endedAtIso,
              subscription_ended_at: endedAtIso,
              subscription_renews_at: null,
            })
            .eq("id", user.id);

          if (error) {
            console.error("Failed to downgrade subscription:", error);
            await logBillingEvent(supabase, user.id, "subscription_deleted", {
              subscription_id: subscriptionId,
            }, "failed", error.message);
          } else {
            console.log(`Subscription deleted for user ${user.id}, downgraded to free`);
            await logBillingEvent(supabase, user.id, "subscription_deleted", {
              subscription_id: subscriptionId,
              ended_at: eventData.ended_at,
              canceled_at: eventData.canceled_at,
            });
            // v9 funnel: record churn for cohort retention analytics.
            void recordFunnelEvent({
              userId: user.id,
              eventType: 'subscription_canceled',
              metadata: {
                subscription_id: subscriptionId,
                ended_at: eventData.ended_at,
                canceled_at: eventData.canceled_at,
              },
            });
            // v9 Managed: explicit downgrade path — clears entitlements row.
            // Without this signal, syncManagedEntitlements would preserve
            // the existing row (audit round 3 hardening).
            try {
              await syncManagedEntitlements({
                userId: user.id,
                tier: 'indie', // tier value is unused on downgrade path
                column: 'managed',
                charterEligible: false,
                downgrade: true,
              });
            } catch (entError) {
              console.error(`[entitlements] downgrade failed for ${user.id}`, entError);
            }
          }
        }
        break;
      }

      case "invoice.paid": {
        const customerId = eventData.customer as string;
        const subscriptionId = eventData.subscription;

        console.log(
          `Invoice paid for customer ${customerId}, subscription ${subscriptionId}`,
          {
            amount_paid: eventData.amount_paid,
            currency: eventData.currency,
            billing_reason: eventData.billing_reason,
          }
        );

        const user = await findUser(supabase, customerId, null);

        if (user) {
          // Clear any payment failed flags
          await supabase
            .from("profiles")
            .update({
              subscription_payment_failed: false,
              subscription_payment_failed_at: null,
            })
            .eq("id", user.id);

          await logBillingEvent(supabase, user.id, "invoice_paid", {
            subscription_id: subscriptionId,
            amount_paid: eventData.amount_paid,
            currency: eventData.currency,
            billing_reason: eventData.billing_reason,
            invoice_url: eventData.hosted_invoice_url,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const customerId = eventData.customer as string;
        const subscriptionId = eventData.subscription;

        console.log(
          `Payment failed for customer ${customerId}, subscription ${subscriptionId}`,
          {
            amount_due: eventData.amount_due,
            currency: eventData.currency,
          }
        );

        const user = await findUser(supabase, customerId, null);

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              subscription_payment_failed: true,
              subscription_payment_failed_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          if (error) {
            console.error("Failed to mark payment as failed:", error);
          }

          await logBillingEvent(supabase, user.id, "invoice_payment_failed", {
            subscription_id: subscriptionId,
            amount_due: eventData.amount_due,
            currency: eventData.currency,
            hosted_invoice_url: eventData.hosted_invoice_url,
          });
        }

        // Send payment failed notification email
        if (user?.email) {
          const emailLocale: 'ko' | 'en' = user.language === 'ko' ? 'ko' : 'en';
          await sendEmail({
            to: user.email,
            subject: emailLocale === 'ko'
              ? '확인 필요: Seizn 결제가 실패했습니다'
              : 'Action required: Your Seizn payment failed',
            html: paymentFailedEmail(
              user.full_name || 'there',
              String(eventData.amount_due),
              eventData.currency,
              eventData.hosted_invoice_url,
              emailLocale
            ),
          }).catch((err) => console.error('Failed to send payment failure email:', err));
        }
        break;
      }

      case "customer.created": {
        console.log(`Customer created: ${eventData.id}`, {
          email: eventData.email,
          name: eventData.name,
        });

        // Try to associate customer with existing user by email
        if (eventData.email) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", eventData.email)
            .single();

          if (profile) {
            await supabase
              .from("profiles")
              .update({ stripe_customer_id: eventData.id })
              .eq("id", profile.id);

            await logBillingEvent(supabase, profile.id, "customer_created", {
              customer_id: eventData.id,
              email: eventData.email,
            });
          }
        }
        break;
      }

      case "customer.updated": {
        console.log(`Customer updated: ${eventData.id}`, {
          email: eventData.email,
          name: eventData.name,
        });
        // Log for auditing purposes
        const user = await findUser(supabase, eventData.id, null);
        if (user) {
          await logBillingEvent(supabase, user.id, "customer_updated", {
            customer_id: eventData.id,
            email: eventData.email,
            name: eventData.name,
          });
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${eventType}`);
    }

    // Mark this event finalized so subsequent retries see processed_at
    // and short-circuit. Failure paths above return early WITHOUT reaching
    // here, leaving processed_at NULL so Stripe retries can complete the
    // work (e.g., late-arriving subscription.created lands first).
    await supabase
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', payload.id)
      .is('processed_at', null);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    // Intentionally do NOT mark processed_at — Stripe retries this event.
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Stripe only sends POST requests for webhooks
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
