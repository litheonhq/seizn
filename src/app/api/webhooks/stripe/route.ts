import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { createServerClient } from "@/lib/supabase";
import {
  AUTHOR_PRICE_LOCK_VERSION,
  getPlanFromStripePriceId,
  mapStripeSubscriptionStatus,
} from "@/lib/stripe-config";
import {
  applyV8Track2TierToApiKeys,
  getV8Track2TierFromStripePriceId,
  type V8Track2Tier,
} from "@/lib/billing/v8-products";
import {
  ensureMeteredPriceAttached,
  ensureV8Track2OpusOverageAttached,
  ensureV8Track2OpusOverageDetached,
} from "@/lib/stripe-metered";
import { sendEmail, paymentFailedEmail } from "@/lib/email";

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
  secret: string
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

    // Compute HMAC SHA256
    const hmac = crypto.createHmac("sha256", secret);
    const digest = hmac.update(signedPayload).digest("hex");

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.error("Error verifying Stripe signature:", error);
    return false;
  }
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
  const plan = priceId ? getPlanFromStripePriceId(priceId) : null;
  const periodEnd = stripeTimestampToIso(eventData.current_period_end);
  const cancelAtPeriodEnd = eventData.cancel_at_period_end === true;
  const updates: Record<string, unknown> = {
    stripe_subscription_id: eventData.id,
    stripe_subscription_status: eventData.status ?? null,
    subscription_status: mapStripeSubscriptionStatus(eventData.status),
    stripe_price_id: priceId,
    stripe_current_period_start: stripeTimestampToIso(eventData.current_period_start),
    stripe_current_period_end: periodEnd,
    subscription_ends_at: periodEnd,
    subscription_renews_at: cancelAtPeriodEnd ? null : periodEnd,
    subscription_trial_ends_at: stripeTimestampToIso(eventData.trial_end),
    subscription_cancelled: cancelAtPeriodEnd || eventData.status === "canceled",
    subscription_payment_failed: eventData.status === "past_due" || eventData.status === "unpaid",
    price_lock_version: AUTHOR_PRICE_LOCK_VERSION,
  };

  if (plan) {
    updates.plan = plan;
    updates.plan_updated_at = new Date().toISOString();
  }

  return updates;
}

/**
 * Find user by Stripe customer ID or custom user ID
 */
async function findUser(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string | undefined,
  customUserId: string | undefined | null
): Promise<{ id: string; email?: string; full_name?: string } | null> {
  // Try finding by Stripe customer ID first
  if (customerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("stripe_customer_id", customerId)
      .single();

    if (profile) return profile;
  }

  // Try finding by custom user ID from checkout metadata
  if (customUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
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

type V8AdjustmentResult =
  | { matched: true; tier: V8Track2Tier; updated: boolean; error?: string }
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
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

    // Verify signature
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      console.error("Invalid Stripe webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: StripeWebhookPayload = JSON.parse(rawBody);
    const eventType = payload.type;
    const eventData = payload.data.object;

    // Per-event log line — keep PII out of the per-event row. Customer ID
    // can be linked back to a real user via Stripe; the event_id alone is
    // enough to correlate with the audit_logs row written by handlers below.
    console.log(`Received Stripe webhook: ${eventType}`, {
      event_id: payload.id,
      livemode: payload.livemode,
    });

    const supabase = createServerClient();

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

        const v8 = await maybeApplyV8Track2(supabase, user.id, priceId);
        if (v8.matched) {
          if (!v8.updated) {
            console.error("Failed to apply v8 Track 2 tier on api_keys:", v8.error);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              channel: "track2",
              tier: v8.tier,
              price_id: priceId,
            }, "failed", v8.error);
          } else {
            console.log(`v8 Track 2 subscription created for user ${user.id}: ${v8.tier}`);
            await attachV8Track2ManagedOverage(subscriptionId, v8.tier);
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              channel: "track2",
              tier: v8.tier,
              price_id: priceId,
              current_period_end: eventData.current_period_end,
            });
          }
          break;
        }

        const plan = getPlanFromStripePriceId(priceId);
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
          console.error(`User not found for customer: ${customerId}`);
          break;
        }

        if (priceId) {
          const v8 = await maybeApplyV8Track2(supabase, user.id, priceId);
          if (v8.matched) {
            if (!v8.updated) {
              console.error("Failed to apply v8 Track 2 tier on api_keys:", v8.error);
              await logBillingEvent(supabase, user.id, "subscription_updated", {
                subscription_id: subscriptionId,
                channel: "track2",
                tier: v8.tier,
                price_id: priceId,
              }, "failed", v8.error);
            } else {
              console.log(`v8 Track 2 subscription updated for user ${user.id}: ${v8.tier}`);
              // Symmetric upgrade/downgrade handling for the Studio Managed
              // Opus overage line: attach if user is now on Studio Managed,
              // detach if they moved off it. Both calls are idempotent.
              await attachV8Track2ManagedOverage(subscriptionId, v8.tier);
              await detachV8Track2ManagedOverageIfDowngrade(subscriptionId, v8.tier);
              await logBillingEvent(supabase, user.id, "subscription_updated", {
                subscription_id: subscriptionId,
                channel: "track2",
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

        const user = await findUser(
          supabase,
          customerId,
          eventData.metadata?.user_id
        );

        if (user && priceId) {
          const v8Tier = getV8Track2TierFromStripePriceId(priceId);
          if (v8Tier) {
            const downgrade = await applyV8Track2TierToApiKeys(
              user.id,
              "free",
              supabase as unknown as Parameters<typeof applyV8Track2TierToApiKeys>[2],
            );
            await logBillingEvent(supabase, user.id, "subscription_deleted", {
              subscription_id: subscriptionId,
              channel: "track2",
              previous_tier: v8Tier,
              downgraded_to: "free",
              ended_at: eventData.ended_at,
            }, downgrade.ok ? "success" : "failed", downgrade.ok ? undefined : downgrade.error);
            break;
          }
        }

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: "free",
              plan_updated_at: new Date().toISOString(),
              stripe_subscription_id: null,
              stripe_subscription_status: "canceled",
              subscription_status: "cancelled",
              stripe_price_id: null,
              stripe_current_period_end: stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString(),
              subscription_cancelled: true,
              subscription_ends_at: stripeTimestampToIso(eventData.ended_at) ?? new Date().toISOString(),
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
          await sendEmail({
            to: user.email,
            subject: 'Action required: Your Seizn payment failed',
            html: paymentFailedEmail(
              user.full_name || 'there',
              String(eventData.amount_due),
              eventData.currency,
              eventData.hosted_invoice_url
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

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
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
