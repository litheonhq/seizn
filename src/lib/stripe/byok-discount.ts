import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { BYOK_COUPON_ID } from "@/lib/stripe-config";

interface BillingProfile {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

export interface ByokDiscountSyncResult {
  applied: boolean;
  removed?: boolean;
  coupon: string;
  reason?: "missing_billing_customer" | "stripe_not_configured";
}

export async function applyAuthorByokDiscount(userId: string): Promise<ByokDiscountSyncResult> {
  return syncAuthorByokDiscount(userId, true);
}

export async function removeAuthorByokDiscount(userId: string): Promise<ByokDiscountSyncResult> {
  return syncAuthorByokDiscount(userId, false);
}

async function syncAuthorByokDiscount(
  userId: string,
  enabled: boolean
): Promise<ByokDiscountSyncResult> {
  const coupon = process.env.STRIPE_BYOK_COUPON_ID?.trim() || BYOK_COUPON_ID;
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id,stripe_subscription_id")
    .eq("id", userId)
    .single<BillingProfile>();

  if (!profile?.stripe_customer_id) {
    await markByokDiscount(userId, enabled, coupon);
    return { applied: false, removed: !enabled, coupon, reason: "missing_billing_customer" };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    await markByokDiscount(userId, enabled, coupon);
    return { applied: false, removed: !enabled, coupon, reason: "stripe_not_configured" };
  }

  const stripe = getStripeClient();
  if (profile.stripe_subscription_id) {
    await updateSubscriptionDiscount(stripe, profile.stripe_subscription_id, enabled, coupon);
  } else {
    await stripe.customers.update(profile.stripe_customer_id, {
      metadata: {
        seizn_byok_discount: enabled ? "pending" : "disabled",
        seizn_byok_coupon: enabled ? coupon : "",
      },
    });
  }

  await markByokDiscount(userId, enabled, coupon);
  return { applied: enabled, removed: !enabled, coupon };
}

async function updateSubscriptionDiscount(
  stripe: Stripe,
  subscriptionId: string,
  enabled: boolean,
  coupon: string
): Promise<void> {
  if (enabled) {
    await stripe.subscriptions.update(subscriptionId, {
      discounts: [{ coupon }],
    });
    return;
  }

  await stripe.subscriptions.update(subscriptionId, {
    discounts: [],
  });
}

async function markByokDiscount(
  userId: string,
  enabled: boolean,
  coupon: string
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("profiles")
    .update({
      byok_discount_active: enabled,
      byok_discount_coupon: enabled ? coupon : null,
      byok_discount_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}
