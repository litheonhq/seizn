/**
 * Stripe Configuration
 *
 * Maps Stripe price IDs to plan names and provides utility functions
 * for plan management.
 */

// Plan types available in Seizn
export type PlanName = "free" | "starter" | "plus" | "pro" | "enterprise";

// Stripe price ID to plan name mapping
// Update these IDs from your Stripe dashboard
export const STRIPE_PLAN_PRICES: Record<string, PlanName> = {
  // Monthly plans
  // Replace with actual Stripe price IDs (format: price_xxx)
  price_starter_monthly: "starter",
  price_plus_monthly: "plus",
  price_pro_monthly: "pro",
  price_enterprise_monthly: "enterprise",

  // Yearly plans
  price_starter_yearly: "starter",
  price_plus_yearly: "plus",
  price_pro_yearly: "pro",
  price_enterprise_yearly: "enterprise",
};

// Reverse mapping: plan name to default price ID (monthly)
export const PLAN_TO_STRIPE_PRICE: Record<PlanName, string | null> = {
  free: null,
  starter: "price_starter_monthly",
  plus: "price_plus_monthly",
  pro: "price_pro_monthly",
  enterprise: "price_enterprise_monthly",
};

/**
 * Get plan name from Stripe price ID
 */
export function getPlanFromStripePriceId(priceId: string): PlanName | null {
  return STRIPE_PLAN_PRICES[priceId] || null;
}

/**
 * Get default price ID for a plan
 */
export function getStripePriceIdFromPlan(plan: PlanName): string | null {
  return PLAN_TO_STRIPE_PRICE[plan];
}

/**
 * Check if a price ID is valid
 */
export function isValidStripePriceId(priceId: string): boolean {
  return priceId in STRIPE_PLAN_PRICES;
}

/**
 * Get all price IDs for a specific plan
 */
export function getStripePriceIdsForPlan(plan: PlanName): string[] {
  return Object.entries(STRIPE_PLAN_PRICES)
    .filter(([, planName]) => planName === plan)
    .map(([priceId]) => priceId);
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
    "starter",
    "plus",
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
