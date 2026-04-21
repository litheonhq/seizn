import { createServerClient } from '@/lib/supabase';
import crypto from 'crypto';
import { getPlan } from '@/lib/plan-limits';
import {
  migrateLegacyPlanName,
  type LegacyPlanName,
  type PlanName,
} from '@/lib/stripe-config';
import { logServerError, logServerWarn } from '@/lib/server/logger';

export type UsageDimension = 'memories' | 'ops';

export const STRIPE_METER_EVENT_NAMES: Record<UsageDimension, string> = {
  memories: 'seizn_memories_overage',
  ops: 'seizn_ops_overage',
};

export const OVERAGE_CENTS_PER_1K: Record<UsageDimension, number> = {
  memories: 5,
  ops: 1,
};

const FALLBACK_PRO_INCLUDED_OPS = 5_000_000;
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

type SupabaseLike = ReturnType<typeof createServerClient>;

interface StripeSubscription {
  id: string;
  items?: {
    data?: Array<{
      id: string;
      price?: {
        id?: string;
      };
    }>;
  };
}

export interface UsageBillingContext {
  studioId: string;
  userId: string;
  organizationId: string | null;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  plan: PlanName;
}

export interface RecordUsageEventInput {
  userId: string;
  keyId?: string | null;
  dimension: UsageDimension;
  quantity?: number;
  idempotencyKey?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface OverageForecast {
  included: number | null;
  total: number;
  reported: number;
  billable: number;
  unreported: number;
  cents: number;
  dollars: number;
  rateCentsPer1k: number;
}

function normalizePlanName(plan: string | null | undefined): PlanName {
  const candidate = (plan || 'free').toLowerCase();
  if (candidate === 'starter' || candidate === 'plus') {
    return migrateLegacyPlanName(candidate as LegacyPlanName);
  }
  if (
    candidate === 'free' ||
    candidate === 'indie' ||
    candidate === 'studio' ||
    candidate === 'pro' ||
    candidate === 'enterprise'
  ) {
    return candidate;
  }
  return 'free';
}

function isPlanNameLike(plan: string | null | undefined): boolean {
  const candidate = (plan || '').toLowerCase();
  return (
    candidate === 'free' ||
    candidate === 'indie' ||
    candidate === 'studio' ||
    candidate === 'pro' ||
    candidate === 'enterprise' ||
    candidate === 'starter' ||
    candidate === 'plus'
  );
}

export function isMeteredOveragePlan(plan: string | null | undefined): boolean {
  const normalized = normalizePlanName(plan);
  return normalized === 'studio' || normalized === 'pro';
}

export function getIncludedUsage(plan: string | null | undefined, dimension: UsageDimension): number | null {
  const normalized = normalizePlanName(plan);
  const config = getPlan(normalized);

  if (dimension === 'memories') {
    return config.memories === -1 ? null : config.memories;
  }

  if (config.apiCallsMonthly !== -1) {
    return config.apiCallsMonthly;
  }

  if (normalized === 'pro') {
    return FALLBACK_PRO_INCLUDED_OPS;
  }

  return null;
}

export function calculateOverageForecast(input: {
  plan: string | null | undefined;
  dimension: UsageDimension;
  totalQuantity: number;
  stripeReportedQuantity?: number;
}): OverageForecast {
  const included = getIncludedUsage(input.plan, input.dimension);
  const total = Math.max(0, Math.floor(input.totalQuantity || 0));
  const reported = Math.max(0, Math.floor(input.stripeReportedQuantity || 0));
  const billable =
    included == null || !isMeteredOveragePlan(input.plan)
      ? 0
      : Math.max(0, total - included);
  const unreported = Math.max(0, billable - reported);
  const cents = Math.ceil((billable / 1000) * OVERAGE_CENTS_PER_1K[input.dimension]);

  return {
    included,
    total,
    reported,
    billable,
    unreported,
    cents,
    dollars: cents / 100,
    rateCentsPer1k: OVERAGE_CENTS_PER_1K[input.dimension],
  };
}

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_SEIZN || '';
}

function getMeteredPriceIds(): string[] {
  return [
    process.env.STRIPE_METERED_PRICE_ID_MEMORIES,
    process.env.STRIPE_METERED_PRICE_ID_OPS,
  ].filter((value): value is string => Boolean(value));
}

function encodeStripeForm(params: Record<string, string | number | boolean | null | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.append(key, String(value));
  }
  return body;
}

async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? encodeStripeForm(params || {}) : undefined,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body?.error?.message === 'string'
        ? body.error.message
        : `Stripe ${method} ${path} failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export async function reportMeterEvent(
  customerId: string,
  event: UsageDimension | string,
  value: number,
  options?: { identifier?: string; timestamp?: number }
): Promise<{ id: string; object: string }> {
  const eventName = event === 'memories' || event === 'ops'
    ? STRIPE_METER_EVENT_NAMES[event]
    : event;
  const quantity = Math.max(0, Math.floor(value));

  if (!customerId) {
    throw new Error('Stripe customer ID is required for meter event reporting');
  }
  if (quantity <= 0) {
    throw new Error('Meter event quantity must be positive');
  }

  return stripeRequest<{ id: string; object: string }>('POST', '/billing/meter_events', {
    event_name: eventName,
    identifier: options?.identifier,
    timestamp: options?.timestamp,
    'payload[stripe_customer_id]': customerId,
    'payload[value]': quantity,
  });
}

export async function ensureMeteredPriceAttached(
  subscriptionId: string | null | undefined,
  plan: string | null | undefined
): Promise<{ attached: string[]; skippedReason?: string }> {
  if (!subscriptionId) {
    return { attached: [], skippedReason: 'missing_subscription' };
  }
  if (!isMeteredOveragePlan(plan)) {
    return { attached: [], skippedReason: 'non_metered_plan' };
  }

  const priceIds = getMeteredPriceIds();
  if (priceIds.length === 0) {
    return { attached: [], skippedReason: 'missing_metered_price_env' };
  }

  const subscription = await stripeRequest<StripeSubscription>(
    'GET',
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );
  const existingPriceIds = new Set(
    subscription.items?.data
      ?.map((item) => item.price?.id)
      .filter((value): value is string => Boolean(value)) || []
  );
  const missingPriceIds = priceIds.filter((priceId) => !existingPriceIds.has(priceId));

  if (missingPriceIds.length === 0) {
    return { attached: [] };
  }

  const params: Record<string, string | number | boolean> = {
    proration_behavior: 'none',
    payment_behavior: 'pending_if_incomplete',
  };
  missingPriceIds.forEach((priceId, index) => {
    params[`items[${index}][price]`] = priceId;
  });

  await stripeRequest<StripeSubscription>(
    'POST',
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    params
  );

  return { attached: missingPriceIds };
}

export async function resolveUsageBillingContext(
  supabase: SupabaseLike,
  userId: string,
  keyId?: string | null
): Promise<UsageBillingContext> {
  let organizationId: string | null = null;

  if (keyId) {
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('id', keyId)
      .maybeSingle();
    const keyOrg = keyRow as { organization_id?: string | null } | null;
    organizationId = keyOrg?.organization_id || null;
  }

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('id, plan, organization_id, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();
  const profile = profileRaw as {
    id?: string;
    plan?: string | null;
    organization_id?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  } | null;

  organizationId = organizationId || profile?.organization_id || null;

  let orgBilling: {
    plan?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  } | null = null;

  if (organizationId) {
    const { data: orgRaw } = await supabase
      .from('organizations')
      .select('plan, subscription_tier, stripe_customer_id, stripe_subscription_id')
      .eq('id', organizationId)
      .maybeSingle();
    const org = orgRaw as {
      plan?: string | null;
      subscription_tier?: string | null;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
    } | null;
    const orgPlan = org?.subscription_tier || (isPlanNameLike(org?.plan) ? org?.plan : null);
    orgBilling = org
      ? {
          plan: orgPlan,
          stripe_customer_id: org.stripe_customer_id,
          stripe_subscription_id: org.stripe_subscription_id,
        }
      : null;
  }

  const plan = normalizePlanName(orgBilling?.plan || profile?.plan);

  return {
    studioId: organizationId || userId,
    userId,
    organizationId,
    stripeCustomerId: orgBilling?.stripe_customer_id || profile?.stripe_customer_id || null,
    subscriptionId: orgBilling?.stripe_subscription_id || profile?.stripe_subscription_id || null,
    plan,
  };
}

export async function recordUsageEvent(input: RecordUsageEventInput): Promise<void> {
  const quantity = Math.max(0, Math.floor(input.quantity || 1));
  if (!input.userId || quantity <= 0) return;

  const supabase = createServerClient();

  try {
    const context = await resolveUsageBillingContext(supabase, input.userId, input.keyId);
    const idempotencyKey =
      input.idempotencyKey ||
      `${input.dimension}:${context.studioId}:${input.source || 'runtime'}:${crypto.randomUUID()}`;

    const { error } = await supabase.rpc('record_usage_event', {
      p_studio_id: context.studioId,
      p_dimension: input.dimension,
      p_quantity: quantity,
      p_idempotency_key: idempotencyKey,
      p_user_id: context.userId,
      p_organization_id: context.organizationId,
      p_stripe_customer_id: context.stripeCustomerId,
      p_subscription_id: context.subscriptionId,
      p_plan: context.plan,
      p_source: input.source || null,
      p_metadata: input.metadata || {},
    });

    if (error) {
      logServerWarn('[usage-metered] Usage event RPC failed', error, {
        userId: input.userId,
        dimension: input.dimension,
      });
    }
  } catch (error) {
    logServerError('[usage-metered] Usage event record failed', error, {
      userId: input.userId,
      dimension: input.dimension,
    });
  }
}
