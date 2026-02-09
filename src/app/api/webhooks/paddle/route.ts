import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { createServerClient } from "@/lib/supabase";
import { getPlanFromPriceId } from "@/lib/paddle-config";
import { sendEmail, paymentFailedEmail } from "@/lib/email";

// Paddle webhook event types
type PaddleEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.cancelled"
  | "subscription.paused"
  | "subscription.resumed"
  | "subscription.activated"
  | "transaction.completed"
  | "transaction.payment_failed"
  | "transaction.updated";

// Paddle webhook payload structure
interface PaddleWebhookPayload {
  event_id: string;
  event_type: PaddleEventType;
  occurred_at: string;
  notification_id: string;
  data: PaddleEventData;
}

interface PaddleEventData {
  id: string;
  status?: string;
  customer_id?: string;
  address_id?: string;
  business_id?: string | null;
  currency_code?: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  first_billed_at?: string | null;
  next_billed_at?: string | null;
  paused_at?: string | null;
  canceled_at?: string | null;
  // Subscription specific
  subscription_id?: string;
  current_billing_period?: {
    starts_at: string;
    ends_at: string;
  };
  billing_cycle?: {
    interval: "month" | "year";
    frequency: number;
  };
  scheduled_change?: {
    action: "cancel" | "pause" | "resume";
    effective_at: string;
    resume_at?: string;
  } | null;
  items?: PaddleItem[];
  // Transaction specific
  origin?: string;
  invoice_id?: string | null;
  invoice_number?: string | null;
  // Custom data passed from checkout
  custom_data?: {
    user_id?: string;
    [key: string]: unknown;
  };
}

interface PaddleItem {
  status: string;
  quantity: number;
  recurring: boolean;
  created_at: string;
  updated_at: string;
  previously_billed_at: string | null;
  next_billed_at: string | null;
  trial_dates: {
    starts_at: string;
    ends_at: string;
  } | null;
  price: {
    id: string;
    product_id: string;
    name: string | null;
    description: string | null;
    type: "standard" | "custom";
    billing_cycle: {
      interval: "month" | "year";
      frequency: number;
    } | null;
    trial_period: {
      interval: "day" | "week" | "month" | "year";
      frequency: number;
    } | null;
    tax_mode: "account_setting" | "external" | "internal";
    unit_price: {
      amount: string;
      currency_code: string;
    };
    unit_price_overrides: unknown[];
    quantity: {
      minimum: number;
      maximum: number;
    };
    status: string;
    custom_data: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  };
  product: {
    id: string;
    name: string;
    description: string | null;
    type: "standard" | "custom";
    tax_category: string;
    image_url: string | null;
    custom_data: Record<string, unknown> | null;
    status: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Verify Paddle webhook signature
 * Uses Paddle-Signature header with ts and h1 components
 */
function verifyPaddleSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Parse Paddle-Signature header: ts=xxx;h1=xxx
    const parts = signature.split(";");
    const signatureData: Record<string, string> = {};

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key && value) {
        signatureData[key.trim()] = value.trim();
      }
    }

    const timestamp = signatureData["ts"];
    const expectedSignature = signatureData["h1"];

    if (!timestamp || !expectedSignature) {
      console.error("Missing timestamp or signature in Paddle-Signature header");
      return false;
    }

    // Check timestamp is within acceptable range (5 minutes)
    const timestampInt = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300; // 5 minutes

    if (Math.abs(now - timestampInt) > tolerance) {
      console.error("Paddle webhook timestamp is outside acceptable range");
      return false;
    }

    // Build signed payload: timestamp:payload
    const signedPayload = `${timestamp}:${payload}`;

    // Compute HMAC SHA256
    const hmac = crypto.createHmac("sha256", secret);
    const digest = hmac.update(signedPayload).digest("hex");

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.error("Error verifying Paddle signature:", error);
    return false;
  }
}

/**
 * Extract price ID from subscription items
 */
function extractPriceId(items?: PaddleItem[]): string | null {
  if (!items || items.length === 0) return null;
  return items[0]?.price?.id || null;
}

/**
 * Find user by Paddle customer ID or custom user ID
 */
async function findUser(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string | undefined,
  customUserId: string | undefined
): Promise<{ id: string; email?: string; full_name?: string } | null> {
  // Try finding by Paddle customer ID first
  if (customerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("paddle_customer_id", customerId)
      .single();

    if (profile) return profile;
  }

  // Try finding by custom user ID from checkout
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

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("PADDLE_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("Paddle-Signature");

    if (!signature) {
      console.error("Missing Paddle-Signature header");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    // Verify signature
    if (!verifyPaddleSignature(rawBody, signature, webhookSecret)) {
      console.error("Invalid Paddle webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: PaddleWebhookPayload = JSON.parse(rawBody);
    const eventType = payload.event_type;
    const eventData = payload.data;

    console.log(`Received Paddle webhook: ${eventType}`, {
      event_id: payload.event_id,
      customer_id: eventData.customer_id,
    });

    const supabase = createServerClient();

    // Handle different event types
    switch (eventType) {
      case "subscription.created":
      case "subscription.activated": {
        const customerId = eventData.customer_id;
        const subscriptionId = eventData.id;
        const priceId = extractPriceId(eventData.items);
        const customUserId = eventData.custom_data?.user_id;

        if (!priceId) {
          console.error("No price ID in subscription");
          break;
        }

        const plan = getPlanFromPriceId(priceId);
        if (!plan) {
          console.error(`Unknown price ID: ${priceId}`);
          break;
        }

        // Find or create user association
        let user = await findUser(supabase, customerId, customUserId);

        if (!user && customUserId) {
          // If user not found by customer ID, try to update by custom user ID
          user = { id: customUserId };
        }

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: plan,
              plan_updated_at: new Date().toISOString(),
              paddle_customer_id: customerId,
              paddle_subscription_id: subscriptionId,
              subscription_ends_at: eventData.current_billing_period?.ends_at || null,
              subscription_renews_at: eventData.next_billed_at || null,
              subscription_cancelled: false,
            })
            .eq("id", user.id);

          if (error) {
            console.error("Failed to update user plan:", error);
          } else {
            console.log(`Subscription created for user ${user.id}: ${plan} plan`);
          }
        } else {
          console.error("Could not find user for subscription", {
            customerId,
            customUserId,
          });
        }
        break;
      }

      case "subscription.updated": {
        const customerId = eventData.customer_id;
        const priceId = extractPriceId(eventData.items);

        if (!customerId) {
          console.error("Missing customer ID in subscription update");
          break;
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.custom_data?.user_id
        );

        if (!user) {
          console.error(`User not found for customer: ${customerId}`);
          break;
        }

        const updates: Record<string, unknown> = {
          subscription_ends_at: eventData.current_billing_period?.ends_at || null,
          subscription_renews_at: eventData.next_billed_at || null,
        };

        // Check for scheduled cancellation
        if (eventData.scheduled_change?.action === "cancel") {
          updates.subscription_cancelled = true;
          updates.subscription_ends_at = eventData.scheduled_change.effective_at;
        }

        // Update plan if price changed
        if (priceId) {
          const plan = getPlanFromPriceId(priceId);
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
        } else {
          console.log(`Subscription updated for user ${user.id}`);
        }
        break;
      }

      case "subscription.cancelled": {
        const customerId = eventData.customer_id;

        if (!customerId) {
          console.error("Missing customer ID in cancellation");
          break;
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.custom_data?.user_id
        );

        if (user) {
          // User keeps access until the end of the billing period
          const { error } = await supabase
            .from("profiles")
            .update({
              subscription_cancelled: true,
              subscription_ends_at:
                eventData.canceled_at ||
                eventData.current_billing_period?.ends_at ||
                null,
            })
            .eq("id", user.id);

          if (error) {
            console.error("Failed to mark subscription cancelled:", error);
          } else {
            console.log(`Subscription cancelled for user ${user.id}`);
          }
        }
        break;
      }

      case "subscription.paused": {
        const customerId = eventData.customer_id;

        if (!customerId) {
          console.error("Missing customer ID in pause event");
          break;
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.custom_data?.user_id
        );

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              subscription_paused: true,
              subscription_paused_at: eventData.paused_at || new Date().toISOString(),
            })
            .eq("id", user.id);

          if (error) {
            console.error("Failed to mark subscription paused:", error);
          } else {
            console.log(`Subscription paused for user ${user.id}`);
          }
        }
        break;
      }

      case "subscription.resumed": {
        const customerId = eventData.customer_id;
        const priceId = extractPriceId(eventData.items);

        if (!customerId) {
          console.error("Missing customer ID in resume event");
          break;
        }

        const user = await findUser(
          supabase,
          customerId,
          eventData.custom_data?.user_id
        );

        if (user) {
          const updates: Record<string, unknown> = {
            subscription_paused: false,
            subscription_paused_at: null,
            subscription_cancelled: false,
            subscription_ends_at: eventData.current_billing_period?.ends_at || null,
            subscription_renews_at: eventData.next_billed_at || null,
          };

          // Restore plan from subscription
          if (priceId) {
            const plan = getPlanFromPriceId(priceId);
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
            console.error("Failed to resume subscription:", error);
          } else {
            console.log(`Subscription resumed for user ${user.id}`);
          }
        }
        break;
      }

      case "transaction.completed": {
        const customerId = eventData.customer_id;
        const subscriptionId = eventData.subscription_id;

        console.log(
          `Payment completed for customer ${customerId}, subscription ${subscriptionId}`
        );

        // Payment success - could trigger email notification or other actions
        // The subscription.updated event will handle the actual plan updates
        break;
      }

      case "transaction.payment_failed": {
        const customerId = eventData.customer_id;
        const subscriptionId = eventData.subscription_id;

        console.log(
          `Payment failed for customer ${customerId}, subscription ${subscriptionId}`
        );

        // Find user and optionally mark as past due
        const user = await findUser(
          supabase,
          customerId,
          eventData.custom_data?.user_id
        );

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
        }

        // Send payment failed notification email
        if (user?.email) {
          await sendEmail({
            to: user.email,
            subject: 'Action required: Your Seizn payment failed',
            html: paymentFailedEmail(user.full_name || 'there'),
          }).catch((err) => console.error('Failed to send payment failure email:', err));
        }
        break;
      }

      case "transaction.updated": {
        // Transaction updates - log for debugging
        console.log(`Transaction updated: ${eventData.id}`, {
          status: eventData.status,
          customer_id: eventData.customer_id,
        });
        break;
      }

      default:
        console.log(`Unhandled Paddle event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paddle webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Paddle only sends POST requests for webhooks
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
