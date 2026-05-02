/**
 * Stripe billing configuration for the Author launch v7 price lock.
 *
 * Public UI should use AUTHOR_BILLING_TIERS for display only. Checkout routes
 * resolve Stripe price IDs server-side from env so clients never choose raw
 * price IDs directly.
 */

export type LegacyPlanName = 'free' | 'starter' | 'plus';
export type AuthorBillingTier = 'indie' | 'pro' | 'studio' | 'enterprise';
export type PlanName = LegacyPlanName | AuthorBillingTier;
export type BillingCadence = 'monthly' | 'yearly';

export interface AuthorBillingTierConfig {
  id: AuthorBillingTier;
  label: string;
  productId: string;
  monthlyUsd: number;
  yearlyUsd: number;
  tokenCapMonth: number | null;
  envPrefix: string;
  recommended?: boolean;
  byokRequired?: boolean;
}

export const AUTHOR_PRICE_LOCK_VERSION = 'v7';
export const BYOK_COUPON_ID = 'SEIZN_BYOK_50';
export const AUTHOR_TRIAL_DAYS = 30;

export const AUTHOR_BILLING_TIERS: Record<AuthorBillingTier, AuthorBillingTierConfig> = {
  indie: {
    id: 'indie',
    label: 'Indie',
    productId: 'prod_UNGacXMozktNgE',
    monthlyUsd: 39,
    yearlyUsd: 397.8,
    tokenCapMonth: 1_000_000,
    envPrefix: 'STRIPE_PRICE_ID_INDIE',
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    productId: 'prod_UNGajiXXpdiSYR',
    monthlyUsd: 149,
    yearlyUsd: 1519.8,
    tokenCapMonth: 5_000_000,
    envPrefix: 'STRIPE_PRICE_ID_PRO',
    recommended: true,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    productId: 'prod_UNGa1KL7DhxWGw',
    monthlyUsd: 499,
    yearlyUsd: 5089.8,
    tokenCapMonth: 20_000_000,
    envPrefix: 'STRIPE_PRICE_ID_STUDIO',
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    productId: 'prod_UNGaW9bFkuycVQ',
    monthlyUsd: 2500,
    yearlyUsd: 30000,
    tokenCapMonth: null,
    envPrefix: 'STRIPE_PRICE_ID_ENTERPRISE',
    byokRequired: true,
  },
};

const AUTHOR_TIER_ORDER: PlanName[] = [
  'free',
  'starter',
  'plus',
  'indie',
  'pro',
  'studio',
  'enterprise',
];

export function isAuthorBillingTier(value: unknown): value is AuthorBillingTier {
  return (
    value === 'indie' ||
    value === 'pro' ||
    value === 'studio' ||
    value === 'enterprise'
  );
}

export function isBillingCadence(value: unknown): value is BillingCadence {
  return value === 'monthly' || value === 'yearly';
}

export function getAuthorTierConfig(tier: AuthorBillingTier): AuthorBillingTierConfig {
  return AUTHOR_BILLING_TIERS[tier];
}

export function getAuthorTokenCap(plan: string | null | undefined): number | null {
  if (!isAuthorBillingTier(plan)) {
    return null;
  }
  return AUTHOR_BILLING_TIERS[plan].tokenCapMonth;
}

export function getAuthorStripePriceId(
  tier: AuthorBillingTier,
  cadence: BillingCadence,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const prefix = AUTHOR_BILLING_TIERS[tier].envPrefix;
  const suffix = cadence === 'monthly' ? 'MONTHLY' : 'YEARLY';
  return readEnv(env, [
    `${prefix}_${suffix}`,
    `${prefix}_${cadence.toUpperCase()}`,
    `${prefix}_${suffix === 'MONTHLY' ? 'MO' : 'YR'}`,
  ]);
}

export function getAuthorTierFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env
): AuthorBillingTier | null {
  for (const tier of Object.keys(AUTHOR_BILLING_TIERS) as AuthorBillingTier[]) {
    for (const cadence of ['monthly', 'yearly'] as const) {
      if (getAuthorStripePriceId(tier, cadence, env) === priceId) {
        return tier;
      }
    }
  }
  return null;
}

export function getBillingCadenceFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env
): BillingCadence | null {
  for (const tier of Object.keys(AUTHOR_BILLING_TIERS) as AuthorBillingTier[]) {
    for (const cadence of ['monthly', 'yearly'] as const) {
      if (getAuthorStripePriceId(tier, cadence, env) === priceId) {
        return cadence;
      }
    }
  }
  return null;
}

export function getPlanFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env
): PlanName | null {
  return getAuthorTierFromStripePriceId(priceId, env);
}

export function getStripePriceIdFromPlan(
  plan: PlanName,
  cadence: BillingCadence = 'monthly',
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return isAuthorBillingTier(plan)
    ? getAuthorStripePriceId(plan, cadence, env)
    : null;
}

export function isValidStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return getAuthorTierFromStripePriceId(priceId, env) !== null;
}

export function getStripePriceIdsForPlan(
  plan: PlanName,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (!isAuthorBillingTier(plan)) return [];
  return (['monthly', 'yearly'] as const)
    .map((cadence) => getAuthorStripePriceId(plan, cadence, env))
    .filter((priceId): priceId is string => Boolean(priceId));
}

export function isStripePlanUpgrade(
  currentPlan: PlanName,
  newPlan: PlanName
): boolean {
  return AUTHOR_TIER_ORDER.indexOf(newPlan) > AUTHOR_TIER_ORDER.indexOf(currentPlan);
}

export type StripeSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'incomplete'
  | 'incomplete_expired'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export function mapStripeSubscriptionStatus(
  stripeStatus: StripeSubscriptionStatus | string | undefined
): 'active' | 'cancelled' | 'paused' | 'past_due' | 'incomplete' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'paused':
      return 'paused';
    case 'canceled':
      return 'cancelled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    default:
      return 'active';
  }
}

function readEnv(env: NodeJS.ProcessEnv, names: string[]): string | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}
