import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { BYOK_COUPON_ID } from "@/lib/stripe-config";

interface BillingProfile {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  byok_discount_active?: boolean | null;
  byok_discount_coupon?: string | null;
}

export type ByokDiscountStatus = "inactive" | "pending" | "applied" | "error" | "deprecated";
export type ByokDiscountSyncReason =
  | "missing_billing_customer"
  | "pending_subscription"
  | "stripe_not_configured"
  | "stripe_sync_failed"
  | "deprecated_in_v9";

export interface ByokDiscountSyncResult {
  applied: boolean;
  removed?: boolean;
  coupon: string;
  status: ByokDiscountStatus;
  reason?: ByokDiscountSyncReason;
  error?: string;
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
  // v9 retires the BYOK coupon path: BYOK becomes its own Stripe price column,
  // so applying a coupon on top would double-discount. Return early as a no-op
  // when neither the env var nor the constant supplies a coupon ID.
  if (!coupon) {
    return {
      applied: false,
      removed: !enabled,
      coupon: '',
      status: 'deprecated',
      reason: 'deprecated_in_v9',
    };
  }
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id,stripe_subscription_id,byok_discount_active,byok_discount_coupon")
    .eq("id", userId)
    .single<BillingProfile>();
  const existingActive = profile?.byok_discount_active === true;
  const existingCoupon = profile?.byok_discount_coupon ?? coupon;

  if (!profile?.stripe_customer_id) {
    const status = enabled ? "pending" : "inactive";
    await markByokDiscount(userId, {
      active: false,
      coupon: enabled ? coupon : null,
      status,
      error: null,
    });
    return {
      applied: false,
      removed: !enabled,
      coupon,
      status,
      reason: "missing_billing_customer",
    };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    await markByokDiscount(userId, {
      active: enabled ? false : existingActive,
      coupon: enabled || existingActive ? existingCoupon : null,
      status: "error",
      error: "stripe_not_configured",
    });
    return {
      applied: false,
      removed: false,
      coupon,
      status: "error",
      reason: "stripe_not_configured",
      error: "stripe_not_configured",
    };
  }

  const stripe = getStripeClient();
  try {
    if (profile.stripe_subscription_id) {
      await updateSubscriptionDiscount(stripe, profile.stripe_subscription_id, enabled, coupon);
      const status = enabled ? "applied" : "inactive";
      await markByokDiscount(userId, {
        active: enabled,
        coupon: enabled ? coupon : null,
        status,
        error: null,
      });
      return { applied: enabled, removed: !enabled, coupon, status };
    }

    await stripe.customers.update(profile.stripe_customer_id, {
      metadata: {
        seizn_byok_discount: enabled ? "pending" : "disabled",
        seizn_byok_coupon: enabled ? coupon : "",
      },
    });
    const status = enabled ? "pending" : "inactive";
    await markByokDiscount(userId, {
      active: false,
      coupon: enabled ? coupon : null,
      status,
      error: null,
    });
    return {
      applied: false,
      removed: !enabled,
      coupon,
      status,
      ...(enabled ? { reason: "pending_subscription" as const } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "stripe_sync_failed";
    await markByokDiscount(userId, {
      active: enabled ? false : existingActive,
      coupon: enabled || existingActive ? existingCoupon : null,
      status: "error",
      error: message,
    });
    return {
      applied: false,
      removed: false,
      coupon,
      status: "error",
      reason: "stripe_sync_failed",
      error: message,
    };
  }
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
  input: {
    active: boolean;
    coupon: string | null;
    status: ByokDiscountStatus;
    error: string | null;
  }
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("profiles")
    .update({
      byok_discount_active: input.active,
      byok_discount_coupon: input.coupon,
      byok_discount_status: input.status,
      byok_discount_error: input.error,
      byok_discount_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}
