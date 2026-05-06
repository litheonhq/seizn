"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { SeiznLockup } from "@/components/landing/brand-marks";
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import type { Locale } from "@/i18n/config";
import { formatTokenLabel, formatUsd } from "@/components/landing/section-pricing";
import type { PricingPageCopy } from "./pricing-copy";
import { PricingTrack2Section } from "./pricing-track2-section";

interface PricingClientProps {
  locale: Locale;
  copy: PricingPageCopy;
}

const TIERS = ["indie", "pro", "studio", "enterprise"] as const satisfies readonly AuthorBillingTier[];

export function PricingClient({ locale, copy }: PricingClientProps) {
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const yearly = cadence === "yearly";
  const plans = useMemo(() => TIERS.map((tier) => AUTHOR_BILLING_TIERS[tier]), []);

  return (
    <div className="author-landing">
      <nav className="sticky top-0 z-50 border-b backdrop-blur" aria-label="Pricing navigation" style={{ borderColor: "var(--ink-100)", background: "oklch(0.99 0.003 250 / 0.92)" }}>
        <div className="author-shell flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-0">
          <Link href={`/${locale}`} className="inline-flex min-h-11 items-center">
            <SeiznLockup tone="dark" />
          </Link>
          <div className="flex items-center gap-5">
            <a href={`/${locale}#workflow`} className="hidden text-sm md:block" style={{ color: "var(--ink-600)" }}>
              {copy.nav.features}
            </a>
            <Link href={`/${locale}/pricing`} className="hidden text-sm font-medium md:block" style={{ color: "var(--ink-900)" }}>
              {copy.nav.pricing}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-sm md:block" style={{ color: "var(--ink-600)" }}>
              {copy.nav.docs}
            </Link>
            <Link
              href="/signup"
              className="author-btn min-h-10 px-4 py-2 text-sm"
              style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}
            >
              {copy.nav.start}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="author-section pb-10">
          <div className="author-shell flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="author-eyebrow">{copy.hero.eyebrow}</p>
              <h1 className="author-serif mt-3 text-[length:var(--t-h1)]" style={{ color: "var(--ink-900)" }}>
                {copy.hero.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 md:text-lg" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                {copy.hero.subtitle}
              </p>
            </div>

            <div className="inline-grid w-full gap-1 rounded-[var(--radius-md)] border p-1 sm:w-fit sm:grid-cols-2" style={{ borderColor: "var(--ink-200)", background: "var(--ink-50)" }}>
              {(["monthly", "yearly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  className="min-h-11 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium"
                  style={{
                    background: cadence === option ? "var(--ink-900)" : "transparent",
                    color: cadence === option ? "var(--ink-0)" : "var(--ink-600)",
                  }}
                >
                  {option === "monthly" ? copy.hero.monthly : `${copy.hero.yearly}${copy.hero.yearlySuffix}`}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="author-shell grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                tier={plan.id}
                cadence={cadence}
                name={plan.label}
                price={yearly ? plan.yearlyUsd : plan.monthlyUsd}
                tokenCap={plan.tokenCapMonth}
                features={copy.features[plan.id]}
                blurb={copy.blurbs[plan.id]}
                recommended={plan.recommended}
                byokRequired={plan.byokRequired}
                locale={locale}
                copy={copy}
              />
            ))}
          </div>
        </section>

        <section className="border-y px-4 py-10 sm:px-6 lg:px-8" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
          <div className="author-shell grid gap-5 md:grid-cols-3">
            {copy.launchNotes.map((note) => (
              <LaunchNote key={note.title} title={note.title} body={note.body} />
            ))}
          </div>
        </section>

        <PricingTrack2Section locale={locale} />

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="author-serif text-3xl" style={{ color: "var(--ink-900)" }}>
            {copy.faq.title}
          </h2>
          <div className="mt-6 grid gap-3">
            {copy.faq.items.map((item) => (
              <details key={item.q} className="rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}>
                <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--ink-900)" }}>
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--ink-600)" }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-10 sm:px-6 lg:px-8" style={{ borderColor: "var(--ink-100)" }}>
        <div className="author-shell flex flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between" style={{ color: "var(--ink-600)" }}>
          <Link href={`/${locale}`} className="font-medium" style={{ color: "var(--ink-900)" }}>
            Seizn
          </Link>
          <span>{copy.footer.copyright.replace("{year}", new Date().getFullYear().toString())}</span>
          <nav className="flex flex-wrap gap-5" aria-label="Pricing footer">
            <a href={`/${locale}/legal/privacy`} className="hover:underline">{copy.footer.privacy}</a>
            <a href={`/${locale}/legal/terms`} className="hover:underline">{copy.footer.terms}</a>
            <a href={`/${locale}/legal/beta-disclosure`} className="hover:underline">{copy.footer.beta}</a>
            <a href={`/${locale}/docs/faq`} className="hover:underline">{copy.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function PricingCard({
  tier,
  cadence,
  name,
  price,
  tokenCap,
  features,
  blurb,
  recommended,
  byokRequired,
  locale,
  copy,
}: {
  tier: AuthorBillingTier;
  cadence: BillingCadence;
  name: string;
  price: number;
  tokenCap: number | null;
  features: string[];
  blurb: string;
  recommended?: boolean;
  byokRequired?: boolean;
  locale: Locale;
  copy: PricingPageCopy;
}) {
  return (
    <article
      className="flex h-full flex-col rounded-[var(--radius-lg)] border p-5"
      style={{
        borderColor: recommended ? "var(--ink-900)" : "var(--ink-200)",
        background: recommended ? "var(--ink-900)" : "var(--ink-0)",
        color: recommended ? "var(--ink-0)" : "var(--ink-900)",
        boxShadow: recommended ? "var(--shadow-lg)" : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{name}</h2>
        {recommended ? (
          <span className="author-badge" style={{ background: "var(--signal-canon)", color: "var(--ink-900)" }}>
            {copy.card.popular}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold">${formatUsd(price)}</span>
          <span className="text-sm" style={{ color: recommended ? "oklch(1 0 0 / 0.62)" : "var(--ink-500)" }}>
            / {cadence === "monthly" ? copy.card.monthly : copy.card.yearly}
          </span>
        </div>
        <p className="author-mono mt-2 text-[11px]" style={{ color: recommended ? "oklch(1 0 0 / 0.58)" : "var(--ink-500)" }}>
          {formatTokenLabel(tokenCap)}
        </p>
      </div>

      <p className="mt-4 text-sm leading-6" style={{ color: recommended ? "oklch(1 0 0 / 0.72)" : "var(--ink-600)" }}>
        {blurb}
      </p>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-6" style={{ color: recommended ? "oklch(1 0 0 / 0.86)" : "var(--ink-700)" }}>
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--signal-canon)" }} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {byokRequired ? (
        <p className="mt-5 rounded-[var(--radius-md)] px-3 py-2 text-xs" style={{ background: recommended ? "oklch(1 0 0 / 0.08)" : "var(--ink-50)", color: recommended ? "oklch(1 0 0 / 0.70)" : "var(--ink-600)" }}>
          {copy.card.byokRequired}
        </p>
      ) : null}

      <div
        style={
          recommended
            ? ({
                "--szn-text-2": "oklch(1 0 0 / 0.76)",
                "--checkout-link-color": "var(--signal-canon)",
              } as CSSProperties)
            : undefined
        }
      >
        <CheckoutButton
          tier={tier}
          cadence={cadence}
          successUrl="/dashboard/billing?success=true"
          cancelUrl={`/${locale}/pricing`}
          privacyHref={`/${locale}/legal/privacy`}
          termsHref={`/${locale}/legal/terms`}
          legalCopy={copy.checkout}
          className={`author-btn mt-6 w-full px-4 py-3 text-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            recommended
              ? "bg-[color:var(--ink-0)] text-[color:var(--ink-900)]"
              : "bg-[color:var(--ink-900)] text-[color:var(--ink-0)]"
          }`}
          disabled={false}
        >
          {copy.card.start} {name}
        </CheckoutButton>
      </div>
    </article>
  );
}

function LaunchNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold" style={{ color: "var(--ink-900)" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-600)" }}>
        {body}
      </p>
    </div>
  );
}
