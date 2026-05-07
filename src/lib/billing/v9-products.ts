/**
 * Track 2 v9 product catalog (API + MCP channel only, USD).
 *
 * Locked 2026-05-07. Replaces v8 catalog without grandfather migration —
 * Track 2 had no live subscribers prior to this cutover.
 *
 * Charter mechanics: any subscription whose first invoice posts before
 * V9_TRACK2_CHARTER_END_AT pays the Charter price. Stripe Schedule swaps
 * to the regular price ID for the first cycle on/after the cutoff. The
 * Studio Managed tier ships at medium effort (margin protection) and bills
 * an Opus call overage at $0.50 once the included quota is consumed.
 *
 * Tier → quota / rate / scopes follows Appendix B; api_keys table mirrors
 * these values, so changing one without the other silently drifts the
 * rate-limit middleware.
 */

export type V9Track2Tier =
  | 'free'
  | 'indie'
  | 'pro'
  | 'studio'
  | 'studio_managed'
  | 'enterprise';

export type V9BillingCadence = 'monthly' | 'yearly';
export type V9CharterStatus = 'charter' | 'regular';
export type ApiKeyQuotaPeriod = 'day' | 'month';

export interface V9Track2ProductConfig {
  id: V9Track2Tier;
  label: string;
  monthlyUsd: number | null;
  annualUsd: number | null;
  monthlyCharterUsd: number | null;
  annualCharterUsd: number | null;
  envPrefix: string | null;
  byokRequired: boolean;
  managedLlm: boolean;
  /** USD charged per Opus call once quota is exceeded (Studio Managed only). */
  meteredOverageUsd: number | null;
}

export interface V9Track2QuotaConfig {
  monthlyQuota: number;
  monthlyQuotaPeriod: ApiKeyQuotaPeriod;
  rateLimitPerMinute: number;
  scopes: string[];
}

export const V9_PRICE_LOCK_VERSION = 'v9';

/**
 * Charter launch window cutoff for Track 2. Mirrors Track 1
 * CHARTER_WINDOW_END_AT to keep messaging consistent across products.
 */
export const V9_TRACK2_CHARTER_END_AT = '2027-05-01T00:00:00Z';

export const V9_TRACK2_PRODUCTS: Record<V9Track2Tier, V9Track2ProductConfig> = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyUsd: 0,
    annualUsd: 0,
    monthlyCharterUsd: null,
    annualCharterUsd: null,
    envPrefix: null,
    byokRequired: true, // v9: Free is BYOK-only.
    managedLlm: false,
    meteredOverageUsd: null,
  },
  indie: {
    id: 'indie',
    label: 'Indie',
    monthlyUsd: 19,
    annualUsd: 19 * 12,
    monthlyCharterUsd: 11,
    annualCharterUsd: 108,
    envPrefix: 'STRIPE_PRICE_ID_V9_TRACK2_INDIE',
    byokRequired: true,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyUsd: 39,
    annualUsd: 39 * 12,
    monthlyCharterUsd: 23,
    annualCharterUsd: 228,
    envPrefix: 'STRIPE_PRICE_ID_V9_TRACK2_PRO',
    byokRequired: true,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    monthlyUsd: 199,
    annualUsd: 199 * 12,
    monthlyCharterUsd: 119,
    annualCharterUsd: 1188,
    envPrefix: 'STRIPE_PRICE_ID_V9_TRACK2_STUDIO',
    byokRequired: true,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  studio_managed: {
    id: 'studio_managed',
    label: 'Studio Managed',
    monthlyUsd: 999,
    annualUsd: 999 * 12,
    monthlyCharterUsd: 599,
    annualCharterUsd: 5988,
    envPrefix: 'STRIPE_PRICE_ID_V9_TRACK2_STUDIO_MANAGED',
    byokRequired: false,
    managedLlm: true,
    meteredOverageUsd: 0.5,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyUsd: null,
    annualUsd: null,
    monthlyCharterUsd: null,
    annualCharterUsd: null,
    envPrefix: 'STRIPE_PRICE_ID_V9_TRACK2_ENTERPRISE',
    byokRequired: false,
    managedLlm: true,
    meteredOverageUsd: null,
  },
};

export const V9_TRACK2_QUOTA: Record<V9Track2Tier, V9Track2QuotaConfig> = {
  free: {
    monthlyQuota: 50,
    monthlyQuotaPeriod: 'day',
    rateLimitPerMinute: 30,
    scopes: ['recall', 'remember', 'graph', 'search'],
  },
  indie: {
    monthlyQuota: 1_000,
    monthlyQuotaPeriod: 'month',
    rateLimitPerMinute: 60,
    scopes: ['recall', 'remember', 'graph', 'search', 'check', 'timeline'],
  },
  pro: {
    monthlyQuota: 10_000,
    monthlyQuotaPeriod: 'month',
    rateLimitPerMinute: 60,
    scopes: [
      'recall',
      'remember',
      'graph',
      'search',
      'check',
      'timeline',
      'projects:read',
      'projects:write',
    ],
  },
  studio: {
    monthlyQuota: 100_000,
    monthlyQuotaPeriod: 'month',
    rateLimitPerMinute: 600,
    scopes: [
      'recall',
      'remember',
      'graph',
      'search',
      'check',
      'timeline',
      'projects:read',
      'projects:write',
      'audit:read',
    ],
  },
  studio_managed: {
    monthlyQuota: 100_000,
    monthlyQuotaPeriod: 'month',
    rateLimitPerMinute: 600,
    scopes: [
      'recall',
      'remember',
      'graph',
      'search',
      'check',
      'timeline',
      'projects:read',
      'projects:write',
      'audit:read',
      'managed_llm',
    ],
  },
  enterprise: {
    monthlyQuota: 1_000_000,
    monthlyQuotaPeriod: 'month',
    rateLimitPerMinute: 6_000,
    scopes: ['*'],
  },
};

const V9_TIER_ORDER: V9Track2Tier[] = [
  'free',
  'indie',
  'pro',
  'studio',
  'studio_managed',
  'enterprise',
];

export function isV9Track2Tier(value: unknown): value is V9Track2Tier {
  return typeof value === 'string' && value in V9_TRACK2_PRODUCTS;
}

export function getV9Track2Config(tier: V9Track2Tier): V9Track2ProductConfig {
  return V9_TRACK2_PRODUCTS[tier];
}

export function getV9Track2Quota(tier: V9Track2Tier): V9Track2QuotaConfig {
  return V9_TRACK2_QUOTA[tier];
}

export function resolveV9CharterStatus(
  signupAt: Date | string = new Date(),
): V9CharterStatus {
  const t = typeof signupAt === 'string' ? Date.parse(signupAt) : signupAt.getTime();
  const cutoff = Date.parse(V9_TRACK2_CHARTER_END_AT);
  return Number.isFinite(t) && t < cutoff ? 'charter' : 'regular';
}

/**
 * Returns the Stripe price ID for a (tier, cadence, charter) combo. Returns
 * null if the env var isn't set (operator hasn't created the price yet) or
 * if the tier doesn't have an envPrefix (Free, Enterprise).
 *
 * Env var pattern: `${envPrefix}_${CADENCE}[_CHARTER]`
 * Example: STRIPE_PRICE_ID_V9_TRACK2_INDIE_MONTHLY_CHARTER
 */
export function getV9Track2StripePriceId(
  tier: V9Track2Tier,
  cadence: V9BillingCadence,
  charter: V9CharterStatus = 'charter',
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const product = V9_TRACK2_PRODUCTS[tier];
  if (!product.envPrefix) {
    return null;
  }
  const cadenceSuffix = cadence === 'monthly' ? 'MONTHLY' : 'ANNUAL';
  const charterSuffix = charter === 'charter' ? '_CHARTER' : '';
  return readEnv(env, [
    `${product.envPrefix}_${cadenceSuffix}${charterSuffix}`,
    // Legacy YEARLY suffix fallback.
    `${product.envPrefix}_${cadence === 'yearly' ? 'YEARLY' : 'MONTHLY'}${charterSuffix}`,
  ]);
}

export function getV9Track2ActivePriceId(
  tier: V9Track2Tier,
  cadence: V9BillingCadence,
  signupAt: Date | string = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return getV9Track2StripePriceId(tier, cadence, resolveV9CharterStatus(signupAt), env);
}

export function getV9Track2OpusOveragePriceId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readEnv(env, ['STRIPE_PRICE_ID_V9_TRACK2_STUDIO_MANAGED_OPUS_OVERAGE']);
}

export function getV9Track2OpusMeterId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readEnv(env, ['STRIPE_BILLING_METER_ID_V9_TRACK2_STUDIO_MANAGED_OPUS']);
}

export const V9_TRACK2_OPUS_METER_EVENT = 'studio_managed_opus_call';

export function getV9Track2TierFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): V9Track2Tier | null {
  for (const tier of Object.keys(V9_TRACK2_PRODUCTS) as V9Track2Tier[]) {
    if (tier === 'free' || tier === 'enterprise') continue;
    for (const cadence of ['monthly', 'yearly'] as const) {
      for (const charter of ['charter', 'regular'] as const) {
        if (getV9Track2StripePriceId(tier, cadence, charter, env) === priceId) {
          return tier;
        }
      }
    }
  }
  return null;
}

export function getV9Track2BillingCadenceFromPriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): V9BillingCadence | null {
  for (const tier of Object.keys(V9_TRACK2_PRODUCTS) as V9Track2Tier[]) {
    if (tier === 'free' || tier === 'enterprise') continue;
    for (const cadence of ['monthly', 'yearly'] as const) {
      for (const charter of ['charter', 'regular'] as const) {
        if (getV9Track2StripePriceId(tier, cadence, charter, env) === priceId) {
          return cadence;
        }
      }
    }
  }
  return null;
}

export function getV9Track2CharterStatusFromPriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): V9CharterStatus | null {
  for (const tier of Object.keys(V9_TRACK2_PRODUCTS) as V9Track2Tier[]) {
    if (tier === 'free' || tier === 'enterprise') continue;
    for (const cadence of ['monthly', 'yearly'] as const) {
      for (const charter of ['charter', 'regular'] as const) {
        if (getV9Track2StripePriceId(tier, cadence, charter, env) === priceId) {
          return charter;
        }
      }
    }
  }
  return null;
}

export function isV9Track2Upgrade(
  current: V9Track2Tier,
  next: V9Track2Tier,
): boolean {
  return V9_TIER_ORDER.indexOf(next) > V9_TIER_ORDER.indexOf(current);
}

type SupabaseLike = {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
};

export type ApplyTierResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

export async function applyV9Track2TierToApiKeys(
  userId: string,
  tier: V9Track2Tier,
  supabase: SupabaseLike,
): Promise<ApplyTierResult> {
  const quota = V9_TRACK2_QUOTA[tier];
  const { error } = await supabase
    .from('api_keys')
    .update({
      monthly_quota: quota.monthlyQuota,
      monthly_quota_period: quota.monthlyQuotaPeriod,
      rate_limit_per_minute: quota.rateLimitPerMinute,
      scopes: quota.scopes,
    })
    .eq('user_id', userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, updated: 1 };
}

function readEnv(env: NodeJS.ProcessEnv, names: string[]): string | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value && value !== 'price_TODO') return value;
  }
  return null;
}
