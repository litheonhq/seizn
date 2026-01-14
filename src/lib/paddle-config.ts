/**
 * Paddle Configuration
 *
 * Maps Paddle price IDs to plan names and provides utility functions
 * for plan management.
 */

// Plan types available in Seizn
export type PlanName = "free" | "starter" | "plus" | "pro" | "enterprise";

// Paddle price ID to plan name mapping
// Update these IDs from your Paddle dashboard
export const PADDLE_PLAN_PRICES: Record<string, PlanName> = {
  // Monthly plans
  // Replace with actual Paddle price IDs
  pri_starter_monthly: "starter",
  pri_plus_monthly: "plus",
  pri_pro_monthly: "pro",
  pri_enterprise_monthly: "enterprise",

  // Yearly plans
  pri_starter_yearly: "starter",
  pri_plus_yearly: "plus",
  pri_pro_yearly: "pro",
  pri_enterprise_yearly: "enterprise",
};

// Reverse mapping: plan name to default price ID (monthly)
export const PLAN_TO_PRICE: Record<PlanName, string | null> = {
  free: null,
  starter: "pri_starter_monthly",
  plus: "pri_plus_monthly",
  pro: "pri_pro_monthly",
  enterprise: "pri_enterprise_monthly",
};

/**
 * Get plan name from Paddle price ID
 */
export function getPlanFromPriceId(priceId: string): PlanName | null {
  return PADDLE_PLAN_PRICES[priceId] || null;
}

/**
 * Get default price ID for a plan
 */
export function getPriceIdFromPlan(plan: PlanName): string | null {
  return PLAN_TO_PRICE[plan];
}

/**
 * Check if a price ID is valid
 */
export function isValidPriceId(priceId: string): boolean {
  return priceId in PADDLE_PLAN_PRICES;
}

/**
 * Get all price IDs for a specific plan
 */
export function getPriceIdsForPlan(plan: PlanName): string[] {
  return Object.entries(PADDLE_PLAN_PRICES)
    .filter(([, planName]) => planName === plan)
    .map(([priceId]) => priceId);
}

/**
 * Determine if a plan change is an upgrade or downgrade
 */
export function isPlanUpgrade(
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
 * Paddle subscription status types
 */
export type PaddleSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled";

/**
 * Map Paddle subscription status to internal status
 */
export function mapSubscriptionStatus(
  paddleStatus: string
): "active" | "cancelled" | "paused" | "past_due" {
  switch (paddleStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "canceled":
      return "cancelled";
    default:
      return "active";
  }
}
