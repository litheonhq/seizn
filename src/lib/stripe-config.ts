/**
 * Stripe Configuration
 *
 * Maps Stripe price IDs to plan names and provides utility functions
 * for plan management.
 */

// Plan types available in Seizn (2026-04 5-tier refactor)
// Legacy names kept as aliases for backwards-compat with old subscription records.
export type PlanName = "free" | "indie" | "studio" | "pro" | "enterprise";
export type LegacyPlanName = "starter" | "plus";

// Stripe price IDs → plan name. Real IDs are provisioned via scripts/stripe/provision-plans.py
// and pulled from env at deploy time (STRIPE_PRICE_ID_<TIER>_<CADENCE>).
// The keys below are the env-var names used by the price-lookup helper.
export const STRIPE_PLAN_PRICES: Record<string, PlanName> = {
  // Monthly
  STRIPE_PRICE_ID_INDIE_MONTHLY: "indie",
  STRIPE_PRICE_ID_STUDIO_MONTHLY: "studio",
  STRIPE_PRICE_ID_PRO_MONTHLY: "pro",
  STRIPE_PRICE_ID_ENTERPRISE_MONTHLY: "enterprise",

  // Yearly
  STRIPE_PRICE_ID_INDIE_YEARLY: "indie",
  STRIPE_PRICE_ID_STUDIO_YEARLY: "studio",
  STRIPE_PRICE_ID_PRO_YEARLY: "pro",
  STRIPE_PRICE_ID_ENTERPRISE_YEARLY: "enterprise",
};

// Reverse mapping: plan name → default monthly env-var key
export const PLAN_TO_STRIPE_PRICE: Record<PlanName, string | null> = {
  free: null,
  indie: "STRIPE_PRICE_ID_INDIE_MONTHLY",
  studio: "STRIPE_PRICE_ID_STUDIO_MONTHLY",
  pro: "STRIPE_PRICE_ID_PRO_MONTHLY",
  enterprise: "STRIPE_PRICE_ID_ENTERPRISE_MONTHLY",
};

// Resolve a PlanName from an actual Stripe price id by looking up env at runtime.
// Used by the webhook handler — see src/app/api/webhooks/stripe/route.ts.
export function resolvePlanFromPriceId(priceId: string): PlanName | null {
  if (!priceId) return null;
  for (const [envKey, planName] of Object.entries(STRIPE_PLAN_PRICES)) {
    if (process.env[envKey] === priceId) return planName;
  }
  return null;
}

// Public plan price in USD cents for display/invoice reconciliation.
export const PLAN_MONTHLY_USD_CENTS: Record<PlanName, number> = {
  free: 0,
  indie: 3900,
  studio: 29900,
  pro: 99900,
  enterprise: 250000, // "from $2,500"
};

// Yearly lists at 15% discount on Indie/Studio/Pro.
export const PLAN_YEARLY_USD_CENTS: Record<PlanName, number> = {
  free: 0,
  indie: Math.round(3900 * 12 * 0.85),    // $39 * 12 * 0.85 = $397.80
  studio: Math.round(29900 * 12 * 0.85),   // $299 * 12 * 0.85 = $3,049.80
  pro: Math.round(99900 * 12 * 0.85),      // $999 * 12 * 0.85 = $10,189.80
  enterprise: 0, // Enterprise is always annual + custom; billing handled via contract
};

// Legacy → new mapping for migrating existing subscription records.
export function migrateLegacyPlanName(legacy: LegacyPlanName | PlanName): PlanName {
  if (legacy === "starter") return "indie";
  if (legacy === "plus") return "studio";
  return legacy;
}

/**
 * Get plan name from Stripe price ID — resolves via env-var lookup since the
 * 5-tier refactor moved price-id → plan mapping into runtime env.
 */
export function getPlanFromStripePriceId(priceId: string): PlanName | null {
  return resolvePlanFromPriceId(priceId);
}

/**
 * Get default monthly Stripe price ID for a plan (from env).
 */
export function getStripePriceIdFromPlan(plan: PlanName): string | null {
  const envKey = PLAN_TO_STRIPE_PRICE[plan];
  if (!envKey) return null;
  return process.env[envKey] || null;
}

/**
 * Check if a price ID is a valid Seizn plan price (present in env).
 */
export function isValidStripePriceId(priceId: string): boolean {
  if (!priceId) return false;
  return resolvePlanFromPriceId(priceId) !== null;
}

/**
 * Get all Stripe price IDs for a specific plan (monthly + yearly) from env.
 */
export function getStripePriceIdsForPlan(plan: PlanName): string[] {
  const ids: string[] = [];
  for (const [envKey, planName] of Object.entries(STRIPE_PLAN_PRICES)) {
    if (planName === plan) {
      const priceId = process.env[envKey];
      if (priceId) ids.push(priceId);
    }
  }
  return ids;
}

/**
 * Determine if a plan change is an upgrade or downgrade
 */
export function isStripePlanUpgrade(
  currentPlan: PlanName,
  newPlan: PlanName
): boolean {
  const planOrder: PlanName[] = [
    "free",
    "indie",
    "studio",
    "pro",
    "enterprise",
  ];
  return planOrder.indexOf(newPlan) > planOrder.indexOf(currentPlan);
}

/**
 * Stripe subscription status types
 */
export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "incomplete"
  | "incomplete_expired"
  | "canceled"
  | "unpaid"
  | "paused";

/**
 * Map Stripe subscription status to internal status
 */
export function mapStripeSubscriptionStatus(
  stripeStatus: StripeSubscriptionStatus
): "active" | "cancelled" | "paused" | "past_due" | "incomplete" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "paused":
      return "paused";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "active";
  }
}
