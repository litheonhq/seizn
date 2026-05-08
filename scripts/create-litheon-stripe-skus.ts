/**
 * Create Stripe Products + Prices on the Litheon LLC account (W3.5).
 *
 * 26 SKUs total:
 *   Track 1 (Author Memory Web)        — 16 SKUs
 *     4 tiers × 2 columns × 2 cadences = 16
 *     tiers: indie, pro, studio, enterprise
 *     columns: managed, byok
 *     cadences: monthly, annual
 *   Track 2 (API · MCP)                 — 10 SKUs
 *     5 tiers × 2 cadences = 10
 *     tiers: indie, pro, studio, studio_managed, enterprise
 *     (Free tier has no Stripe SKU.)
 *   Track 3 (Desktop)                   — not generated yet (Coming Soon)
 *
 * Dry run (default):
 *   npx tsx scripts/create-litheon-stripe-skus.ts
 *
 * Execute against the Litheon Stripe account:
 *   STRIPE_SECRET_KEY=sk_live_litheon_... npx tsx scripts/create-litheon-stripe-skus.ts --execute --allow-live
 *
 * Test mode (recommended first):
 *   STRIPE_SECRET_KEY=sk_test_litheon_... npx tsx scripts/create-litheon-stripe-skus.ts --execute
 *
 * Output: writes the resulting product+price IDs to
 *   ./.stripe-litheon-skus.json
 * which can be diffed against the prior run before merging into stripe-config.ts.
 */

import Stripe from 'stripe';
import * as fs from 'fs';
import * as path from 'path';
import {
  AUTHOR_BILLING_TIERS,
  AUTHOR_PRICE_LOCK_VERSION,
  type AuthorBillingTier,
} from '../src/lib/stripe-config';

type Cadence = 'monthly' | 'annual';
type Column = 'managed' | 'byok';
type Track2Tier = 'indie' | 'pro' | 'studio' | 'studio_managed' | 'enterprise';

interface Track1Sku {
  productKey: string;
  productName: string;
  priceLookupKey: string;
  unitAmountUsdCents: number;
  charterUnitAmountUsdCents?: number;
  recurring: { interval: 'month' | 'year' };
  metadata: Record<string, string>;
}

interface Track2Sku extends Track1Sku {
  metadata: Record<string, string> & { track: 'api' };
}

const TRACK2_USD: Record<Track2Tier, { monthly: number; annual: number }> = {
  indie: { monthly: 9, annual: 90 },
  pro: { monthly: 19, annual: 190 },
  studio: { monthly: 99, annual: 990 },
  studio_managed: { monthly: 299, annual: 2990 },
  enterprise: { monthly: 0, annual: 0 }, // contact sales — placeholder for SKU shape only
};

function buildTrack1Skus(): Track1Sku[] {
  const skus: Track1Sku[] = [];
  const tiers: AuthorBillingTier[] = ['indie', 'pro', 'studio', 'enterprise'];

  for (const tier of tiers) {
    const cfg = AUTHOR_BILLING_TIERS[tier];

    const variants: Array<{ column: Column; cadence: Cadence; usd: number; charterUsd?: number }> = [
      { column: 'managed', cadence: 'monthly', usd: cfg.managedMonthlyUsd, charterUsd: cfg.managedMonthlyCharterUsd ?? undefined },
      { column: 'managed', cadence: 'annual', usd: cfg.managedAnnualUsd, charterUsd: cfg.managedAnnualCharterUsd ?? undefined },
      { column: 'byok', cadence: 'monthly', usd: cfg.byokMonthlyUsd ?? cfg.managedMonthlyUsd, charterUsd: cfg.byokMonthlyCharterUsd ?? undefined },
      { column: 'byok', cadence: 'annual', usd: cfg.byokAnnualUsd ?? cfg.managedAnnualUsd, charterUsd: cfg.byokAnnualCharterUsd ?? undefined },
    ];

    for (const v of variants) {
      const productKey = `seizn_author_${tier}_${v.column}_${v.cadence}_${AUTHOR_PRICE_LOCK_VERSION}_litheon`;
      skus.push({
        productKey,
        productName: `Seizn Author — ${cfg.label} (${v.column} / ${v.cadence})`,
        priceLookupKey: productKey,
        unitAmountUsdCents: v.usd * 100,
        charterUnitAmountUsdCents: v.charterUsd != null ? v.charterUsd * 100 : undefined,
        recurring: { interval: v.cadence === 'monthly' ? 'month' : 'year' },
        metadata: {
          track: 'web',
          tier,
          column: v.column,
          cadence: v.cadence,
          lockVersion: AUTHOR_PRICE_LOCK_VERSION,
          entity: 'litheon',
        },
      });
    }
  }

  return skus;
}

function buildTrack2Skus(): Track2Sku[] {
  const skus: Track2Sku[] = [];
  const tiers: Track2Tier[] = ['indie', 'pro', 'studio', 'studio_managed', 'enterprise'];

  for (const tier of tiers) {
    const usd = TRACK2_USD[tier];
    if (!usd.monthly && !usd.annual) continue; // enterprise = contact sales, no SKU yet

    for (const cadence of ['monthly', 'annual'] as const) {
      const productKey = `seizn_track2_${tier}_${cadence}_${AUTHOR_PRICE_LOCK_VERSION}_litheon`;
      const amount = cadence === 'monthly' ? usd.monthly : usd.annual;
      skus.push({
        productKey,
        productName: `Seizn API · MCP — ${tier} (${cadence})`,
        priceLookupKey: productKey,
        unitAmountUsdCents: amount * 100,
        recurring: { interval: cadence === 'monthly' ? 'month' : 'year' },
        metadata: {
          track: 'api',
          tier,
          cadence,
          lockVersion: AUTHOR_PRICE_LOCK_VERSION,
          entity: 'litheon',
        },
      });
    }
  }

  return skus;
}

interface Args {
  execute: boolean;
  allowLive: boolean;
}

function parseArgs(): Args {
  const set = new Set(process.argv.slice(2));
  return {
    execute: set.has('--execute'),
    allowLive: set.has('--allow-live'),
  };
}

async function ensureProduct(stripe: Stripe, sku: Track1Sku, dryRun: boolean) {
  if (dryRun) {
    console.log(`[dry-run] product create  → ${sku.productKey}`);
    return { id: `prod_DRYRUN_${sku.productKey}` } as Stripe.Product;
  }
  const lookup = await stripe.products.search({
    query: `metadata['key']:'${sku.productKey}'`,
    limit: 1,
  });
  if (lookup.data[0]) {
    console.log(`[exists] product → ${sku.productKey}`);
    return lookup.data[0];
  }
  const created = await stripe.products.create({
    name: sku.productName,
    metadata: { key: sku.productKey, ...sku.metadata },
    tax_code: 'txcd_10000000', // SaaS — software as a service
  });
  console.log(`[created] product → ${sku.productKey} (${created.id})`);
  return created;
}

async function ensurePrice(
  stripe: Stripe,
  product: Stripe.Product,
  sku: Track1Sku,
  amountCents: number,
  charter: boolean,
  dryRun: boolean
) {
  const lookupKey = charter ? `${sku.priceLookupKey}_charter` : sku.priceLookupKey;
  if (dryRun) {
    console.log(`[dry-run] price create   → ${lookupKey} (${amountCents}¢)`);
    return;
  }
  const lookup = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (lookup.data[0]) {
    console.log(`[exists] price → ${lookupKey}`);
    return;
  }
  const created = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
    recurring: sku.recurring,
    lookup_key: lookupKey,
    metadata: {
      ...sku.metadata,
      charter: charter ? 'true' : 'false',
    },
    nickname: lookupKey,
    tax_behavior: 'exclusive',
  });
  console.log(`[created] price → ${lookupKey} (${created.id})`);
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_LITHEON_SECRET_KEY;
  if (!apiKey) {
    console.error('Missing STRIPE_SECRET_KEY (or STRIPE_LITHEON_SECRET_KEY).');
    process.exit(1);
  }
  const isLive = apiKey.startsWith('sk_live_');
  if (isLive && !args.allowLive) {
    console.error('Live key detected but --allow-live not passed. Aborting.');
    process.exit(1);
  }

  const stripe = new Stripe(apiKey, { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion });

  const track1 = buildTrack1Skus();
  const track2 = buildTrack2Skus();
  const all = [...track1, ...track2];
  console.log(`Planned ${track1.length} Track 1 SKUs + ${track2.length} Track 2 SKUs = ${all.length} total.`);
  console.log(`Mode: ${args.execute ? (isLive ? 'EXECUTE (live)' : 'EXECUTE (test)') : 'DRY RUN'}`);

  const result: Array<{ key: string; productId: string }> = [];
  for (const sku of all) {
    const product = await ensureProduct(stripe, sku, !args.execute);
    await ensurePrice(stripe, product, sku, sku.unitAmountUsdCents, false, !args.execute);
    if (sku.charterUnitAmountUsdCents != null && sku.charterUnitAmountUsdCents !== sku.unitAmountUsdCents) {
      await ensurePrice(stripe, product, sku, sku.charterUnitAmountUsdCents, true, !args.execute);
    }
    result.push({ key: sku.productKey, productId: product.id });
  }

  const outPath = path.resolve(__dirname, '../.stripe-litheon-skus.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${result.length} entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
