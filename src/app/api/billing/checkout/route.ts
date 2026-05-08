import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getAuthorByokStatus } from "@/lib/author/llm";
import { CHECKOUT_LEGAL_VERSIONS } from "@/lib/checkout-copy";
import { createServerClient } from "@/lib/supabase";
import {
  AUTHOR_PRICE_LOCK_VERSION,
  BYOK_COUPON_ID,
  getAuthorActivePriceId,
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
  legalAccepted?: unknown;
  legalVersions?: unknown;
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

interface StripeCheckoutSessionLike {
  id?: string | null;
  url?: string | null;
  metadata?: Record<string, string | null> | null;
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

function hasCurrentLegalAcceptance(body: CheckoutRequestBody): boolean {
  if (body.legalAccepted !== true) {
    return false;
  }

  if (!body.legalVersions || typeof body.legalVersions !== "object") {
    return false;
  }

  const versions = body.legalVersions as Record<string, unknown>;
  return versions.terms === CHECKOUT_LEGAL_VERSIONS.terms
    && versions.privacy === CHECKOUT_LEGAL_VERSIONS.privacy;
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
  }, {
    idempotencyKey: createCheckoutCustomerIdempotencyKey(input.userId),
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

    const body = (await request.json()) as CheckoutRequestBody;
    const { successUrl, cancelUrl } = body;
    const selection = resolveCheckoutSelection(body);

    if (!selection) {
      return NextResponse.json({ error: "Invalid author billing tier" }, { status: 400 });
    }

    if (!hasCurrentLegalAcceptance(body)) {
      return NextResponse.json(
        { error: "Legal agreement is required before checkout" },
        { status: 400 }
      );
    }

    // v9: BYOK is now its own price column. Pick the column from the BYOK
    // toggle the user already saved (resolved below into `byokStatus.enabled`).
    // We have to query that here so we know which column to look up.
    const byokColumnLookup = await getAuthorByokStatus(session.user.id);
    const selectedColumn = byokColumnLookup.enabled ? 'byok' : 'managed';
    const resolvedPriceId = getAuthorActivePriceId(
      selection.tier,
      selectedColumn,
      selection.cadence,
    );
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

    const byokStatus = byokColumnLookup;
    // v9 retires the BYOK coupon — BYOK is its own price column. The legacy
    // STRIPE_BYOK_COUPON_ID env still applies a discount when set, but new
    // installs leave it unset so no coupon is attached.
    const legacyByokCoupon = process.env.STRIPE_BYOK_COUPON_ID?.trim() || BYOK_COUPON_ID;
    const discounts =
      byokStatus.enabled && legacyByokCoupon
        ? [{ coupon: legacyByokCoupon }]
        : undefined;
    const resolvedSuccessUrl = resolveSameOriginUrl(
      successUrl,
      origin,
      "/dashboard/billing?success=true"
    );
    const resolvedCancelUrl = resolveSameOriginUrl(cancelUrl, origin, "/pricing");
    const checkoutMetadata = createCheckoutMetadata({
      userId: session.user.id,
      tier: selection.tier,
      cadence: selection.cadence,
    });
    const reusableCheckoutSession = await findReusableCheckoutSession(stripe, {
      customerId: customerState.customerId,
      metadata: checkoutMetadata,
    });

    if (reusableCheckoutSession) {
      return NextResponse.json({
        url: reusableCheckoutSession.url,
        destination: "checkout_session",
        reason: "open_checkout_session",
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "if_required",
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      customer: customerState.customerId,
      allow_promotion_codes: !discounts,
      ...(discounts ? { discounts } : {}),
      // v9 has no built-in Stripe trial. Free tier (BYOK) is the trial path.
      subscription_data: {
        metadata: checkoutMetadata,
      },
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
      client_reference_id: session.user.id,
      metadata: checkoutMetadata,
    }, {
      idempotencyKey: createCheckoutIdempotencyKey({
        userId: session.user.id,
        tier: selection.tier,
        cadence: selection.cadence,
        priceId: resolvedPriceId,
        byokEnabled: byokStatus.enabled,
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
      }),
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

async function findReusableCheckoutSession(
  stripe: ReturnType<typeof getStripeClient>,
  input: {
    customerId: string;
    metadata: Record<string, string>;
  }
): Promise<{ id: string; url: string } | null> {
  const sessions = await stripe.checkout.sessions.list({
    customer: input.customerId,
    status: "open",
    limit: 10,
  });

  for (const session of sessions.data.map(normalizeStripeCheckoutSession)) {
    if (!session || !hasMatchingCheckoutMetadata(session.metadata, input.metadata)) {
      continue;
    }
    return { id: session.id, url: session.url };
  }

  return null;
}

function normalizeStripeCheckoutSession(
  session: StripeCheckoutSessionLike
): { id: string; url: string; metadata: Record<string, string | null> } | null {
  const id = typeof session.id === "string" ? session.id : null;
  const url = typeof session.url === "string" ? session.url : null;
  if (!id || !url) return null;

  return {
    id,
    url,
    metadata: session.metadata ?? {},
  };
}

function hasMatchingCheckoutMetadata(
  actual: Record<string, string | null>,
  expected: Record<string, string>
): boolean {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
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

function createCheckoutMetadata(input: {
  userId: string;
  tier: AuthorBillingTier;
  cadence: BillingCadence;
}): Record<string, string> {
  // Round 5 audit fix: dropped legacy `byok_discount` metadata key. v9
  // encodes BYOK pricing as separate Charter price IDs, so the field
  // was never read back. Stripe-side metadata can only be removed
  // forward-compat — old sessions still carry it but no code reads it.
  return {
    user_id: input.userId,
    author_billing_tier: input.tier,
    billing_cadence: input.cadence,
    price_lock_version: AUTHOR_PRICE_LOCK_VERSION,
    legal_terms_version: CHECKOUT_LEGAL_VERSIONS.terms,
    legal_privacy_version: CHECKOUT_LEGAL_VERSIONS.privacy,
    legal_accepted: "true",
  };
}

function createCheckoutCustomerIdempotencyKey(userId: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      userId,
      source: "author_launch_v7",
    }))
    .digest("hex")
    .slice(0, 40);

  return `author-customer-${AUTHOR_PRICE_LOCK_VERSION}-${digest}`;
}

function createCheckoutIdempotencyKey(input: {
  userId: string;
  tier: AuthorBillingTier;
  cadence: BillingCadence;
  priceId: string;
  byokEnabled: boolean;
  successUrl: string;
  cancelUrl: string;
}): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      ...input,
      priceLockVersion: AUTHOR_PRICE_LOCK_VERSION,
      legalTermsVersion: CHECKOUT_LEGAL_VERSIONS.terms,
      legalPrivacyVersion: CHECKOUT_LEGAL_VERSIONS.privacy,
    }))
    .digest("hex")
    .slice(0, 40);

  return `author-checkout-${AUTHOR_PRICE_LOCK_VERSION}-${digest}`;
}
