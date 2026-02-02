import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { createServerClient } from "@/lib/supabase";
import { getPlanFromStripePriceId } from "@/lib/stripe-config";

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

/**
 * Find user by Stripe customer ID or custom user ID
 */
async function findUser(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string | undefined,
  customUserId: string | undefined | null
): Promise<{ id: string } | null> {
  // Try finding by Stripe customer ID first
  if (customerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (profile) return profile;
  }

  // Try finding by custom user ID from checkout metadata
  if (customUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
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

    console.log(`Received Stripe webhook: ${eventType}`, {
      event_id: payload.id,
      customer: eventData.customer,
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

        const plan = getPlanFromStripePriceId(priceId);
        if (!plan) {
          console.error(`Unknown price ID: ${priceId}`);
          break;
        }

        // Find or create user association
        let user = await findUser(supabase, customerId, customUserId);

        if (!user && customUserId) {
          user = { id: customUserId };
        }

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: plan,
              plan_updated_at: new Date().toISOString(),
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_ends_at: eventData.current_period_end
                ? new Date(eventData.current_period_end * 1000).toISOString()
                : null,
              subscription_renews_at: eventData.current_period_end && !eventData.cancel_at_period_end
                ? new Date(eventData.current_period_end * 1000).toISOString()
                : null,
              subscription_cancelled: false,
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
            await logBillingEvent(supabase, user.id, "subscription_created", {
              subscription_id: subscriptionId,
              plan,
              price_id: priceId,
              current_period_end: eventData.current_period_end,
            });
          }
        } else {
          console.error("Could not find user for subscription", {
            customerId,
            customUserId,
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

        const updates: Record<string, unknown> = {
          stripe_subscription_id: subscriptionId,
          subscription_ends_at: eventData.current_period_end
            ? new Date(eventData.current_period_end * 1000).toISOString()
            : null,
        };

        // Check for scheduled cancellation
        if (eventData.cancel_at_period_end) {
          updates.subscription_cancelled = true;
          updates.subscription_renews_at = null;
        } else {
          updates.subscription_cancelled = false;
          updates.subscription_renews_at = eventData.current_period_end
            ? new Date(eventData.current_period_end * 1000).toISOString()
            : null;
        }

        // Update plan if price changed
        if (priceId) {
          const plan = getPlanFromStripePriceId(priceId);
          if (plan) {
            updates.plan = plan;
            updates.plan_updated_at = new Date().toISOString();
          }
        }

        const { error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", user.id);

        if (error) {
          console.error("Failed to update subscription:", error);
          await logBillingEvent(supabase, user.id, "subscription_updated", {
            subscription_id: subscriptionId,
            updates,
          }, "failed", error.message);
        } else {
          console.log(`Subscription updated for user ${user.id}`);
          await logBillingEvent(supabase, user.id, "subscription_updated", {
            subscription_id: subscriptionId,
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

        if (!customerId) {
          console.error("Missing customer ID in subscription deletion");
          break;
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.metadata?.user_id
        );

        if (user) {
          // Downgrade to free plan immediately on deletion
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: "free",
              plan_updated_at: new Date().toISOString(),
              stripe_subscription_id: null,
              subscription_cancelled: true,
              subscription_ends_at: eventData.ended_at
                ? new Date(eventData.ended_at * 1000).toISOString()
                : new Date().toISOString(),
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

        // TODO: Send payment failed notification email
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
