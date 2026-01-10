// Seizn Spring - Subscription Management API
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { Plan, PLAN_QUOTAS, PLAN_PRICING } from '@/lib/spring/types';

export const runtime = 'nodejs';

// LemonSqueezy API configuration
const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;

// Product/Variant IDs for Spring plans
// Update these with your actual LemonSqueezy product IDs
const SPRING_PRODUCTS = {
  starter: {
    monthly: { productId: '130100', variantId: '1301001' },
    yearly: { productId: '130110', variantId: '1301011' },
  },
  plus: {
    monthly: { productId: '130100', variantId: '1301002' },
    yearly: { productId: '130110', variantId: '1301012' },
  },
  pro: {
    monthly: { productId: '130100', variantId: '1301003' },
    yearly: { productId: '130110', variantId: '1301013' },
  },
};

// ===========================================
// GET /api/spring/subscription - Get Current Subscription
// ===========================================
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const supabase = createServerClient();

    // Get user profile with subscription info
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        id,
        plan,
        plan_updated_at,
        lemonsqueezy_customer_id,
        subscription_ends_at,
        subscription_renews_at,
        subscription_cancelled
      `)
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const plan = (profile.plan || 'free') as Plan;
    const quota = PLAN_QUOTAS[plan] || PLAN_QUOTAS.free;
    const pricing = PLAN_PRICING[plan] || PLAN_PRICING.free;

    // Check if subscription is active
    const now = new Date();
    const endsAt = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null;
    const isActive = plan !== 'free' && (!endsAt || endsAt > now);

    return NextResponse.json({
      subscription: {
        plan,
        is_active: isActive,
        is_cancelled: profile.subscription_cancelled || false,
        ends_at: profile.subscription_ends_at,
        renews_at: profile.subscription_renews_at,
        updated_at: profile.plan_updated_at,
        customer_id: profile.lemonsqueezy_customer_id,
      },
      quota,
      pricing,
      available_plans: Object.entries(PLAN_PRICING).map(([name, price]) => ({
        name,
        monthly: price.monthly,
        yearly: price.yearly,
        quotas: PLAN_QUOTAS[name as Plan],
        is_current: name === plan,
      })),
    });
  } catch (error) {
    console.error('Subscription API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

// ===========================================
// POST /api/spring/subscription - Create Checkout URL
// ===========================================
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { plan, billing = 'monthly' } = body as { plan: Plan; billing: 'monthly' | 'yearly' };

    // Validate plan
    if (!['starter', 'plus', 'pro'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Get variant ID
    const productInfo = SPRING_PRODUCTS[plan as keyof typeof SPRING_PRODUCTS];
    if (!productInfo) {
      return NextResponse.json({ error: 'Plan not available' }, { status: 400 });
    }

    const variant = billing === 'yearly' ? productInfo.yearly : productInfo.monthly;

    // Create LemonSqueezy checkout
    const checkoutUrl = await createLemonSqueezyCheckout(
      variant.variantId,
      userId,
      session.user.email || undefined
    );

    return NextResponse.json({
      checkout_url: checkoutUrl,
      plan,
      billing,
      variant_id: variant.variantId,
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout' },
      { status: 500 }
    );
  }
}

// ===========================================
// DELETE /api/spring/subscription - Cancel Subscription
// ===========================================
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const supabase = createServerClient();

    // Get user's subscription info
    const { data: profile } = await supabase
      .from('profiles')
      .select('lemonsqueezy_customer_id, plan')
      .eq('id', userId)
      .single();

    if (!profile?.lemonsqueezy_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    // Cancel via LemonSqueezy API
    // Note: This marks for cancellation at period end, doesn't immediately downgrade
    const cancelled = await cancelLemonSqueezySubscription(profile.lemonsqueezy_customer_id);

    if (cancelled) {
      // Update local status
      await supabase
        .from('profiles')
        .update({ subscription_cancelled: true })
        .eq('id', userId);

      return NextResponse.json({
        success: true,
        message: 'Subscription will be cancelled at the end of the billing period',
      });
    }

    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}

// ===========================================
// LemonSqueezy API Helpers
// ===========================================
async function createLemonSqueezyCheckout(
  variantId: string,
  userId: string,
  email?: string
): Promise<string> {
  if (!LEMONSQUEEZY_API_KEY || !LEMONSQUEEZY_STORE_ID) {
    throw new Error('LemonSqueezy not configured');
  }

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: {
              user_id: userId,
            },
          },
          product_options: {
            redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/spring/subscription/success`,
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: LEMONSQUEEZY_STORE_ID,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variantId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('LemonSqueezy checkout error:', error);
    throw new Error('Failed to create checkout');
  }

  const data = await response.json();
  return data.data.attributes.url;
}

async function cancelLemonSqueezySubscription(customerId: number): Promise<boolean> {
  if (!LEMONSQUEEZY_API_KEY) {
    throw new Error('LemonSqueezy not configured');
  }

  // First, get the subscription ID for this customer
  const subsResponse = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions?filter[customer_id]=${customerId}`,
    {
      headers: {
        'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
        'Accept': 'application/vnd.api+json',
      },
    }
  );

  if (!subsResponse.ok) {
    return false;
  }

  const subsData = await subsResponse.json();
  const activeSubscription = subsData.data?.find(
    (sub: { attributes: { status: string } }) => sub.attributes.status === 'active'
  );

  if (!activeSubscription) {
    return false;
  }

  // Cancel the subscription
  const cancelResponse = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${activeSubscription.id}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
        'Accept': 'application/vnd.api+json',
      },
    }
  );

  return cancelResponse.ok;
}
