/**
 * Author Memory v3 — v9 Stripe billing catalog (locked 2026-05-07).
 *
 * Two-column model: Managed (we run the LLM) and BYOK (user runs the LLM).
 * Two cadences: monthly and annual. Two Charter states: charter (locked
 * until 2027-05-01) and regular. Free tier has no Stripe price ID.
 *
 * Charter mechanics: any subscription whose first invoice posts before
 * CHARTER_WINDOW_END_AT pays the Charter price. Stripe Schedule objects
 * swap to the regular price ID for the first billing cycle on or after
 * the cutoff. See docs in stripe-checkout for the Schedule wiring.
 *
 * Public UI imports AUTHOR_BILLING_TIERS for display copy. Checkout routes
 * resolve Stripe price IDs server-side from env so clients never select
 * raw price IDs directly.
 */

export type AuthorBillingTier = 'indie' | 'pro' | 'studio' | 'enterprise';
export type BillingColumn = 'managed' | 'byok';
export type BillingCadence = 'monthly' | 'yearly';
export type CharterStatus = 'charter' | 'regular';

/** @deprecated v9 has no legacy plan names — kept only so older imports compile. */
export type LegacyPlanName = 'free' | 'starter' | 'plus';
export type PlanName = LegacyPlanName | AuthorBillingTier;

export const AUTHOR_PRICE_LOCK_VERSION = 'v9';

/**
 * Charter launch window cutoff. Subscriptions whose first invoice posts at
 * or after this instant pay the regular (non-Charter) price.
 */
export const CHARTER_WINDOW_END_AT = '2027-05-01T00:00:00Z';

/** @deprecated v9 has no built-in trial. Kept at 0 so older callers compile. */
export const AUTHOR_TRIAL_DAYS = 0;

/**
 * @deprecated v9 has no BYOK coupon — BYOK is a separate price column.
 * Kept as null so older byok-discount.ts callers can no-op cleanly.
 */
export const BYOK_COUPON_ID: string | null = null;

export interface AuthorBillingTierConfig {
  id: AuthorBillingTier;
  label: string;
  /** Monthly Managed regular price (USD). */
  managedMonthlyUsd: number;
  /** Annual Managed regular price (USD, 12 months). */
  managedAnnualUsd: number;
  /** Monthly Managed Charter price. null if tier doesn't offer Managed. */
  managedMonthlyCharterUsd: number | null;
  /** Annual Managed Charter price. null if tier doesn't offer Managed. */
  managedAnnualCharterUsd: number | null;
  /** Monthly BYOK regular price. null if tier is BYOK-disallowed (none currently). */
  byokMonthlyUsd: number | null;
  byokAnnualUsd: number | null;
  byokMonthlyCharterUsd: number | null;
  byokAnnualCharterUsd: number | null;
  /** Monthly token cap for Managed tier. null = unlimited (Enterprise). */
  tokenCapMonth: number | null;
  /** Env var prefix for Stripe price IDs. */
  envPrefix: string;
  /** Show "recommended" badge on pricing page. */
  recommended?: boolean;
  /** Tier requires BYOK regardless of column choice. */
  byokOnly?: boolean;
  /** @deprecated v7 compat — alias for managedMonthlyUsd. */
  monthlyUsd: number;
  /** @deprecated v7 compat — alias for managedAnnualUsd. */
  yearlyUsd: number;
  /** @deprecated v7 compat — alias for byokOnly. */
  byokRequired?: boolean;
}

export const AUTHOR_BILLING_TIERS: Record<AuthorBillingTier, AuthorBillingTierConfig> = {
  indie: {
    id: 'indie',
    label: 'Indie',
    managedMonthlyUsd: 39,
    managedAnnualUsd: 39 * 12,
    managedMonthlyCharterUsd: 29,
    managedAnnualCharterUsd: 324,
    byokMonthlyUsd: 19,
    byokAnnualUsd: 19 * 12,
    byokMonthlyCharterUsd: 11,
    byokAnnualCharterUsd: 114,
    tokenCapMonth: 1_000_000,
    envPrefix: 'STRIPE_PRICE_ID_V9_INDIE',
    monthlyUsd: 39,
    yearlyUsd: 39 * 12,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    managedMonthlyUsd: 149,
    managedAnnualUsd: 149 * 12,
    managedMonthlyCharterUsd: 112,
    managedAnnualCharterUsd: 1250,
    byokMonthlyUsd: 79,
    byokAnnualUsd: 79 * 12,
    byokMonthlyCharterUsd: 47,
    byokAnnualCharterUsd: 474,
    tokenCapMonth: 5_000_000,
    envPrefix: 'STRIPE_PRICE_ID_V9_PRO',
    recommended: true,
    monthlyUsd: 149,
    yearlyUsd: 149 * 12,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    managedMonthlyUsd: 499,
    managedAnnualUsd: 499 * 12,
    managedMonthlyCharterUsd: 374,
    managedAnnualCharterUsd: 4190,
    byokMonthlyUsd: 249,
    byokAnnualUsd: 249 * 12,
    byokMonthlyCharterUsd: 149,
    byokAnnualCharterUsd: 1494,
    tokenCapMonth: 20_000_000,
    envPrefix: 'STRIPE_PRICE_ID_V9_STUDIO',
    monthlyUsd: 499,
    yearlyUsd: 499 * 12,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    managedMonthlyUsd: 2500,
    managedAnnualUsd: 2500 * 12,
    // Charter Monthly: 25% off ($1,875). Charter Annual: 30% off ($21,000)
    // — annual gets the deeper discount per the locked policy "Managed
    // Annual -30%". Earlier draft used $22,500 (25% off) which would
    // under-discount Charter Annual; corrected 2026-05-07 audit.
    managedMonthlyCharterUsd: 1875,
    managedAnnualCharterUsd: 21000,
    byokMonthlyUsd: null,
    byokAnnualUsd: null,
    byokMonthlyCharterUsd: null,
    byokAnnualCharterUsd: null,
    tokenCapMonth: null,
    envPrefix: 'STRIPE_PRICE_ID_V9_ENTERPRISE',
    byokOnly: true,
    monthlyUsd: 2500,
    yearlyUsd: 2500 * 12,
    byokRequired: true,
  },
};

const AUTHOR_TIER_ORDER: AuthorBillingTier[] = ['indie', 'pro', 'studio', 'enterprise'];

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

export function isBillingColumn(value: unknown): value is BillingColumn {
  return value === 'managed' || value === 'byok';
}

export function isCharterStatus(value: unknown): value is CharterStatus {
  return value === 'charter' || value === 'regular';
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

/**
 * Returns the Stripe price ID for a (tier, column, cadence, charter) combo.
 * Looks up env vars in priority order; returns null if no env var is set
 * (the operator hasn't created the Stripe price yet).
 *
 * Env var naming: `${envPrefix}_${COLUMN}_${CADENCE}[_CHARTER]`.
 * Example: STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY_CHARTER
 */
export function getAuthorStripePriceId(
  tier: AuthorBillingTier,
  column: BillingColumn,
  cadence: BillingCadence,
  charter: CharterStatus = 'charter',
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const config = AUTHOR_BILLING_TIERS[tier];

  // byokOnly tiers (Enterprise) are sold under one price column even when
  // the user has both BYOK keys registered. Normalize the column to the
  // tier's actual offering — Managed is the canonical column for Enterprise
  // because Stripe products are registered under the *_MANAGED env prefix.
  const effectiveColumn: BillingColumn = config.byokOnly ? 'managed' : column;

  // Tier doesn't sell BYOK at all (and isn't byokOnly so it's a real BYOK
  // gap, e.g. a future tier with no BYOK price). Return null so callers can
  // surface a "not configured" error rather than mis-routing to Managed.
  if (effectiveColumn === 'byok' && config.byokMonthlyUsd === null) {
    return null;
  }

  const cadenceSuffix = cadence === 'monthly' ? 'MONTHLY' : 'ANNUAL';
  const columnSuffix = effectiveColumn.toUpperCase();
  const charterSuffix = charter === 'charter' ? '_CHARTER' : '';

  return readEnv(env, [
    `${config.envPrefix}_${columnSuffix}_${cadenceSuffix}${charterSuffix}`,
    // Fallback: legacy YEARLY suffix.
    `${config.envPrefix}_${columnSuffix}_${cadence === 'yearly' ? 'YEARLY' : 'MONTHLY'}${charterSuffix}`,
  ]);
}

/**
 * Resolves the *active* price ID for a new subscription based on signup time.
 * Charter price applies if signup is before CHARTER_WINDOW_END_AT.
 */
export function getAuthorActivePriceId(
  tier: AuthorBillingTier,
  column: BillingColumn,
  cadence: BillingCadence,
  signupAt: Date | string = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return getAuthorStripePriceId(tier, column, cadence, resolveCharterStatus(signupAt), env);
}

/**
 * Returns 'charter' when signupAt < CHARTER_WINDOW_END_AT, else 'regular'.
 */
export function resolveCharterStatus(signupAt: Date | string = new Date()): CharterStatus {
  const t = typeof signupAt === 'string' ? Date.parse(signupAt) : signupAt.getTime();
  const cutoff = Date.parse(CHARTER_WINDOW_END_AT);
  return Number.isFinite(t) && t < cutoff ? 'charter' : 'regular';
}

/**
 * Reverse lookup: given a Stripe price ID, return its tier (or null).
 * Searches every (tier, column, cadence, charter) combination.
 */
export function getAuthorTierFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): AuthorBillingTier | null {
  for (const tier of Object.keys(AUTHOR_BILLING_TIERS) as AuthorBillingTier[]) {
    for (const column of ['managed', 'byok'] as const) {
      for (const cadence of ['monthly', 'yearly'] as const) {
        for (const charter of ['charter', 'regular'] as const) {
          if (getAuthorStripePriceId(tier, column, cadence, charter, env) === priceId) {
            return tier;
          }
        }
      }
    }
  }
  return null;
}

/** Reverse lookup: cadence (monthly/yearly) for a given Stripe price ID. */
export function getBillingCadenceFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): BillingCadence | null {
  for (const tier of Object.keys(AUTHOR_BILLING_TIERS) as AuthorBillingTier[]) {
    for (const column of ['managed', 'byok'] as const) {
      for (const cadence of ['monthly', 'yearly'] as const) {
        for (const charter of ['charter', 'regular'] as const) {
          if (getAuthorStripePriceId(tier, column, cadence, charter, env) === priceId) {
            return cadence;
          }
        }
      }
    }
  }
  return null;
}

/** Reverse lookup: column (managed/byok) for a given price ID. */
export function getBillingColumnFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): BillingColumn | null {
  for (const tier of Object.keys(AUTHOR_BILLING_TIERS) as AuthorBillingTier[]) {
    for (const column of ['managed', 'byok'] as const) {
      for (const cadence of ['monthly', 'yearly'] as const) {
        for (const charter of ['charter', 'regular'] as const) {
          if (getAuthorStripePriceId(tier, column, cadence, charter, env) === priceId) {
            return column;
          }
        }
      }
    }
  }
  return null;
}

/** Reverse lookup: charter status for a given price ID. */
export function getCharterStatusFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): CharterStatus | null {
  for (const tier of Object.keys(AUTHOR_BILLING_TIERS) as AuthorBillingTier[]) {
    for (const column of ['managed', 'byok'] as const) {
      for (const cadence of ['monthly', 'yearly'] as const) {
        for (const charter of ['charter', 'regular'] as const) {
          if (getAuthorStripePriceId(tier, column, cadence, charter, env) === priceId) {
            return charter;
          }
        }
      }
    }
  }
  return null;
}

/** All price IDs currently mapped for a tier — used by webhook routing. */
export function getStripePriceIdsForPlan(
  plan: PlanName,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const migrated = migrateLegacyPlanName(plan);
  if (!isAuthorBillingTier(migrated)) return [];
  const out: string[] = [];
  for (const column of ['managed', 'byok'] as const) {
    for (const cadence of ['monthly', 'yearly'] as const) {
      for (const charter of ['charter', 'regular'] as const) {
        const id = getAuthorStripePriceId(migrated, column, cadence, charter, env);
        if (id) out.push(id);
      }
    }
  }
  return out;
}

export function isValidStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getAuthorTierFromStripePriceId(priceId, env) !== null;
}

export function isStripePlanUpgrade(
  currentPlan: PlanName,
  newPlan: PlanName,
): boolean {
  const current = migrateLegacyPlanName(currentPlan);
  const next = migrateLegacyPlanName(newPlan);
  if (!isAuthorBillingTier(current) || !isAuthorBillingTier(next)) return false;
  return AUTHOR_TIER_ORDER.indexOf(next) > AUTHOR_TIER_ORDER.indexOf(current);
}

/** @deprecated v9 has no legacy plan names. Identity function for compatibility. */
export function migrateLegacyPlanName(legacy: LegacyPlanName | PlanName): PlanName {
  if (legacy === 'starter') return 'indie';
  if (legacy === 'plus') return 'studio';
  return legacy;
}

/** @deprecated Use getAuthorTierFromStripePriceId. */
export function resolvePlanFromPriceId(priceId: string): PlanName | null {
  return getAuthorTierFromStripePriceId(priceId);
}

/** @deprecated Use getAuthorTierFromStripePriceId. */
export function getPlanFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): PlanName | null {
  return getAuthorTierFromStripePriceId(priceId, env);
}

/**
 * Display-only price tables, keyed by plan name. Read by /pricing and admin UI.
 * v9 stores prices as USD; PLAN_*_USD_CENTS multiplies by 100.
 */
export const PLAN_MONTHLY_USD_CENTS: Record<PlanName, number> = {
  free: 0,
  starter: 0,
  plus: 0,
  indie: AUTHOR_BILLING_TIERS.indie.managedMonthlyUsd * 100,
  pro: AUTHOR_BILLING_TIERS.pro.managedMonthlyUsd * 100,
  studio: AUTHOR_BILLING_TIERS.studio.managedMonthlyUsd * 100,
  enterprise: AUTHOR_BILLING_TIERS.enterprise.managedMonthlyUsd * 100,
};

export const PLAN_YEARLY_USD_CENTS: Record<PlanName, number> = {
  free: 0,
  starter: 0,
  plus: 0,
  indie: AUTHOR_BILLING_TIERS.indie.managedAnnualUsd * 100,
  pro: AUTHOR_BILLING_TIERS.pro.managedAnnualUsd * 100,
  studio: AUTHOR_BILLING_TIERS.studio.managedAnnualUsd * 100,
  enterprise: AUTHOR_BILLING_TIERS.enterprise.managedAnnualUsd * 100,
};

/**
 * @deprecated v7 plan→price env-key map. Retained as a compatibility shim
 * pointing to v9 Managed monthly env vars; rewrite call sites to use
 * getAuthorActivePriceId(tier, column, cadence) instead.
 */
export const PLAN_TO_STRIPE_PRICE: Record<PlanName, string | null> = {
  free: null,
  starter: 'STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY_CHARTER',
  plus: 'STRIPE_PRICE_ID_V9_STUDIO_MANAGED_MONTHLY_CHARTER',
  indie: 'STRIPE_PRICE_ID_V9_INDIE_MANAGED_MONTHLY_CHARTER',
  pro: 'STRIPE_PRICE_ID_V9_PRO_MANAGED_MONTHLY_CHARTER',
  studio: 'STRIPE_PRICE_ID_V9_STUDIO_MANAGED_MONTHLY_CHARTER',
  enterprise: 'STRIPE_PRICE_ID_V9_ENTERPRISE_MANAGED_MONTHLY_CHARTER',
};

/** @deprecated v7 env-key → tier mapping. Use getAuthorTierFromStripePriceId. */
export const STRIPE_PLAN_PRICES: Record<string, AuthorBillingTier> = {};

/** @deprecated Use getAuthorActivePriceId(tier, column, cadence). */
export function getStripePriceIdFromPlan(
  plan: PlanName,
  cadence: BillingCadence = 'monthly',
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const migrated = migrateLegacyPlanName(plan);
  if (!isAuthorBillingTier(migrated)) return null;
  return getAuthorActivePriceId(migrated, 'managed', cadence, new Date(), env);
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
  stripeStatus: StripeSubscriptionStatus | string | undefined,
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
    if (value && value !== 'price_TODO') return value;
  }
  return null;
}
