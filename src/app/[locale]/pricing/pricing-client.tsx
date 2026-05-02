"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  AUTHOR_BILLING_TIERS,
  AUTHOR_PRICE_LOCK_VERSION,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface PricingClientProps {
  dict: Dictionary;
  locale: Locale;
}

const PLAN_FEATURES: Record<AuthorBillingTier, string[]> = {
  indie: [
    "1M managed author tokens each month",
    "Single author workspace",
    "BYOK discount when an Anthropic key is active",
  ],
  pro: [
    "5M managed author tokens each month",
    "Project imports, simulations, and audit replay",
    "Priority billing support",
  ],
  studio: [
    "20M managed author tokens each month",
    "Multi-project studio workflow",
    "Usage review for larger launches",
  ],
  enterprise: [
    "Unlimited monthly author tokens",
    "BYOK required for production workloads",
    "Custom security and procurement support",
  ],
};

const TIERS = ["indie", "pro", "studio", "enterprise"] as const;

export function PricingClient({ dict, locale }: PricingClientProps) {
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const t = dict;
  const yearly = cadence === "yearly";
  const faq = t.pricingPage?.faq;

  const plans = useMemo(() => TIERS.map((tier) => AUTHOR_BILLING_TIERS[tier]), []);

  return (
    <div className="min-h-screen bg-szn-bg text-szn-text-1">
      <nav className="sticky top-0 z-50 border-b border-szn-border bg-szn-bg/90 backdrop-blur" aria-label="Pricing navigation">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-szn-accent text-sm font-semibold text-white">
              S
            </span>
            <span className="text-xl font-semibold">Seizn</span>
          </Link>

          <div className="flex items-center gap-5">
            <a href={`/${locale}#features`} className="hidden text-sm text-szn-text-2 hover:text-szn-text-1 md:block">
              {t.nav.features}
            </a>
            <Link href={`/${locale}/pricing`} className="hidden text-sm font-medium text-szn-text-1 md:block">
              {t.nav.pricing}
            </Link>
            <Link href="/docs" className="hidden text-sm text-szn-text-2 hover:text-szn-text-1 md:block">
              {t.nav.docs}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/login"
              className="rounded-lg bg-szn-text-1 px-4 py-2 text-sm font-medium text-szn-bg hover:opacity-90"
            >
              {t.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-10 pt-16">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase text-szn-accent">{AUTHOR_PRICE_LOCK_VERSION} author launch pricing</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-szn-text-1 md:text-5xl">
                Author memory plans for launch teams
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-szn-text-2 md:text-lg">
                Choose a managed token cap, connect Stripe Checkout, and cut managed usage costs by adding your own Anthropic key.
              </p>
            </div>

            <div className="inline-flex w-fit rounded-lg border border-szn-border bg-szn-card p-1">
              {(["monthly", "yearly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    cadence === option
                      ? "bg-szn-accent text-white"
                      : "text-szn-text-2 hover:text-szn-text-1"
                  }`}
                >
                  {option}
                  {option === "yearly" ? " save 15%" : ""}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                tier={plan.id}
                cadence={cadence}
                name={plan.label}
                price={yearly ? plan.yearlyUsd : plan.monthlyUsd}
                tokenCap={plan.tokenCapMonth}
                features={PLAN_FEATURES[plan.id]}
                recommended={plan.recommended}
                byokRequired={plan.byokRequired}
              />
            ))}
          </div>
        </section>

        <section className="border-y border-szn-border bg-szn-surface/40 px-6 py-10">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            <LaunchNote title="BYOK discount" body="Active Anthropic BYOK applies the SEIZN_BYOK_50 coupon to the Stripe customer or subscription." />
            <LaunchNote title="Metered overage" body="Managed token overage is reported to the configured Stripe billing meter when a cap is exceeded." />
            <LaunchNote title="Trial visibility" body="Dashboard billing shows renewal, cancellation, and D-3 trial state from the synced subscription." />
          </div>
        </section>

        {faq ? (
          <section className="mx-auto max-w-3xl px-6 py-16">
            <h2 className="text-3xl font-semibold text-szn-text-1">{faq.title}</h2>
            <div className="mt-6 space-y-3">
              {faq.questions.slice(0, 4).map((item, index) => (
                <details key={index} className="rounded-lg border border-szn-border bg-szn-card p-4">
                  <summary className="cursor-pointer text-sm font-medium text-szn-text-1">{item.q}</summary>
                  <p className="mt-3 text-sm leading-6 text-szn-text-2">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-szn-border px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-szn-text-2 md:flex-row md:items-center md:justify-between">
          <Link href={`/${locale}`} className="font-medium text-szn-text-1">Seizn</Link>
          <span>{t.footer.copyright.replace("{year}", new Date().getFullYear().toString())}</span>
          <nav className="flex gap-5">
            <a href={`/${locale}/privacy`} className="hover:text-szn-text-1">{t.footer.privacy}</a>
            <a href={`/${locale}/terms`} className="hover:text-szn-text-1">{t.footer.terms}</a>
            <a href="mailto:sales@seizn.com" className="hover:text-szn-text-1">{t.footer.contact}</a>
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
  recommended,
  byokRequired,
}: {
  tier: AuthorBillingTier;
  cadence: BillingCadence;
  name: string;
  price: number;
  tokenCap: number | null;
  features: string[];
  recommended?: boolean;
  byokRequired?: boolean;
}) {
  return (
    <article className={`flex h-full flex-col rounded-lg border bg-szn-card p-5 ${
      recommended ? "border-szn-accent shadow-sm" : "border-szn-border"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-szn-text-1">{name}</h2>
        {recommended ? (
          <span className="rounded-full bg-szn-accent/10 px-2.5 py-1 text-xs font-medium text-szn-accent">
            Most common
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold text-szn-text-1">${formatUsd(price)}</span>
          <span className="text-sm text-szn-text-2">/{cadence === "monthly" ? "mo" : "yr"}</span>
        </div>
        <p className="mt-2 text-sm text-szn-text-2">
          {tokenCap ? `${formatTokenCap(tokenCap)} managed tokens monthly` : "Unlimited managed tokens"}
        </p>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-6 text-szn-text-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-szn-accent" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {byokRequired ? (
        <p className="mt-5 rounded-lg bg-szn-surface px-3 py-2 text-xs text-szn-text-2">
          BYOK is required before production Enterprise use.
        </p>
      ) : null}

      <CheckoutButton
        tier={tier}
        cadence={cadence}
        successUrl="/dashboard/billing?success=true"
        cancelUrl="/pricing"
        className={`mt-6 w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
          recommended
            ? "bg-szn-accent text-white hover:bg-szn-accent/90"
            : "border border-szn-border text-szn-text-1 hover:bg-szn-surface"
        }`}
      >
        Start {name}
      </CheckoutButton>
    </article>
  );
}

function LaunchNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-szn-text-1">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-szn-text-2">{body}</p>
    </div>
  );
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function formatTokenCap(value: number): string {
  return value >= 1_000_000 ? `${value / 1_000_000}M` : value.toLocaleString();
}
