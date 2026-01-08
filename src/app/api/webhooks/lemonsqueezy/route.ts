import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerClient } from "@/lib/supabase";

// Lemon Squeezy webhook event types
type WebhookEvent =
  | "order_created"
  | "order_refunded"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscription_resumed"
  | "subscription_expired"
  | "subscription_paused"
  | "subscription_unpaused"
  | "subscription_payment_success"
  | "subscription_payment_failed";

interface WebhookPayload {
  meta: {
    event_name: WebhookEvent;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      // Order attributes
      user_email?: string;
      user_name?: string;
      status?: string;
      // Subscription attributes
      variant_id?: number;
      product_id?: number;
      customer_id?: number;
      order_id?: number;
      product_name?: string;
      variant_name?: string;
      ends_at?: string | null;
      renews_at?: string | null;
      cancelled?: boolean;
      // Custom fields from checkout
      first_order_item?: {
        variant_id: number;
      };
    };
    relationships?: {
      order?: {
        data?: {
          id: string;
        };
      };
    };
  };
}

// Map variant IDs to plan names
const VARIANT_TO_PLAN: Record<number, string> = {
  1201299: "plus",
  1201303: "pro",
};

// Verify webhook signature
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-signature");

    if (!signature) {
      console.error("Missing webhook signature");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    // Verify signature
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.error("Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: WebhookPayload = JSON.parse(rawBody);
    const eventName = payload.meta.event_name;

    console.log(`Received Lemon Squeezy webhook: ${eventName}`);

    const supabase = createServerClient();

    // Handle different event types
    switch (eventName) {
      case "order_created": {
        // Get user info from custom data or email
        const userEmail = payload.data.attributes.user_email;
        const customUserId = payload.meta.custom_data?.user_id;
        const variantId =
          payload.data.attributes.first_order_item?.variant_id ||
          payload.data.attributes.variant_id;

        if (!variantId) {
          console.error("No variant ID in order");
          break;
        }

        const plan = VARIANT_TO_PLAN[variantId];
        if (!plan) {
          console.error(`Unknown variant ID: ${variantId}`);
          break;
        }

        // Find user by custom ID or email
        let userId = customUserId;
        if (!userId && userEmail) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", userEmail)
            .single();
          userId = profile?.id;
        }

        if (userId) {
          // Update user's plan
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: plan,
              plan_updated_at: new Date().toISOString(),
              lemonsqueezy_customer_id: payload.data.attributes.customer_id,
            })
            .eq("id", userId);

          if (error) {
            console.error("Failed to update user plan:", error);
          } else {
            console.log(`Updated user ${userId} to ${plan} plan`);
          }
        } else {
          console.error("Could not find user for order");
        }
        break;
      }

      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_unpaused": {
        const variantId = payload.data.attributes.variant_id;
        const customerId = payload.data.attributes.customer_id;

        if (!variantId || !customerId) {
          console.error("Missing variant or customer ID");
          break;
        }

        const plan = VARIANT_TO_PLAN[variantId];
        if (!plan) {
          console.error(`Unknown variant ID: ${variantId}`);
          break;
        }

        // Find user by Lemon Squeezy customer ID
        const { data: profile, error: findError } = await supabase
          .from("profiles")
          .select("id")
          .eq("lemonsqueezy_customer_id", customerId)
          .single();

        if (findError || !profile) {
          // Try finding by email from custom data
          const customUserId = payload.meta.custom_data?.user_id;
          if (customUserId) {
            const { error } = await supabase
              .from("profiles")
              .update({
                plan: plan,
                plan_updated_at: new Date().toISOString(),
                lemonsqueezy_customer_id: customerId,
                subscription_ends_at: payload.data.attributes.ends_at,
                subscription_renews_at: payload.data.attributes.renews_at,
              })
              .eq("id", customUserId);

            if (!error) {
              console.log(`Updated user ${customUserId} to ${plan} plan`);
            }
          }
        } else {
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: plan,
              plan_updated_at: new Date().toISOString(),
              subscription_ends_at: payload.data.attributes.ends_at,
              subscription_renews_at: payload.data.attributes.renews_at,
            })
            .eq("id", profile.id);

          if (!error) {
            console.log(`Updated user ${profile.id} to ${plan} plan`);
          }
        }
        break;
      }

      case "subscription_cancelled":
      case "subscription_expired":
      case "subscription_paused": {
        const customerId = payload.data.attributes.customer_id;

        if (!customerId) {
          console.error("Missing customer ID");
          break;
        }

        // Find user and downgrade to free
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("lemonsqueezy_customer_id", customerId)
          .single();

        if (profile) {
          // Set subscription end date, but don't immediately downgrade
          // The user keeps access until the subscription period ends
          const { error } = await supabase
            .from("profiles")
            .update({
              subscription_ends_at: payload.data.attributes.ends_at,
              subscription_cancelled: eventName === "subscription_cancelled",
            })
            .eq("id", profile.id);

          if (!error) {
            console.log(
              `Subscription ${eventName} for user ${profile.id}`
            );
          }
        }
        break;
      }

      case "order_refunded": {
        const customerId = payload.data.attributes.customer_id;

        if (!customerId) {
          console.error("Missing customer ID");
          break;
        }

        // Downgrade to free on refund
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("lemonsqueezy_customer_id", customerId)
          .single();

        if (profile) {
          const { error } = await supabase
            .from("profiles")
            .update({
              plan: "free",
              plan_updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);

          if (!error) {
            console.log(`Refunded and downgraded user ${profile.id} to free`);
          }
        }
        break;
      }

      case "subscription_payment_failed": {
        const customerId = payload.data.attributes.customer_id;
        console.log(`Payment failed for customer ${customerId}`);
        // Optionally send notification email
        break;
      }

      case "subscription_payment_success": {
        const customerId = payload.data.attributes.customer_id;
        console.log(`Payment succeeded for customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Lemon Squeezy only sends POST requests for webhooks
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
