/**
 * Create Stripe Products and Prices for Seizn.
 *
 * Dry run by default:
 *   npx tsx scripts/create-stripe-products.ts
 *
 * Mutate Stripe only with an explicit execution flag:
 *   npx tsx scripts/create-stripe-products.ts --execute
 *
 * Live mode requires a second explicit guard:
 *   npx tsx scripts/create-stripe-products.ts --execute --allow-live
 */

import Stripe from "stripe";
import * as fs from "fs";
import * as path from "path";

type BillingInterval = "month" | "year";

type PlanConfig = {
  key: "starter" | "plus" | "pro" | "enterprise";
  name: string;
  monthly: number;
  yearly: number;
};

const args = new Set(process.argv.slice(2));
const shouldExecute = args.has("--execute");
const allowLive = args.has("--allow-live");

const plans: PlanConfig[] = [
  { key: "starter", name: "Starter", monthly: 900, yearly: 9000 },
  { key: "plus", name: "Plus", monthly: 2900, yearly: 29000 },
  { key: "pro", name: "Pro", monthly: 9900, yearly: 99000 },
  { key: "enterprise", name: "Enterprise", monthly: 49900, yearly: 499000 },
];

function readLocalEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const envVars: Record<string, string> = {};
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return envVars;
}

function getStripeSecretKey(): string {
  const envVars = readLocalEnv();
  const secretKey = process.env.STRIPE_SECRET_KEY || envVars.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is required when --execute is used");
  }
  if (secretKey.startsWith("sk_live_") && !allowLive) {
    throw new Error("Live Stripe keys require --allow-live");
  }
  return secretKey;
}

function priceLookupKey(planKey: string, interval: BillingInterval): string {
  return `seizn_${planKey}_${interval === "month" ? "monthly" : "yearly"}`;
}

async function findOrCreateProduct(stripe: Stripe, plan: PlanConfig): Promise<Stripe.Product> {
  const existing = await stripe.products.list({ active: true, limit: 100 });
  const product = existing.data.find((item) => item.metadata?.seizn_plan === plan.key);
  if (product) {
    return product;
  }

  return stripe.products.create(
    {
      name: `Seizn ${plan.name}`,
      description: `Seizn ${plan.name} plan`,
      metadata: {
        app: "seizn",
        seizn_plan: plan.key,
      },
    },
    { idempotencyKey: `seizn-product-${plan.key}` }
  );
}

async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  plan: PlanConfig,
  interval: BillingInterval,
  unitAmount: number
): Promise<Stripe.Price> {
  const lookupKey = priceLookupKey(plan.key, interval);
  const existing = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 1 });
  if (existing.data[0]) {
    return existing.data[0];
  }

  return stripe.prices.create(
    {
      product: productId,
      unit_amount: unitAmount,
      currency: "usd",
      recurring: { interval },
      lookup_key: lookupKey,
      metadata: {
        app: "seizn",
        seizn_plan: plan.key,
        billing_interval: interval,
      },
    },
    { idempotencyKey: `seizn-price-${plan.key}-${interval}` }
  );
}

async function main() {
  if (!shouldExecute) {
    console.log("Dry run. No Stripe API mutations will be made.");
    console.log("Use --execute to create or reuse products and prices.");
    for (const plan of plans) {
      console.log(
        `${plan.name}: $${plan.monthly / 100}/mo (${priceLookupKey(plan.key, "month")}), ` +
          `$${plan.yearly / 100}/yr (${priceLookupKey(plan.key, "year")})`
      );
    }
    return;
  }

  const stripe = new Stripe(getStripeSecretKey(), { typescript: true });
  const priceIds: Record<string, { monthly: string; yearly: string }> = {};

  for (const plan of plans) {
    const product = await findOrCreateProduct(stripe, plan);
    const monthlyPrice = await findOrCreatePrice(stripe, product.id, plan, "month", plan.monthly);
    const yearlyPrice = await findOrCreatePrice(stripe, product.id, plan, "year", plan.yearly);

    priceIds[plan.key] = {
      monthly: monthlyPrice.id,
      yearly: yearlyPrice.id,
    };

    console.log(`Ready: ${product.name} (${product.id})`);
    console.log(`  Monthly: ${monthlyPrice.id}`);
    console.log(`  Yearly: ${yearlyPrice.id}`);
  }

  console.log("\n=== Copy to stripe-config.ts ===\n");
  console.log("export const STRIPE_PLAN_PRICES: Record<string, PlanName> = {");
  for (const [plan, ids] of Object.entries(priceIds)) {
    console.log(`  "${ids.monthly}": "${plan}",`);
    console.log(`  "${ids.yearly}": "${plan}",`);
  }
  console.log("};");

  console.log("\nexport const PLAN_TO_STRIPE_PRICE: Record<PlanName, string | null> = {");
  console.log("  free: null,");
  for (const [plan, ids] of Object.entries(priceIds)) {
    console.log(`  ${plan}: "${ids.monthly}",`);
  }
  console.log("};");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
