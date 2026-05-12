import { DESIGN_PARTNER_COUPON_CODE, isApprovedDesignPartnerStudio } from '@/lib/design-partners';
import { createServerClient } from '@/lib/supabase';
import { getStripeSecretKey } from '@/lib/stripe';
import type { PlanName } from '@/lib/stripe-config';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

type CheckoutPlanName = Exclude<PlanName, 'free' | 'enterprise'>;
type BillingCadence = 'monthly' | 'yearly';

interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  url: string | null;
}

export interface CreateStripeCheckoutSessionInput {
  userId: string;
  email?: string | null;
  studioId?: string | null;
  stripeCustomerId?: string | null;
  plan: CheckoutPlanName;
  cadence?: BillingCadence;
  successUrl: string;
  cancelUrl: string;
  promoCode?: string | null;
}

export interface CreateStripeCheckoutSessionResult {
  id: string;
  url: string;
  appliedPromoCode: string | null;
}

function getStripePriceId(plan: CheckoutPlanName, cadence: BillingCadence): string {
  const envKey = `STRIPE_PRICE_ID_${plan.toUpperCase()}_${cadence === 'yearly' ? 'YEARLY' : 'MONTHLY'}`;
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`${envKey} is not configured`);
  }
  return priceId;
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
  method: 'POST',
  path: string,
  params: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error('STRIPE_RESTRICTED_KEY, STRIPE_SECRET_KEY_SEIZN, or STRIPE_SECRET_KEY is not configured');
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeStripeForm(params),
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

function normalizePromoCode(promoCode: string | null | undefined): string | null {
  const normalized = (promoCode || '').trim().toUpperCase();
  return normalized || null;
}

async function resolveAppliedPromoCode(input: CreateStripeCheckoutSessionInput): Promise<string | null> {
  const promoCode = normalizePromoCode(input.promoCode);
  if (!promoCode) return null;

  if (promoCode !== DESIGN_PARTNER_COUPON_CODE) {
    throw new Error('Unsupported promotion code');
  }

  if (input.plan !== 'studio' || input.cadence === 'yearly') {
    throw new Error('Design Partner pricing is only available for Studio monthly checkout');
  }

  const supabase = createServerClient();
  const approved = await isApprovedDesignPartnerStudio(supabase, input.studioId || input.userId);
  if (!approved) {
    throw new Error('Design Partner promotion is not approved for this studio');
  }

  return DESIGN_PARTNER_COUPON_CODE;
}

export async function createStripeCheckoutSession(
  input: CreateStripeCheckoutSessionInput
): Promise<CreateStripeCheckoutSessionResult> {
  const cadence = input.cadence || 'monthly';
  const priceId = getStripePriceId(input.plan, cadence);
  const appliedPromoCode = await resolveAppliedPromoCode(input);

  const params: Record<string, string | number | boolean | null | undefined> = {
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    customer: input.stripeCustomerId || undefined,
    customer_email: input.stripeCustomerId ? undefined : input.email || undefined,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': 1,
    'subscription_data[metadata][user_id]': input.userId,
    'subscription_data[metadata][studio_id]': input.studioId || input.userId,
    'subscription_data[metadata][plan]': input.plan,
    'metadata[user_id]': input.userId,
    'metadata[studio_id]': input.studioId || input.userId,
    'metadata[plan]': input.plan,
  };

  if (appliedPromoCode) {
    params['discounts[0][coupon]'] = appliedPromoCode;
    params['metadata[design_partner_coupon]'] = appliedPromoCode;
    params['subscription_data[metadata][design_partner_coupon]'] = appliedPromoCode;
  }

  const session = await stripeRequest<StripeCheckoutSession>('POST', '/checkout/sessions', params);
  if (!session.url) {
    throw new Error('Stripe checkout session did not return a URL');
  }

  return {
    id: session.id,
    url: session.url,
    appliedPromoCode,
  };
}
