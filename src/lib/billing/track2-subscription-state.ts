import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { mapStripeSubscriptionStatus } from "@/lib/stripe-config";
import {
  V8_PRICE_LOCK_VERSION,
  V8_TRACK2_PRODUCTS,
  V8_TRACK2_QUOTA,
  applyV8Track2TierToApiKeys,
  getV8Track2BillingCadenceFromPriceId,
  getV8Track2TierFromStripePriceId,
  type V8BillingCadence,
  type V8Track2Tier,
} from "@/lib/billing/v8-products";
import {
  V9_PRICE_LOCK_VERSION,
  V9_TRACK2_PRODUCTS,
  V9_TRACK2_QUOTA,
  applyV9Track2TierToApiKeys,
  getV9Track2BillingCadenceFromPriceId,
  getV9Track2CharterStatusFromPriceId,
  getV9Track2TierFromStripePriceId,
  isV9Track2Tier,
  type V9BillingCadence,
  type V9Track2Tier,
} from "@/lib/billing/v9-products";
import { formatTrack2Price } from "@/lib/billing/track2-display";

type Track2Catalog = "v9" | "v8";
type Track2Cadence = V9BillingCadence;

export type Track2Tier = V9Track2Tier;

export interface Track2SubscriptionState {
  channel: "track2";
  catalog: Track2Catalog;
  tier: Track2Tier;
  tier_label: string;
  status: "active" | "cancelled" | "paused" | "past_due" | "incomplete";
  stripe_status: string | null;
  stripe_subscription_id_present: boolean;
  subscription_id: string | null;
  stripe_price_id: string | null;
  billing_cadence: Track2Cadence | null;
  current_period_start: string | null;
  current_period_end: string | null;
  renews_at: string | null;
  cancel_at_period_end: boolean;
  payment_failed: boolean;
  payment_failed_at: string | null;
  price_lock_version: string;
  price_label: string;
  quota: {
    calls: number;
    period: "day" | "month";
    rate_limit_per_minute: number;
    scopes: string[];
  };
}

export interface Track2ProfileRow {
  track2_tier?: string | null;
  track2_subscription_id?: string | null;
  track2_subscription_status?: string | null;
  track2_price_id?: string | null;
  track2_billing_cadence?: string | null;
  track2_price_lock_version?: string | null;
  track2_current_period_start?: string | null;
  track2_current_period_end?: string | null;
  track2_subscription_renews_at?: string | null;
  track2_subscription_cancelled?: boolean | null;
  track2_subscription_payment_failed?: boolean | null;
  track2_subscription_payment_failed_at?: string | null;
}

type SupabaseLike = {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
    select(columns: string, options?: Record<string, unknown>): {
      eq(column: string, value: string): {
        data?: unknown;
        error?: { message: string } | null;
        then?: unknown;
      };
    };
  };
};

const LIVE_TRACK2_STATUSES = new Set(["active", "trialing", "past_due", "paused"]);

export function resolveTrack2Price(priceId: string | null | undefined):
  | {
    catalog: Track2Catalog;
    tier: Track2Tier;
    label: string;
    cadence: Track2Cadence | null;
    priceLockVersion: string;
  }
  | null {
  if (!priceId) return null;

  const v9Tier = getV9Track2TierFromStripePriceId(priceId);
  if (v9Tier) {
    return {
      catalog: "v9",
      tier: v9Tier,
      label: V9_TRACK2_PRODUCTS[v9Tier].label,
      cadence: getV9Track2BillingCadenceFromPriceId(priceId),
      priceLockVersion: V9_PRICE_LOCK_VERSION,
    };
  }

  const v8Tier = getV8Track2TierFromStripePriceId(priceId);
  if (v8Tier) {
    return {
      catalog: "v8",
      tier: v8Tier as Track2Tier,
      label: V8_TRACK2_PRODUCTS[v8Tier].label,
      cadence: normalizeV8Cadence(getV8Track2BillingCadenceFromPriceId(priceId)),
      priceLockVersion: V8_PRICE_LOCK_VERSION,
    };
  }

  return null;
}

export function buildTrack2StateFromProfile(profile: Track2ProfileRow): Track2SubscriptionState | null {
  const tier = normalizeTrack2Tier(profile.track2_tier);
  if (!tier || tier === "free") return null;

  const cadence = normalizeCadence(profile.track2_billing_cadence);
  const price = resolveTrack2Price(profile.track2_price_id);
  const catalog = price?.catalog ?? (profile.track2_price_lock_version === V8_PRICE_LOCK_VERSION ? "v8" : "v9");
  const stripeStatus = profile.track2_subscription_status ?? null;
  const status = mapStripeSubscriptionStatus(stripeStatus ?? undefined);
  const periodEnd = profile.track2_current_period_end ?? null;
  const cancelAtPeriodEnd = profile.track2_subscription_cancelled === true;

  return stateFromParts({
    catalog,
    tier,
    status,
    stripeStatus,
    subscriptionId: profile.track2_subscription_id ?? null,
    priceId: profile.track2_price_id ?? null,
    cadence: price?.cadence ?? cadence,
    periodStart: profile.track2_current_period_start ?? null,
    periodEnd,
    renewsAt: cancelAtPeriodEnd ? null : (profile.track2_subscription_renews_at ?? periodEnd),
    cancelAtPeriodEnd,
    paymentFailed: profile.track2_subscription_payment_failed === true,
    paymentFailedAt: profile.track2_subscription_payment_failed_at ?? null,
    priceLockVersion: profile.track2_price_lock_version ?? price?.priceLockVersion ?? V9_PRICE_LOCK_VERSION,
  });
}

export function buildTrack2StateFromStripeSubscription(subscription: Stripe.Subscription): Track2SubscriptionState | null {
  const item = subscription.items?.data?.find((candidate) =>
    resolveTrack2Price(candidate.price?.id ?? null) !== null
  );
  const priceId = item?.price?.id ?? null;
  const price = resolveTrack2Price(priceId);
  if (!price) return null;

  const stripeStatus = typeof subscription.status === "string" ? subscription.status : null;
  const status = mapStripeSubscriptionStatus(stripeStatus ?? undefined);
  const periodStart = readStripeTimestamp(item, "current_period_start")
    ?? readStripeTimestamp(subscription, "current_period_start")
    ?? readStripeTimestamp(subscription, "start_date");
  const periodEnd = readStripeTimestamp(item, "current_period_end")
    ?? readStripeTimestamp(subscription, "current_period_end")
    ?? readStripeTimestamp(subscription, "ended_at");
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;

  return stateFromParts({
    catalog: price.catalog,
    tier: price.tier,
    status,
    stripeStatus,
    subscriptionId: subscription.id ?? null,
    priceId,
    cadence: price.cadence,
    periodStart,
    periodEnd,
    renewsAt: cancelAtPeriodEnd ? null : periodEnd,
    cancelAtPeriodEnd,
    paymentFailed: status === "past_due",
    paymentFailedAt: status === "past_due" ? new Date().toISOString() : null,
    priceLockVersion: price.priceLockVersion,
  });
}

export async function findLiveTrack2Subscription(customerId: string | null | undefined): Promise<Track2SubscriptionState | null> {
  if (!customerId) return null;

  const stripe = getStripeClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  const states = subscriptions.data
    .map(buildTrack2StateFromStripeSubscription)
    .filter((state): state is Track2SubscriptionState => Boolean(state))
    .filter((state) => LIVE_TRACK2_STATUSES.has(state.stripe_status ?? state.status));

  return states[0] ?? null;
}

export async function syncTrack2ProfileAndKeys(
  supabase: SupabaseLike,
  userId: string,
  state: Track2SubscriptionState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({
      track2_tier: state.tier,
      track2_subscription_id: state.subscription_id,
      track2_subscription_status: state.stripe_status,
      track2_price_id: state.stripe_price_id,
      track2_billing_cadence: state.billing_cadence,
      track2_price_lock_version: state.price_lock_version,
      track2_current_period_start: state.current_period_start,
      track2_current_period_end: state.current_period_end,
      track2_subscription_renews_at: state.renews_at,
      track2_subscription_cancelled: state.cancel_at_period_end,
      track2_subscription_payment_failed: state.payment_failed,
      track2_subscription_payment_failed_at: state.payment_failed_at,
      track2_subscription_ended_at: null,
      track2_synced_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  const quotaResult = state.catalog === "v8"
    ? await applyV8Track2TierToApiKeys(userId, state.tier as V8Track2Tier, supabase as Parameters<typeof applyV8Track2TierToApiKeys>[2])
    : await applyV9Track2TierToApiKeys(userId, state.tier, supabase as Parameters<typeof applyV9Track2TierToApiKeys>[2]);

  return quotaResult.ok ? { ok: true } : { ok: false, error: quotaResult.error };
}

export async function recoverLiveTrack2ProfileAndKeys(
  supabase: SupabaseLike,
  userId: string,
  stripeCustomerId: string | null | undefined,
): Promise<Track2SubscriptionState | null> {
  const live = await findLiveTrack2Subscription(stripeCustomerId);
  if (!live) return null;

  const sync = await syncTrack2ProfileAndKeys(supabase, userId, live);
  if (!sync.ok) {
    console.error("[track2] live subscription sync failed", { userId, error: sync.error });
  }
  return live;
}

export async function downgradeTrack2ProfileAndKeys(
  supabase: SupabaseLike,
  userId: string,
  input: {
    subscriptionId?: string | null;
    priceId?: string | null;
    endedAt?: string | null;
    catalog?: Track2Catalog;
  } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const endedAt = input.endedAt ?? new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      track2_tier: "free",
      track2_subscription_id: input.subscriptionId ?? null,
      track2_subscription_status: "canceled",
      track2_price_id: input.priceId ?? null,
      track2_billing_cadence: null,
      track2_current_period_start: null,
      track2_current_period_end: endedAt,
      track2_subscription_renews_at: null,
      track2_subscription_cancelled: true,
      track2_subscription_payment_failed: false,
      track2_subscription_payment_failed_at: null,
      track2_subscription_ended_at: endedAt,
      track2_synced_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  const quotaResult = input.catalog === "v8"
    ? await applyV8Track2TierToApiKeys(userId, "free", supabase as Parameters<typeof applyV8Track2TierToApiKeys>[2])
    : await applyV9Track2TierToApiKeys(userId, "free", supabase as Parameters<typeof applyV9Track2TierToApiKeys>[2]);

  return quotaResult.ok ? { ok: true } : { ok: false, error: quotaResult.error };
}

function stateFromParts(input: {
  catalog: Track2Catalog;
  tier: Track2Tier;
  status: Track2SubscriptionState["status"];
  stripeStatus: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  cadence: Track2Cadence | null;
  periodStart: string | null;
  periodEnd: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  paymentFailed: boolean;
  paymentFailedAt: string | null;
  priceLockVersion: string;
}): Track2SubscriptionState {
  const quota = input.catalog === "v8"
    ? V8_TRACK2_QUOTA[input.tier as V8Track2Tier]
    : V9_TRACK2_QUOTA[input.tier];
  const label = input.catalog === "v8"
    ? V8_TRACK2_PRODUCTS[input.tier as V8Track2Tier].label
    : V9_TRACK2_PRODUCTS[input.tier].label;

  return {
    channel: "track2",
    catalog: input.catalog,
    tier: input.tier,
    tier_label: label,
    status: input.status,
    stripe_status: input.stripeStatus,
    stripe_subscription_id_present: Boolean(input.subscriptionId),
    subscription_id: input.subscriptionId,
    stripe_price_id: input.priceId,
    billing_cadence: input.cadence,
    current_period_start: input.periodStart,
    current_period_end: input.periodEnd,
    renews_at: input.renewsAt,
    cancel_at_period_end: input.cancelAtPeriodEnd,
    payment_failed: input.paymentFailed,
    payment_failed_at: input.paymentFailedAt,
    price_lock_version: input.priceLockVersion,
    price_label: input.catalog === "v9" && input.cadence
      ? formatTrack2Price(input.tier, input.cadence)
      : fallbackPriceLabel(input.tier, input.cadence, input.catalog),
    quota: {
      calls: quota.monthlyQuota,
      period: quota.monthlyQuotaPeriod,
      rate_limit_per_minute: quota.rateLimitPerMinute,
      scopes: quota.scopes,
    },
  };
}

function normalizeTrack2Tier(value: unknown): Track2Tier | null {
  if (isV9Track2Tier(value)) return value;
  return null;
}

function normalizeCadence(value: unknown): Track2Cadence | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

function normalizeV8Cadence(value: V8BillingCadence | null): Track2Cadence | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

function readStripeTimestamp(value: unknown, key: string): string | null {
  const timestamp = (value as Record<string, unknown> | null)?.[key];
  return typeof timestamp === "number" ? new Date(timestamp * 1000).toISOString() : null;
}

function fallbackPriceLabel(tier: Track2Tier, cadence: Track2Cadence | null, catalog: Track2Catalog): string {
  if (tier === "free") return "$0";
  if (tier === "enterprise") return "Contact us";
  if (!cadence) return "";
  const amount = catalog === "v8"
    ? (() => {
        const product = V8_TRACK2_PRODUCTS[tier as V8Track2Tier];
        return cadence === "yearly" ? product.yearlyUsd : product.monthlyUsd;
      })()
    : (() => {
        const product = V9_TRACK2_PRODUCTS[tier];
        return cadence === "yearly" ? product.annualUsd : product.monthlyUsd;
      })();
  if (amount === null) return "Contact us";
  return `$${amount.toLocaleString("en-US")}${cadence === "yearly" ? "/yr" : "/mo"}`;
}
