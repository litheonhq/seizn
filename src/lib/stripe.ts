import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeSecretKey(): string {
  return (
    process.env.STRIPE_RESTRICTED_KEY ||
    process.env.STRIPE_SECRET_KEY_SEIZN ||
    process.env.STRIPE_SECRET_KEY ||
    ""
  );
}

export function hasStripeSecretKey(): boolean {
  return Boolean(getStripeSecretKey());
}

export function getStripeClient(): Stripe {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error(
      "STRIPE_RESTRICTED_KEY, STRIPE_SECRET_KEY_SEIZN, or STRIPE_SECRET_KEY is not set",
    );
  }

  stripeClient ??= new Stripe(secretKey, {
    typescript: true,
  });

  return stripeClient;
}
