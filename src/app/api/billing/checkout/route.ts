import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';
import { createStripeCheckoutSession } from '@/lib/stripe-checkout';

type CheckoutPlan = 'indie' | 'studio' | 'pro';
type CheckoutCadence = 'monthly' | 'yearly';

interface CheckoutRequestBody {
  plan?: string;
  cadence?: string;
  studioId?: string;
  promoCode?: string;
  successUrl?: string;
  cancelUrl?: string;
}

function isCheckoutPlan(plan: string | undefined): plan is CheckoutPlan {
  return plan === 'indie' || plan === 'studio' || plan === 'pro';
}

function normalizeCadence(cadence: string | undefined): CheckoutCadence {
  return cadence === 'yearly' ? 'yearly' : 'monthly';
}

function resolveSameOriginUrl(value: string | undefined, origin: string, fallbackPath: string): string {
  if (!value) return `${origin}${fallbackPath}`;

  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return `${origin}${fallbackPath}`;
    return url.toString();
  } catch {
    return `${origin}${fallbackPath}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as CheckoutRequestBody;
    if (!isCheckoutPlan(body.plan)) {
      return NextResponse.json({ error: 'A valid paid plan is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, organization_id, stripe_customer_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError) {
      logServerWarn('Checkout profile lookup failed', profileError, { userId: session.user.id });
    }

    const profileRow = profile as {
      email?: string | null;
      organization_id?: string | null;
      stripe_customer_id?: string | null;
    } | null;
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const checkout = await createStripeCheckoutSession({
      userId: session.user.id,
      email: profileRow?.email || session.user.email || null,
      studioId: body.studioId || profileRow?.organization_id || session.user.id,
      stripeCustomerId: profileRow?.stripe_customer_id || null,
      plan: body.plan,
      cadence: normalizeCadence(body.cadence),
      promoCode: body.promoCode || null,
      successUrl: resolveSameOriginUrl(body.successUrl, origin, '/dashboard/usage?checkout=success'),
      cancelUrl: resolveSameOriginUrl(body.cancelUrl, origin, '/pricing?checkout=cancelled'),
    });

    return NextResponse.json(checkout);
  } catch (error) {
    logServerError('Checkout session creation failed', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    const status = message.includes('promotion') || message.includes('Promotion') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
