/**
 * Track 2 (Public REST API + MCP, USD) pricing section.
 */

import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";
import type { BillingCadence } from "@/lib/stripe-config";
import {
  V9_TRACK2_PRODUCTS,
  V9_TRACK2_QUOTA,
  resolveV9CharterStatus,
  type V9Track2Tier,
} from "@/lib/billing/v9-products";
import { getTrack2PricingCopy } from "./pricing-track2-copy";

type Track2TierKey = "free" | "indie" | "pro" | "studio" | "studioManaged" | "enterprise";

type Track2Tier = {
  id: string;
  tierId: V9Track2Tier;
  copyKey: Track2TierKey;
  name: string;
  highlight?: boolean;
  contactCta?: boolean;
};

type Track2PricePair = {
  active: number | null;
  regular: number | null;
  isCharter: boolean;
};

const TIERS: Track2Tier[] = [
  { id: "free", tierId: "free", copyKey: "free", name: "Free", highlight: true },
  { id: "indie", tierId: "indie", copyKey: "indie", name: "Indie" },
  { id: "pro", tierId: "pro", copyKey: "pro", name: "Pro" },
  { id: "studio", tierId: "studio", copyKey: "studio", name: "Studio" },
  {
    id: "studio-managed",
    tierId: "studio_managed",
    copyKey: "studioManaged",
    name: "Studio Managed",
  },
  {
    id: "enterprise",
    tierId: "enterprise",
    copyKey: "enterprise",
    name: "Enterprise",
    contactCta: true,
  },
];

function resolveTrack2PricePair(tier: V9Track2Tier, cadence: BillingCadence): Track2PricePair {
  const config = V9_TRACK2_PRODUCTS[tier];
  if (config.monthlyUsd === null || config.annualUsd === null) {
    return { active: null, regular: null, isCharter: false };
  }

  const isCharter = resolveV9CharterStatus() === "charter";
  if (cadence === "monthly") {
    const active = isCharter ? config.monthlyCharterUsd ?? config.monthlyUsd : config.monthlyUsd;
    return {
      active,
      regular: config.monthlyUsd,
      isCharter: isCharter && active !== config.monthlyUsd,
    };
  }

  const active = isCharter ? config.annualCharterUsd ?? config.annualUsd : config.annualUsd;
  return {
    active,
    regular: config.annualUsd,
    isCharter: isCharter && active !== config.annualUsd,
  };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPrice(pair: Track2PricePair, cadence: BillingCadence): string {
  if (pair.active === null) return "Contact";
  return `$${formatUsd(pair.active)} / ${cadence === "monthly" ? "mo" : "yr"}`;
}

function formatQuota(tier: V9Track2Tier): string {
  if (tier === "enterprise") return "Custom";
  const quota = V9_TRACK2_QUOTA[tier];
  return `${quota.monthlyQuota.toLocaleString("en-US")} / ${quota.monthlyQuotaPeriod}`;
}

function formatRate(tier: V9Track2Tier): string {
  if (tier === "enterprise") return "Custom";
  return `${V9_TRACK2_QUOTA[tier].rateLimitPerMinute.toLocaleString("en-US")} / min`;
}

function formatScopes(tier: V9Track2Tier): string {
  if (tier === "enterprise") return "All + custom scopes";
  return V9_TRACK2_QUOTA[tier].scopes.join(" · ");
}

function formatTierNotes(notes: string, tier: V9Track2Tier): string {
  const overage = V9_TRACK2_PRODUCTS[tier].meteredOverageUsd;
  if (overage === null) return notes;
  return notes.replaceAll("{overage}", `$${overage.toFixed(2)}`);
}

export function PricingTrack2Section({
  locale,
  cadence,
  checkoutCopy,
}: {
  locale: string;
  cadence: BillingCadence;
  checkoutCopy: CheckoutLegalCopy;
}) {
  const copy = getTrack2PricingCopy(locale);
  return (
    <section id="track-2" className="px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <header className="author-shell mx-auto max-w-3xl text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-szn-text-2">{copy.eyebrow}</p>
        <h2 className="mt-3 font-serif text-3xl text-szn-text-1 sm:text-4xl">{copy.title}</h2>
        <p className="mt-4 text-base text-szn-text-2">{copy.subtitle}</p>
        <p className="mx-auto mt-3 max-w-2xl rounded-md border border-szn-border-subtle bg-szn-surface px-3 py-2 text-[13px] leading-relaxed text-szn-text-2">
          <span className="text-szn-text-1">{copy.hostLlmCallout.head}</span>{" "}
          {copy.hostLlmCallout.body}
        </p>
      </header>

      <div className="author-shell mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TIERS.map((tier) => {
          const tierCopy = copy.tiers[tier.copyKey];
          const pricePair = resolveTrack2PricePair(tier.tierId, cadence);
          const canCheckout = tier.tierId !== "free" && tier.tierId !== "enterprise";
          return (
            <article
              key={tier.id}
              className={`flex h-full flex-col rounded-[var(--radius-lg)] border p-5 ${
                tier.highlight ? "border-szn-accent shadow-md" : "border-szn-border-subtle"
              }`}
              style={{ background: "var(--ink-0)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl text-szn-text-1">{tier.name}</h3>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    {pricePair.isCharter && pricePair.regular !== null ? (
                      <span className="text-sm line-through text-szn-text-2">
                        ${formatUsd(pricePair.regular)}
                      </span>
                    ) : null}
                    <span className="text-2xl font-semibold text-szn-text-1">
                      {formatPrice(pricePair, cadence)}
                    </span>
                  </div>
                  {pricePair.isCharter ? (
                    <p className="author-mono mt-1 text-[10px] uppercase tracking-wide text-szn-accent">
                      Charter pricing
                    </p>
                  ) : null}
                </div>
                {tier.highlight ? (
                  <span className="rounded-full border border-szn-accent/30 bg-szn-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-szn-accent">
                    {copy.badges.startHere}
                  </span>
                ) : null}
              </div>

              <dl className="mt-5 space-y-2 text-[13px] text-szn-text-2">
                <div className="flex justify-between gap-4">
                  <dt>{copy.table.quota}</dt>
                  <dd className="text-right text-szn-text-1">{formatQuota(tier.tierId)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{copy.table.rate}</dt>
                  <dd className="text-right text-szn-text-1">{formatRate(tier.tierId)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{copy.table.scopes}</dt>
                  <dd className="max-w-[12rem] text-right font-mono text-[11.5px] text-szn-text-1">
                    {formatScopes(tier.tierId)}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-[12.5px] leading-relaxed text-szn-text-2">{formatTierNotes(tierCopy.notes, tier.tierId)}</p>
              <div className="mt-6 flex-1" />

              {tier.contactCta ? (
                <a href="mailto:sales@seizn.com" className="szn-btn-glass mt-2 w-full text-center text-sm">
                  {tierCopy.cta}
                </a>
              ) : canCheckout ? (
                <CheckoutButton
                  channel="track2"
                  track2Tier={tier.tierId}
                  cadence={cadence}
                  successUrl="/dashboard/account/api-keys?checkout=success"
                  cancelUrl={`/${locale}/pricing#track-2`}
                  privacyHref={`/${locale}/legal/privacy`}
                  termsHref={`/${locale}/legal/terms`}
                  legalCopy={checkoutCopy}
                  className="author-btn mt-2 w-full px-4 py-3 text-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tierCopy.cta}
                </CheckoutButton>
              ) : (
                <Link href="/dashboard/account/api-keys" className="szn-btn-glass mt-2 w-full text-center text-sm">
                  {tierCopy.cta}
                </Link>
              )}
            </article>
          );
        })}
      </div>

      <div className="mx-auto mt-10 max-w-3xl text-center text-[12.5px] text-szn-text-2">
        {copy.footnote.body}{" "}
        <Link href={`/${locale}/api`} className="underline">
          {copy.footnote.apiDocs}
        </Link>{" "}
        ·{" "}
        <a href="/openapi.yaml" className="underline">
          {copy.footnote.openApi}
        </a>{" "}
        ·{" "}
        <a
          href="https://www.npmjs.com/package/@seizn/author-mcp-server"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {copy.footnote.npm}
        </a>
      </div>
    </section>
  );
}
