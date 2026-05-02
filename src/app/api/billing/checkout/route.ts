import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { isValidStripePriceId } from "@/lib/stripe-config";

interface CheckoutRequestBody {
  priceId?: unknown;
  successUrl?: unknown;
  cancelUrl?: unknown;
}

function resolveSameOriginUrl(
  value: unknown,
  origin: string,
  fallbackPath: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${origin}${fallbackPath}`;
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) {
      return `${origin}${fallbackPath}`;
    }
    return parsed.toString();
  } catch {
    return `${origin}${fallbackPath}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const { priceId, successUrl, cancelUrl } = (await request.json()) as CheckoutRequestBody;

    if (typeof priceId !== "string" || !isValidStripePriceId(priceId)) {
      return NextResponse.json({ error: "Invalid price ID" }, { status: 400 });
    }

    const origin = request.nextUrl.origin;
    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: resolveSameOriginUrl(
        successUrl,
        origin,
        "/settings/billing?success=true"
      ),
      cancel_url: resolveSameOriginUrl(cancelUrl, origin, "/pricing"),
      client_reference_id: session.user.id,
      customer_email: session.user.email || undefined,
      metadata: {
        user_id: session.user.id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
