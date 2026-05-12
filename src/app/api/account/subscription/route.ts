import { NextRequest } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import {
  AUTHOR_PRICE_LOCK_VERSION,
  getAuthorTierConfig,
  getBillingCadenceFromStripePriceId,
  isAuthorBillingTier,
} from "@/lib/stripe-config";
import {
  buildTrack2StateFromProfile,
  recoverLiveTrack2ProfileAndKeys,
  type Track2ProfileRow,
  type Track2SubscriptionState,
} from "@/lib/billing/track2-subscription-state";
import { getAuthorByokStatus, getAuthorModelUsageSummary } from "@/lib/author/llm";
import {
  AuthorUiNotFoundError,
  AuthorUiValidationError,
  readJsonBody,
  withAuthorUiService,
} from "@/lib/author/ui";

export const runtime = "nodejs";

interface SubscriptionActionBody {
  action?: unknown;
}

interface BillingProfile extends Track2ProfileRow {
  id: string;
  email?: string | null;
  plan?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_subscription_status?: string | null;
  subscription_status?: string | null;
  stripe_price_id?: string | null;
  stripe_current_period_start?: string | null;
  stripe_current_period_end?: string | null;
  subscription_renews_at?: string | null;
  subscription_ends_at?: string | null;
  subscription_trial_ends_at?: string | null;
  subscription_cancelled?: boolean | null;
  subscription_payment_failed?: boolean | null;
  subscription_payment_failed_at?: string | null;
  price_lock_version?: string | null;
}

function billingStartResponse() {
  return {
    url: "/pricing",
    destination: "pricing",
    reason: "no_billing_account",
  };
}

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (_service, userId) => {
    const supabase = createServerClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select([
        "id",
        "email",
        "plan",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_subscription_status",
        "subscription_status",
        "stripe_price_id",
        "stripe_current_period_start",
        "stripe_current_period_end",
        "subscription_renews_at",
        "subscription_ends_at",
        "subscription_trial_ends_at",
        "subscription_cancelled",
        "subscription_payment_failed",
        "subscription_payment_failed_at",
        "price_lock_version",
        "track2_tier",
        "track2_subscription_id",
        "track2_subscription_status",
        "track2_price_id",
        "track2_billing_cadence",
        "track2_price_lock_version",
        "track2_current_period_start",
        "track2_current_period_end",
        "track2_subscription_renews_at",
        "track2_subscription_cancelled",
        "track2_subscription_payment_failed",
        "track2_subscription_payment_failed_at",
      ].join(","))
      .eq("id", userId)
      .single<BillingProfile>();

    if (error || !profile) {
      throw new AuthorUiNotFoundError("Subscription profile not found");
    }

    const byokStatus = await getAuthorByokStatus(userId);
    const usage = await getAuthorModelUsageSummary(userId, undefined, byokStatus.enabled);
    const tier = isAuthorBillingTier(profile.plan) ? profile.plan : null;
    const tierConfig = tier ? getAuthorTierConfig(tier) : null;
    const trialDaysRemaining = getDaysRemaining(profile.subscription_trial_ends_at);
    const billingCadence = profile.stripe_price_id
      ? getBillingCadenceFromStripePriceId(profile.stripe_price_id)
      : null;
    const track2 = await resolveTrack2State(profile, supabase, userId);

    return {
      plan: profile.plan ?? "free",
      tier,
      tier_label: tierConfig?.label ?? "Free",
      status: profile.subscription_status ?? profile.stripe_subscription_status ?? "inactive",
      stripe_status: profile.stripe_subscription_status ?? null,
      stripe_customer_id_present: Boolean(profile.stripe_customer_id),
      stripe_subscription_id_present: Boolean(profile.stripe_subscription_id),
      stripe_price_id: profile.stripe_price_id ?? null,
      billing_cadence: billingCadence,
      current_period_start: profile.stripe_current_period_start ?? null,
      current_period_end: profile.stripe_current_period_end ?? profile.subscription_ends_at ?? null,
      renews_at: profile.subscription_renews_at ?? null,
      ends_at: profile.subscription_ends_at ?? null,
      trial_ends_at: profile.subscription_trial_ends_at ?? null,
      trial_days_remaining: trialDaysRemaining,
      cancel_at_period_end: profile.subscription_cancelled === true,
      payment_failed: profile.subscription_payment_failed === true,
      payment_failed_at: profile.subscription_payment_failed_at ?? null,
      byok_active: byokStatus.enabled,
      price_lock_version: profile.price_lock_version ?? AUTHOR_PRICE_LOCK_VERSION,
      track2,
      usage: {
        tokens_used_month: usage?.total_tokens ?? 0,
        tokens_cap_month: tierConfig?.tokenCapMonth ?? null,
        request_count: usage?.request_count ?? 0,
        byok_active: byokStatus.enabled || usage?.byok_active === true,
      },
    };
  });
}

async function resolveTrack2State(
  profile: BillingProfile,
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<Track2SubscriptionState | null> {
  const stored = buildTrack2StateFromProfile(profile);
  if (stored && stored.status !== "cancelled" && stored.status !== "incomplete") {
    return stored;
  }

  try {
    const live = await recoverLiveTrack2ProfileAndKeys(
      supabase as unknown as Parameters<typeof recoverLiveTrack2ProfileAndKeys>[0],
      userId,
      profile.stripe_customer_id,
    );
    if (!live) return stored;

    return live;
  } catch (error) {
    console.error("[track2] live subscription lookup failed", { userId, error });
    return stored;
  }
}

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async (_service, userId) => {
    const body = await readJsonBody(request) as SubscriptionActionBody;
    const action = typeof body.action === "string" ? body.action : "";
    if (!["portal", "cancel", "resume"].includes(action)) {
      throw new AuthorUiValidationError("Unsupported subscription action");
    }

    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id,stripe_subscription_id")
      .eq("id", userId)
      .single<{ stripe_customer_id?: string | null; stripe_subscription_id?: string | null }>();

    if (action === "portal") {
      if (!profile?.stripe_customer_id) {
        return billingStartResponse();
      }

      const stripe = getStripeClient();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${request.nextUrl.origin}/dashboard/author/settings?section=billing`,
      });
      return { url: portalSession.url };
    }

    if (!profile?.stripe_subscription_id) {
      throw new AuthorUiNotFoundError("No active subscription found");
    }

    const stripe = getStripeClient();
    const cancelAtPeriodEnd = action === "cancel";
    const subscription = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });
    const currentPeriodEnd = readStripeTimestamp(subscription, "current_period_end");

    await supabase
      .from("profiles")
      .update({
        subscription_cancelled: cancelAtPeriodEnd,
        subscription_renews_at: cancelAtPeriodEnd ? null : currentPeriodEnd,
        subscription_ends_at: currentPeriodEnd,
        stripe_subscription_status: subscription.status,
        subscription_status: subscription.status,
      })
      .eq("id", userId);

    return {
      ok: true,
      action,
      cancel_at_period_end: subscription.cancel_at_period_end,
      status: subscription.status,
      current_period_end: currentPeriodEnd,
    };
  });
}

function getDaysRemaining(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return null;
  const diff = timestamp - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function readStripeTimestamp(value: unknown, key: string): string | null {
  const timestamp = (value as Record<string, unknown>)?.[key];
  return typeof timestamp === "number" ? new Date(timestamp * 1000).toISOString() : null;
}
