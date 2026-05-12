"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { SeiznLockup } from "@/components/landing/brand-marks";
import {
  AUTHOR_BILLING_TIERS,
  CHARTER_WINDOW_END_AT,
  type AuthorBillingTier,
  type AuthorBillingTierConfig,
  type BillingCadence,
  type BillingColumn,
} from "@/lib/stripe-config";
import type { Locale } from "@/i18n/config";
import { formatTokenLabel, formatUsd } from "@/components/landing/section-pricing";
import type { PricingPageCopy } from "./pricing-copy";
import { PricingTrack2Section } from "./pricing-track2-section";
import { PricingTrack3Section } from "./pricing-track3-section";

interface PricingClientProps {
  locale: Locale;
  copy: PricingPageCopy;
}

const TIERS = ["indie", "pro", "studio", "enterprise"] as const satisfies readonly AuthorBillingTier[];
type PricingTrack = "web" | "api" | "program";
const dateFormatterOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
} as const satisfies Intl.DateTimeFormatOptions;

interface PricePair {
  /** Charter (discounted) price in USD. Falls back to regular if Charter is null. */
  active: number;
  /** Regular (post-Charter) price for strikethrough display. */
  regular: number;
  /** True when the active price is the Charter price (different from regular). */
  isCharter: boolean;
}

function trackFromLocationHash(): PricingTrack {
  if (typeof window === "undefined") return "web";
  if (window.location.hash === "#track-2") return "api";
  if (window.location.hash === "#track-3") return "program";
  return "web";
}

function resolvePricePair(
  tier: AuthorBillingTierConfig,
  column: BillingColumn,
  cadence: BillingCadence,
): PricePair {
  if (column === 'managed') {
    if (cadence === 'monthly') {
      return {
        active: tier.managedMonthlyCharterUsd ?? tier.managedMonthlyUsd,
        regular: tier.managedMonthlyUsd,
        isCharter: tier.managedMonthlyCharterUsd != null && tier.managedMonthlyCharterUsd !== tier.managedMonthlyUsd,
      };
    }
    return {
      active: tier.managedAnnualCharterUsd ?? tier.managedAnnualUsd,
      regular: tier.managedAnnualUsd,
      isCharter: tier.managedAnnualCharterUsd != null && tier.managedAnnualCharterUsd !== tier.managedAnnualUsd,
    };
  }
  // BYOK column.
  if (cadence === 'monthly') {
    return {
      active: tier.byokMonthlyCharterUsd ?? tier.byokMonthlyUsd ?? tier.managedMonthlyUsd,
      regular: tier.byokMonthlyUsd ?? tier.managedMonthlyUsd,
      isCharter:
        tier.byokMonthlyCharterUsd != null &&
        tier.byokMonthlyUsd != null &&
        tier.byokMonthlyCharterUsd !== tier.byokMonthlyUsd,
    };
  }
  return {
    active: tier.byokAnnualCharterUsd ?? tier.byokAnnualUsd ?? tier.managedAnnualUsd,
    regular: tier.byokAnnualUsd ?? tier.managedAnnualUsd,
    isCharter:
      tier.byokAnnualCharterUsd != null &&
      tier.byokAnnualUsd != null &&
      tier.byokAnnualCharterUsd !== tier.byokAnnualUsd,
  };
}

export function PricingClient({ locale, copy }: PricingClientProps) {
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const [column, setColumn] = useState<BillingColumn>("managed");
  const [activeTrack, setActiveTrack] = useState<PricingTrack>("web");
  const plans = useMemo(() => TIERS.map((tier) => AUTHOR_BILLING_TIERS[tier]), []);
  const charterEnd = useMemo(
    () => new Intl.DateTimeFormat(locale, dateFormatterOptions).format(new Date(CHARTER_WINDOW_END_AT)),
    [locale],
  );

  useEffect(() => {
    const syncTrackFromHash = () => {
      setActiveTrack(trackFromLocationHash());
    };

    syncTrackFromHash();
    const delayedSyncs = [0, 50, 250, 750].map((delay) => window.setTimeout(syncTrackFromHash, delay));
    window.addEventListener("hashchange", syncTrackFromHash);
    window.addEventListener("popstate", syncTrackFromHash);
    window.addEventListener("pageshow", syncTrackFromHash);
    return () => {
      delayedSyncs.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("hashchange", syncTrackFromHash);
      window.removeEventListener("popstate", syncTrackFromHash);
      window.removeEventListener("pageshow", syncTrackFromHash);
    };
  }, []);

  const selectTrack = (track: PricingTrack) => {
    setActiveTrack(track);
    if (typeof window === "undefined") return;
    const hash = track === "api" ? "#track-2" : track === "program" ? "#track-3" : "#track-1";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  };

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
            <Link href={`/${locale}/api`} className="hidden text-sm md:block" style={{ color: "var(--ink-600)" }}>
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

            <div className="flex flex-col gap-3 sm:items-end">
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
              {activeTrack === "web" ? (
                <div className="inline-grid w-full gap-1 rounded-[var(--radius-md)] border p-1 sm:w-fit sm:grid-cols-2" style={{ borderColor: "var(--ink-200)", background: "var(--ink-50)" }}>
                  {(["managed", "byok"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setColumn(option)}
                      className="min-h-11 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium"
                      style={{
                        background: column === option ? "var(--ink-900)" : "transparent",
                        color: column === option ? "var(--ink-0)" : "var(--ink-600)",
                      }}
                    >
                      {option === "managed" ? "Managed" : "BYOK"}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-xs" style={{ color: "var(--ink-500)" }}>
                Charter pricing through {charterEnd}
              </p>
            </div>
          </div>
        </section>

        {/* Track tab nav (W3.1) — anchor-jump between Track 1 / 2 / 3 sections */}
        <nav aria-label="Pricing tracks" className="px-4 sm:px-6 lg:px-8">
          <div className="author-shell flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: "var(--ink-200)" }}>
            <button
              type="button"
              onClick={() => selectTrack("web")}
              className="inline-flex min-h-10 items-center rounded-full px-4 py-2 text-sm transition-colors"
              style={{
                background: activeTrack === "web" ? "var(--ink-100)" : "transparent",
                color: activeTrack === "web" ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeTrack === "web" ? 600 : 400,
              }}
            >
              Web (Author Memory)
            </button>
            <button
              type="button"
              onClick={() => selectTrack("api")}
              className="inline-flex min-h-10 items-center rounded-full px-4 py-2 text-sm transition-colors"
              style={{
                background: activeTrack === "api" ? "var(--ink-100)" : "transparent",
                color: activeTrack === "api" ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeTrack === "api" ? 600 : 400,
              }}
            >
              API · MCP
            </button>
            <button
              type="button"
              onClick={() => selectTrack("program")}
              className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors"
              style={{
                background: activeTrack === "program" ? "var(--ink-100)" : "transparent",
                color: activeTrack === "program" ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeTrack === "program" ? 600 : 400,
              }}
            >
              Program
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--sev-p2-bg)", color: "var(--sev-p2-text)" }}>
                Soon
              </span>
            </button>
          </div>
        </nav>

        {activeTrack === "web" ? (
          <>
            <section id="track-1" className="px-4 pb-16 pt-8 sm:px-6 lg:px-8">
              <div className="author-shell grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {plans.map((plan) => {
                  const pair = resolvePricePair(plan, plan.byokOnly && column === 'byok' ? 'managed' : column, cadence);
                  return (
                    <PricingCard
                      key={plan.id}
                      tier={plan.id}
                      cadence={cadence}
                      column={plan.byokOnly ? 'managed' : column}
                      name={plan.label}
                      price={pair.active}
                      regularPrice={pair.regular}
                      isCharter={pair.isCharter}
                      tokenCap={plan.tokenCapMonth}
                      features={copy.features[plan.id]}
                      blurb={copy.blurbs[plan.id]}
                      recommended={plan.recommended}
                      byokRequired={plan.byokRequired}
                      locale={locale}
                      copy={copy}
                    />
                  );
                })}
              </div>
            </section>

            <section className="border-y px-4 py-10 sm:px-6 lg:px-8" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
              <div className="author-shell grid gap-5 md:grid-cols-3">
                {copy.launchNotes.map((note) => (
                  <LaunchNote key={note.title} title={note.title} body={note.body} />
                ))}
              </div>
            </section>
          </>
        ) : null}

        {activeTrack === "api" ? (
          <PricingTrack2Section locale={locale} cadence={cadence} checkoutCopy={copy.checkout} />
        ) : null}

        {activeTrack === "program" ? (
          <section id="track-3" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
            <PricingTrack3Section locale={locale} />
          </section>
        ) : null}

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
          <span>{copy.footer.copyright.replace("{year}", new Date().getUTCFullYear().toString())}</span>
          <nav className="flex flex-wrap gap-5" aria-label="Pricing footer">
            <a href={`/${locale}/legal/privacy`} className="hover:underline">{copy.footer.privacy}</a>
            <a href={`/${locale}/legal/terms`} className="hover:underline">{copy.footer.terms}</a>
            <a href={`/${locale}/legal/beta-disclosure`} className="hover:underline">{copy.footer.beta}</a>
            <a href="mailto:support@seizn.com" className="hover:underline">{copy.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function PricingCard({
  tier,
  cadence,
  column,
  name,
  price,
  regularPrice,
  isCharter,
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
  column: BillingColumn;
  name: string;
  price: number;
  regularPrice: number;
  isCharter: boolean;
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
        <div className="flex items-baseline gap-2">
          {isCharter && regularPrice !== price ? (
            <span
              className="text-base line-through"
              style={{ color: recommended ? "oklch(1 0 0 / 0.62)" : "var(--ink-400)" }}
              aria-label={`Regular price ${formatUsd(regularPrice)}`}
            >
              ${formatUsd(regularPrice)}
            </span>
          ) : null}
          <span className="text-4xl font-semibold">${formatUsd(price)}</span>
          <span className="text-sm" style={{ color: recommended ? "oklch(1 0 0 / 0.62)" : "var(--ink-500)" }}>
            / {cadence === "monthly" ? copy.card.monthly : copy.card.yearly}
          </span>
        </div>
        {isCharter ? (
          <p className="author-mono mt-1 text-[10px] uppercase tracking-wide" style={{ color: recommended ? "var(--signal-canon)" : "var(--signal-canon-ink)" }}>
            Charter pricing
          </p>
        ) : null}
        <p className="author-mono mt-2 text-[11px]" style={{ color: recommended ? "oklch(1 0 0 / 0.58)" : "var(--ink-500)" }}>
          {formatTokenLabel(tokenCap)} · {column === 'managed' ? 'Managed LLM' : 'Bring your own key'}
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
          column={column}
          successUrl="/dashboard/author/settings?section=billing&success=true"
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
