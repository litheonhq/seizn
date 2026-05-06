/**
 * Track 2 v8 product catalog (API + MCP channel only, USD).
 *
 * Track 1 (Web KRW) and Track 3 (Tauri KRW) products are owned by their own
 * track cycles. v7 (`stripe-config.ts`) stays active for grandfathered Track 1
 * subscribers; the live Stripe price IDs for v8 are populated in Phase 8 by a
 * human (env vars below default to `price_TODO`).
 *
 * Tier → quota / rate / scopes follows the task pack Appendix B contract; the
 * api_keys table mirrors these values, so changing one without the other
 * silently drifts the rate-limit middleware.
 */
export type V8Track2Tier =
  | 'free'
  | 'indie'
  | 'pro'
  | 'studio'
  | 'studio_managed'
  | 'enterprise';

export type V8BillingCadence = 'monthly' | 'yearly';

export type ApiKeyQuotaPeriod = 'day' | 'month';

export interface V8Track2ProductConfig {
  id: V8Track2Tier;
  label: string;
  monthlyUsd: number | null;
  yearlyUsd: number | null;
  envPrefix: string | null;
  byokRequired: boolean;
  managedLlm: boolean;
  meteredOverageUsd: number | null;
}

export interface V8Track2QuotaConfig {
  monthlyQuota: number;
  monthlyQuotaPeriod: ApiKeyQuotaPeriod;
  rateLimitPerMinute: number;
  scopes: string[];
}

export const V8_PRICE_LOCK_VERSION = 'v8';

export const V8_GRANDFATHER_DAYS = 90;

export const V8_TRACK2_PRODUCTS: Record<V8Track2Tier, V8Track2ProductConfig> = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyUsd: 0,
    yearlyUsd: 0,
    envPrefix: null,
    byokRequired: false,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  indie: {
    id: 'indie',
    label: 'Indie',
    monthlyUsd: 9,
    yearlyUsd: 90,
    envPrefix: 'STRIPE_PRICE_ID_V8_INDIE',
    byokRequired: true,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyUsd: 19,
    yearlyUsd: 190,
    envPrefix: 'STRIPE_PRICE_ID_V8_PRO',
    byokRequired: true,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    monthlyUsd: 99,
    yearlyUsd: 990,
    envPrefix: 'STRIPE_PRICE_ID_V8_STUDIO',
    byokRequired: true,
    managedLlm: false,
    meteredOverageUsd: null,
  },
  studio_managed: {
    id: 'studio_managed',
    label: 'Studio Managed',
    monthlyUsd: 299,
    yearlyUsd: 2990,
    envPrefix: 'STRIPE_PRICE_ID_V8_STUDIO_MANAGED',
    byokRequired: false,
    managedLlm: true,
    meteredOverageUsd: 0.15,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyUsd: null,
    yearlyUsd: null,
    envPrefix: 'STRIPE_PRICE_ID_V8_ENTERPRISE',
    byokRequired: false,
    managedLlm: true,
    meteredOverageUsd: null,
  },
};

export const V8_TRACK2_QUOTA: Record<V8Track2Tier, V8Track2QuotaConfig> = {
  free: {
    monthlyQuota: 100,
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

const V8_TIER_ORDER: V8Track2Tier[] = [
  'free',
  'indie',
  'pro',
  'studio',
  'studio_managed',
  'enterprise',
];

export function isV8Track2Tier(value: unknown): value is V8Track2Tier {
  return typeof value === 'string' && value in V8_TRACK2_PRODUCTS;
}

export function getV8Track2Config(tier: V8Track2Tier): V8Track2ProductConfig {
  return V8_TRACK2_PRODUCTS[tier];
}

export function getV8Track2Quota(tier: V8Track2Tier): V8Track2QuotaConfig {
  return V8_TRACK2_QUOTA[tier];
}

export function getV8Track2StripePriceId(
  tier: V8Track2Tier,
  cadence: V8BillingCadence,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const product = V8_TRACK2_PRODUCTS[tier];
  if (!product.envPrefix) {
    return null;
  }
  const suffix = cadence === 'monthly' ? 'MONTHLY' : 'YEARLY';
  const value = env[`${product.envPrefix}_${suffix}`]?.trim();
  return value && value !== 'price_TODO' ? value : null;
}

export function getV8Track2OpusOveragePriceId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.STRIPE_PRICE_ID_V8_STUDIO_MANAGED_OPUS_OVERAGE?.trim();
  return value && value !== 'price_TODO' ? value : null;
}

export function getV8Track2OpusMeterId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.STRIPE_BILLING_METER_ID_V8_STUDIO_MANAGED_OPUS?.trim();
  return value || null;
}

export const V8_TRACK2_OPUS_METER_EVENT = 'studio_managed_opus_call';

export function getV8Track2TierFromStripePriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): V8Track2Tier | null {
  for (const tier of Object.keys(V8_TRACK2_PRODUCTS) as V8Track2Tier[]) {
    if (tier === 'free') continue;
    for (const cadence of ['monthly', 'yearly'] as const) {
      if (getV8Track2StripePriceId(tier, cadence, env) === priceId) {
        return tier;
      }
    }
  }
  return null;
}

/**
 * Collect every Stripe price ID configured for the v8 Track 2 catalog,
 * resolved against the supplied env. Returns a Set so the caller can
 * intersect it against legacy v7 price IDs to detect collisions.
 *
 * Audit Phase 2 (2026-05-07): the webhook dispatcher trusts that v7 and v8
 * price IDs are disjoint — `maybeApplyV8Track2` short-circuits the legacy
 * `getPlanFromStripePriceId` path. If an admin accidentally configures the
 * same `price_…` for both `STRIPE_PRICE_ID_INDIE_MONTHLY` and
 * `STRIPE_PRICE_ID_V8_INDIE_MONTHLY` (very likely during cutover), v8
 * silently wins and `profiles.plan` is never updated — user pays for Indie
 * but stays on `'free'` quotas. This helper lets a startup check assert the
 * sets are disjoint.
 */
export function collectV8Track2PriceIds(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const out = new Set<string>();
  for (const tier of Object.keys(V8_TRACK2_PRODUCTS) as V8Track2Tier[]) {
    if (tier === 'free') continue;
    for (const cadence of ['monthly', 'yearly'] as const) {
      const id = getV8Track2StripePriceId(tier, cadence, env);
      if (id && !id.startsWith('price_TODO')) out.add(id);
    }
  }
  // Studio Managed Opus overage is a single env var, not per-tier.
  const overage = getV8Track2OpusOveragePriceId(env);
  if (overage && !overage.startsWith('price_TODO')) out.add(overage);
  return out;
}

export function getV8Track2BillingCadenceFromPriceId(
  priceId: string,
  env: NodeJS.ProcessEnv = process.env,
): V8BillingCadence | null {
  for (const tier of Object.keys(V8_TRACK2_PRODUCTS) as V8Track2Tier[]) {
    if (tier === 'free') continue;
    for (const cadence of ['monthly', 'yearly'] as const) {
      if (getV8Track2StripePriceId(tier, cadence, env) === priceId) {
        return cadence;
      }
    }
  }
  return null;
}

export function isV8Track2Upgrade(
  current: V8Track2Tier,
  next: V8Track2Tier,
): boolean {
  return V8_TIER_ORDER.indexOf(next) > V8_TIER_ORDER.indexOf(current);
}

export function v8Track2GrandfatherCutoffIso(
  v7DeprecationStartIso: string,
): string {
  const start = new Date(v7DeprecationStartIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid ISO date: ${v7DeprecationStartIso}`);
  }
  start.setUTCDate(start.getUTCDate() + V8_GRANDFATHER_DAYS);
  return start.toISOString();
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

export async function applyV8Track2TierToApiKeys(
  userId: string,
  tier: V8Track2Tier,
  supabase: SupabaseLike,
): Promise<ApplyTierResult> {
  const quota = V8_TRACK2_QUOTA[tier];
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
