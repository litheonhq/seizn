import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getAuthorByokStatus } from "@/lib/author/llm";
import { createServerClient } from "@/lib/supabase";
import {
  AUTHOR_PRICE_LOCK_VERSION,
  AUTHOR_TRIAL_DAYS,
  BYOK_COUPON_ID,
  getAuthorStripePriceId,
  getAuthorTierFromStripePriceId,
  getBillingCadenceFromStripePriceId,
  isAuthorBillingTier,
  isBillingCadence,
  mapStripeSubscriptionStatus,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";

interface CheckoutRequestBody {
  priceId?: unknown;
  tier?: unknown;
  cadence?: unknown;
  successUrl?: unknown;
  cancelUrl?: unknown;
}

interface CheckoutSelection {
  tier: AuthorBillingTier;
  cadence: BillingCadence;
}

interface CheckoutBillingProfile {
  plan?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_subscription_status?: string | null;
  subscription_status?: string | null;
  stripe_price_id?: string | null;
}

interface CheckoutCustomerState {
  customerId: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
}

interface StripeSubscriptionLike {
  id?: string | null;
  status?: string | null;
  items?: {
    data?: Array<{
      price?: {
        id?: string | null;
      } | null;
    }> | null;
  } | null;
}

interface LiveSubscriptionState {
  subscriptionId: string;
  subscriptionStatus: string;
  priceId: string | null;
}

const CHECKOUT_ALLOWED_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "incomplete",
  "incomplete_expired",
]);

function resolveSameOriginUrl(
  value: unknown,
  origin: string,
  fallbackPath: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${origin}${fallbackPath}`;
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) {
      return `${origin}${fallbackPath}`;
    }
    return parsed.toString();
  } catch {
    return `${origin}${fallbackPath}`;
  }
}

function resolveCheckoutSelection(body: CheckoutRequestBody): CheckoutSelection | null {
  if (typeof body.priceId === "string") {
    const tier = getAuthorTierFromStripePriceId(body.priceId);
    const cadence = getBillingCadenceFromStripePriceId(body.priceId);
    return tier && cadence ? { tier, cadence } : null;
  }

  if (isAuthorBillingTier(body.tier) && isBillingCadence(body.cadence)) {
    return { tier: body.tier, cadence: body.cadence };
  }

  return null;
}

async function getOrCreateCheckoutCustomer(input: {
  userId: string;
  email?: string | null;
  stripe: ReturnType<typeof getStripeClient>;
}): Promise<CheckoutCustomerState> {
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,subscription_status,stripe_price_id")
    .eq("id", input.userId)
    .single<CheckoutBillingProfile>();

  if (profile?.stripe_customer_id) {
    const liveSubscription = await findLiveCheckoutSubscription(
      input.stripe,
      profile.stripe_customer_id
    );

    if (liveSubscription) {
      await supabase
        .from("profiles")
        .update({
          stripe_subscription_id: liveSubscription.subscriptionId,
          stripe_subscription_status: liveSubscription.subscriptionStatus,
          subscription_status: mapStripeSubscriptionStatus(liveSubscription.subscriptionStatus),
          ...(liveSubscription.priceId ? { stripe_price_id: liveSubscription.priceId } : {}),
        })
        .eq("id", input.userId);

      return {
        customerId: profile.stripe_customer_id,
        subscriptionId: liveSubscription.subscriptionId,
        subscriptionStatus: liveSubscription.subscriptionStatus,
      };
    }

    await clearStaleCheckoutSubscriptionProfile({
      supabase,
      userId: input.userId,
      profile,
    });

    return {
      customerId: profile.stripe_customer_id,
      subscriptionId: null,
      subscriptionStatus: null,
    };
  }

  const customer = await input.stripe.customers.create({
    email: input.email || undefined,
    metadata: {
      user_id: input.userId,
      source: "author_launch_v7",
    },
  });

  await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", input.userId);

  return {
    customerId: customer.id,
    subscriptionId: null,
    subscriptionStatus: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const { priceId, tier, cadence, successUrl, cancelUrl } = (await request.json()) as CheckoutRequestBody;
    const selection = resolveCheckoutSelection({ priceId, tier, cadence, successUrl, cancelUrl });

    if (!selection) {
      return NextResponse.json({ error: "Invalid author billing tier" }, { status: 400 });
    }

    const resolvedPriceId = getAuthorStripePriceId(selection.tier, selection.cadence);
    if (!resolvedPriceId) {
      return NextResponse.json(
        { error: "Stripe price is not configured for this tier" },
        { status: 500 }
      );
    }

    const origin = request.nextUrl.origin;
    const stripe = getStripeClient();
    const customerState = await getOrCreateCheckoutCustomer({
      userId: session.user.id,
      email: session.user.email,
      stripe,
    });
    if (shouldRedirectExistingSubscriberToPortal(
      customerState.subscriptionId,
      customerState.subscriptionStatus
    )) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerState.customerId,
        return_url: `${origin}/dashboard/billing`,
      });
      return NextResponse.json({
        url: portalSession.url,
        destination: "billing_portal",
        reason: "active_subscription",
      });
    }

    const byokStatus = await getAuthorByokStatus(session.user.id);
    const discounts = byokStatus.enabled
      ? [{ coupon: process.env.STRIPE_BYOK_COUPON_ID?.trim() || BYOK_COUPON_ID }]
      : undefined;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "if_required",
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      customer: customerState.customerId,
      allow_promotion_codes: !discounts,
      ...(discounts ? { discounts } : {}),
      subscription_data: {
        trial_period_days: AUTHOR_TRIAL_DAYS,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
        metadata: {
          user_id: session.user.id,
          author_billing_tier: selection.tier,
          billing_cadence: selection.cadence,
          price_lock_version: AUTHOR_PRICE_LOCK_VERSION,
          byok_discount: byokStatus.enabled ? "true" : "false",
        },
      },
      success_url: resolveSameOriginUrl(
        successUrl,
        origin,
        "/dashboard/billing?success=true"
      ),
      cancel_url: resolveSameOriginUrl(cancelUrl, origin, "/pricing"),
      client_reference_id: session.user.id,
      metadata: {
        user_id: session.user.id,
        author_billing_tier: selection.tier,
        billing_cadence: selection.cadence,
        price_lock_version: AUTHOR_PRICE_LOCK_VERSION,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

function shouldRedirectExistingSubscriberToPortal(
  subscriptionId: string | null,
  status: string | null
): boolean {
  if (!subscriptionId) {
    return false;
  }

  const normalized = status?.toLowerCase() ?? "";
  return !CHECKOUT_ALLOWED_SUBSCRIPTION_STATUSES.has(normalized);
}

async function findLiveCheckoutSubscription(
  stripe: ReturnType<typeof getStripeClient>,
  customerId: string
): Promise<LiveSubscriptionState | null> {
  let startingAfter: string | undefined;

  while (true) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    const live = subscriptions.data
      .map(normalizeStripeSubscription)
      .find((subscription): subscription is LiveSubscriptionState => {
        if (!subscription?.subscriptionId) return false;
        return !CHECKOUT_ALLOWED_SUBSCRIPTION_STATUSES.has(subscription.subscriptionStatus.toLowerCase());
      });

    if (live) return live;
    if (!subscriptions.has_more) return null;

    const lastSubscriptionId = subscriptions.data[subscriptions.data.length - 1]?.id;
    if (!lastSubscriptionId) return null;
    startingAfter = lastSubscriptionId;
  }
}

function normalizeStripeSubscription(subscription: StripeSubscriptionLike): LiveSubscriptionState | null {
  const subscriptionId = typeof subscription.id === "string" ? subscription.id : null;
  const subscriptionStatus = typeof subscription.status === "string" ? subscription.status : null;
  if (!subscriptionId || !subscriptionStatus) return null;

  const priceId = subscription.items?.data?.find((item) => typeof item.price?.id === "string")
    ?.price?.id ?? null;

  return {
    subscriptionId,
    subscriptionStatus,
    priceId,
  };
}

async function clearStaleCheckoutSubscriptionProfile(input: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  profile: CheckoutBillingProfile;
}): Promise<void> {
  if (!hasLocalCheckoutSubscriptionState(input.profile)) {
    return;
  }

  await input.supabase
    .from("profiles")
    .update({
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      subscription_status: "inactive",
      stripe_price_id: null,
      ...(isAuthorBillingTier(input.profile.plan) ? { plan: "free" } : {}),
    })
    .eq("id", input.userId);
}

function hasLocalCheckoutSubscriptionState(profile: CheckoutBillingProfile): boolean {
  if (profile.stripe_subscription_id || profile.stripe_price_id) {
    return true;
  }

  const status = (profile.subscription_status ?? profile.stripe_subscription_status ?? "").toLowerCase();
  return Boolean(status && status !== "inactive" && status !== "free");
}
