import type { CSSProperties } from "react";
import { CheckoutButton } from "@/components/checkout-button";
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
} from "@/lib/stripe-config";
import type { Locale } from "@/i18n/config";
import type { AuthorLandingCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

const PRIMARY_TIERS = ["indie", "pro"] as const satisfies readonly AuthorBillingTier[];
const SECONDARY_TIERS = ["studio", "enterprise"] as const satisfies readonly AuthorBillingTier[];

export function SectionPricing({ copy, locale }: { copy: AuthorLandingCopy; locale: Locale }) {
  return (
    <section id="pricing" className="author-section" style={{ background: "var(--bg)" }}>
      <div className="author-shell">
        <SectionHeader eyebrow={copy.pricing.eyebrow} title={copy.pricing.title} subtitle={copy.pricing.subtitle} />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {PRIMARY_TIERS.map((tier) => (
            <PricingCardPrimary key={tier} tier={tier} copy={copy} locale={locale} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2" data-testid="pricing-secondary-rows">
          {SECONDARY_TIERS.map((tier) => (
            <PricingRowSecondary key={tier} tier={tier} copy={copy} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCardPrimary({ tier, copy, locale }: { tier: AuthorBillingTier; copy: AuthorLandingCopy; locale: Locale }) {
  const plan = AUTHOR_BILLING_TIERS[tier];
  const highlight = Boolean(plan.recommended);
  const tokenLabel = formatTokenLabel(plan.tokenCapMonth);

  return (
    <article
      className="relative flex h-full flex-col rounded-[var(--radius-lg)] border p-6 md:p-8"
      style={{
        borderColor: highlight ? "var(--accent-primary)" : "var(--ink-200)",
        background: highlight ? "var(--accent-primary)" : "var(--bg-elevated)",
        color: highlight ? "var(--accent-on-primary)" : "var(--text-primary)",
        boxShadow: highlight ? "var(--shadow-lg)" : "var(--shadow-sm)",
      }}
    >
      {highlight ? (
        <span
          className="author-badge absolute right-4 top-4"
          style={{ background: "var(--signal-canon)", color: "var(--ink-900)" }}
        >
          {copy.pricing.mostPicked}
        </span>
      ) : null}
      <p className="author-eyebrow mb-3" style={{ color: highlight ? "oklch(1 0 0 / 0.58)" : "var(--ink-500)" }}>
        {tokenLabel}
      </p>
      <h3 className="author-serif text-3xl">{plan.label}</h3>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[44px] font-medium leading-none">${formatUsd(plan.monthlyUsd)}</span>
        <span className="text-sm" style={{ color: highlight ? "oklch(1 0 0 / 0.62)" : "var(--ink-500)" }}>
          / month
        </span>
      </div>
      <p className="mt-4 text-sm leading-6" style={{ color: highlight ? "oklch(1 0 0 / 0.74)" : "var(--ink-600)", textWrap: "pretty" }}>
        {copy.pricing.blurbs[tier]}
      </p>
      <TokenBudgetBar cap={plan.tokenCapMonth} highlight={highlight} />
      <ul className="mt-6 grid flex-1 gap-2">
        {copy.pricing.features[tier].map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-6" style={{ color: highlight ? "oklch(1 0 0 / 0.86)" : "var(--ink-700)" }}>
            <CheckDot highlight={highlight} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div
        style={
          highlight
            ? ({
                "--szn-text-2": "oklch(1 0 0 / 0.76)",
                "--checkout-link-color": "var(--signal-canon)",
              } as CSSProperties)
            : undefined
        }
      >
        <CheckoutButton
          tier={tier}
          cadence="monthly"
          successUrl="/dashboard/billing?success=true"
          cancelUrl={`/${locale}/pricing`}
          privacyHref={`/${locale}/legal/privacy`}
          termsHref={`/${locale}/legal/terms`}
          legalCopy={copy.checkout}
          className={`author-btn mt-6 w-full px-4 py-3 text-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            highlight
              ? "bg-[color:var(--ink-0)] text-[color:var(--ink-900)]"
              : "bg-[color:var(--ink-900)] text-[color:var(--ink-0)]"
          }`}
          disabled={false}
        >
          {copy.pricing.start} {plan.label}
        </CheckoutButton>
      </div>
    </article>
  );
}

function PricingRowSecondary({ tier, copy, locale }: { tier: AuthorBillingTier; copy: AuthorLandingCopy; locale: Locale }) {
  const plan = AUTHOR_BILLING_TIERS[tier];
  const price = tier === "enterprise" ? `From $${formatUsd(plan.monthlyUsd)} / month` : `$${formatUsd(plan.monthlyUsd)} / month`;
  const tokens = formatTokenLabel(plan.tokenCapMonth);

  return (
    <article className="grid gap-4 rounded-[var(--radius-md)] border p-5 md:grid-cols-[auto_1fr_auto] md:items-center" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
      <div className="min-w-[96px]">
        <h3 className="text-base font-medium" style={{ color: "var(--ink-900)" }}>
          {plan.label}
        </h3>
        <p className="author-mono mt-1 text-[11px]" style={{ color: "var(--ink-500)" }}>
          {tokens}
        </p>
      </div>
      <p className="text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
        {copy.pricing.blurbs[tier]}
      </p>
      <div className="grid gap-2 md:min-w-[190px] md:justify-items-end">
        <p className="author-mono text-sm" style={{ color: "var(--ink-800)" }}>
          {price}
        </p>
        {tier === "enterprise" ? (
          <a
            href="mailto:support@seizn.com"
            className="author-btn min-h-9 border px-3 text-xs"
            style={{ borderColor: "var(--ink-300)", color: "var(--ink-800)" }}
          >
            {copy.pricing.contact}
          </a>
        ) : (
          <CheckoutButton
            tier={tier}
            cadence="monthly"
            successUrl="/dashboard/billing?success=true"
            cancelUrl={`/${locale}/pricing`}
            privacyHref={`/${locale}/legal/privacy`}
            termsHref={`/${locale}/legal/terms`}
            legalCopy={copy.checkout}
            className="author-btn min-h-11 border border-[color:var(--ink-300)] bg-[color:var(--ink-0)] px-3 text-xs text-[color:var(--ink-800)] hover:bg-[color:var(--ink-100)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={false}
          >
            {copy.pricing.start} {plan.label}
          </CheckoutButton>
        )}
      </div>
    </article>
  );
}

function TokenBudgetBar({ cap, highlight }: { cap: number | null; highlight: boolean }) {
  const width = cap === null ? "100%" : cap >= 20_000_000 ? "80%" : cap >= 5_000_000 ? "52%" : "24%";
  return (
    <div className="mt-5">
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: highlight ? "oklch(1 0 0 / 0.12)" : "var(--ink-100)" }}>
        <div className="h-full rounded-full" style={{ width, background: "var(--signal-canon)" }} />
      </div>
    </div>
  );
}

function CheckDot({ highlight }: { highlight: boolean }) {
  return (
    <span
      className="mt-1.5 flex h-4 w-4 flex-none items-center justify-center rounded-full"
      style={{ background: highlight ? "oklch(1 0 0 / 0.10)" : "var(--signal-canon-soft)" }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
        <path
          d="M1 4.5 L3.4 7 L8 1.5"
          stroke={highlight ? "var(--signal-canon)" : "var(--signal-canon-ink)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function formatTokenLabel(cap: number | null): string {
  if (cap === null) return "Unlimited";
  return `${cap / 1_000_000}M tokens / mo`;
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}
