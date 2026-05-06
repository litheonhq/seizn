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

export const STRIPE_PLAN_PRICES: Record<string, AuthorBillingTier> = {
  STRIPE_PRICE_ID_INDIE_MONTHLY: 'indie',
  STRIPE_PRICE_ID_STUDIO_MONTHLY: 'studio',
  STRIPE_PRICE_ID_PRO_MONTHLY: 'pro',
  STRIPE_PRICE_ID_ENTERPRISE_MONTHLY: 'enterprise',
  STRIPE_PRICE_ID_INDIE_YEARLY: 'indie',
  STRIPE_PRICE_ID_STUDIO_YEARLY: 'studio',
  STRIPE_PRICE_ID_PRO_YEARLY: 'pro',
  STRIPE_PRICE_ID_ENTERPRISE_YEARLY: 'enterprise',
};

export const PLAN_TO_STRIPE_PRICE: Record<PlanName, string | null> = {
  free: null,
  starter: 'STRIPE_PRICE_ID_INDIE_MONTHLY',
  plus: 'STRIPE_PRICE_ID_STUDIO_MONTHLY',
  indie: 'STRIPE_PRICE_ID_INDIE_MONTHLY',
  pro: 'STRIPE_PRICE_ID_PRO_MONTHLY',
  studio: 'STRIPE_PRICE_ID_STUDIO_MONTHLY',
  enterprise: 'STRIPE_PRICE_ID_ENTERPRISE_MONTHLY',
};

export const PLAN_MONTHLY_USD_CENTS: Record<PlanName, number> = {
  free: 0,
  starter: 3900,
  plus: 29900,
  indie: 3900,
  pro: 99900,
  studio: 29900,
  enterprise: 250000,
};

export const PLAN_YEARLY_USD_CENTS: Record<PlanName, number> = {
  free: 0,
  starter: Math.round(3900 * 12 * 0.85),
  plus: Math.round(29900 * 12 * 0.85),
  indie: Math.round(3900 * 12 * 0.85),
  pro: Math.round(99900 * 12 * 0.75),
  studio: Math.round(29900 * 12 * 0.85),
  enterprise: 0,
};

export function migrateLegacyPlanName(legacy: LegacyPlanName | PlanName): PlanName {
  if (legacy === 'starter') return 'indie';
  if (legacy === 'plus') return 'studio';
  return legacy;
}

export function resolvePlanFromPriceId(priceId: string): PlanName | null {
  return getAuthorTierFromStripePriceId(priceId);
}

/**
 * Collect every legacy v7 Stripe price ID configured for the author tiers,
 * resolved against the supplied env. Counterpart to
 * `collectV8Track2PriceIds` in v8-products.ts; the two sets must stay
 * disjoint so the webhook dispatcher's "v8 short-circuits v7" branch
 * doesn't accidentally swallow legitimate v7 events.
 */
export function collectLegacyAuthorPriceIds(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const out = new Set<string>();
  for (const envName of Object.keys(STRIPE_PLAN_PRICES)) {
    const id = env[envName]?.trim();
    if (id && !id.startsWith('price_TODO')) out.add(id);
  }
  return out;
}

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
  const migratedPlan = migrateLegacyPlanName(plan);
  return isAuthorBillingTier(migratedPlan)
    ? getAuthorStripePriceId(migratedPlan, cadence, env)
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
  const migratedPlan = migrateLegacyPlanName(plan);
  if (!isAuthorBillingTier(migratedPlan)) return [];
  return (['monthly', 'yearly'] as const)
    .map((cadence) => getAuthorStripePriceId(migratedPlan, cadence, env))
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
