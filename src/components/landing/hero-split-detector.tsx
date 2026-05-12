"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { CheckoutButton } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import type { Locale } from "@/i18n/config";
import type { AuthorLandingCopy } from "./author-landing-copy";
import { SeiznLockup } from "./brand-marks";
import { ConflictDetector } from "./conflict-detector";

const HERO_PLANS = ["indie", "pro", "studio"] as const satisfies AuthorBillingTier[];

export function HeroSplitDetector({
  copy,
  locale,
  isAuthenticated = false,
}: {
  copy: AuthorLandingCopy;
  locale: Locale;
  isAuthenticated?: boolean;
}) {
  const [selectedPlan, setSelectedPlan] = useState<AuthorBillingTier>("indie");
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const plan = AUTHOR_BILLING_TIERS[selectedPlan];
  const price = cadence === "yearly" ? plan.yearlyUsd : plan.monthlyUsd;

  return (
    <section className="relative overflow-hidden" style={{ background: "var(--ink-900)" }}>
      <LandingNav copy={copy} locale={locale} isAuthenticated={isAuthenticated} />
      <div className="author-shell grid gap-10 px-4 py-14 sm:px-6 md:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:py-20 xl:px-0">
        <div className="min-w-0 text-[var(--ink-0)]">
          <Link
            href={`/${locale}/api`}
            className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-opacity hover:opacity-80"
            style={{
              borderColor: "oklch(0.71 0.16 39 / 0.4)",
              background: "oklch(0.71 0.16 39 / 0.12)",
              color: "oklch(0.78 0.14 39)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "oklch(0.78 0.14 39)" }} />
            New · Seizn API + MCP server is live →
          </Link>
          <p className="author-eyebrow mb-5" style={{ color: "oklch(1 0 0 / 0.58)" }}>
            {copy.hero.eyebrow}
          </p>
          <h1 className="author-serif text-[length:var(--t-display)]" style={{ color: "var(--ink-0)" }}>
            {copy.hero.title}
            <br />
            <em className="font-normal">{copy.hero.italic}</em>
            <br />
            {copy.hero.titleEnd}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 md:text-lg" style={{ color: "oklch(1 0 0 / 0.74)", textWrap: "pretty" }}>
            {copy.hero.subtitle}
          </p>

          <CharacterChipStrip />
          <PlanPicker
            copy={copy}
            locale={locale}
            selectedPlan={selectedPlan}
            setSelectedPlan={setSelectedPlan}
            cadence={cadence}
            setCadence={setCadence}
            checkoutLabel={`${copy.hero.startPlan} ${plan.label} - $${formatUsd(price)}${cadence === "yearly" ? "/yr" : "/mo"}`}
          />

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm" style={{ color: "oklch(1 0 0 / 0.54)" }}>
            <span>{copy.hero.trialNote}</span>
            <span className="h-1 w-1 rounded-full" style={{ background: "oklch(1 0 0 / 0.32)" }} />
            <span>{copy.hero.byokNote}</span>
          </div>
        </div>

        <div className="min-w-0 lg:justify-self-end">
          <ConflictDetector compact />
        </div>
      </div>
    </section>
  );
}

function LandingNav({
  copy,
  locale,
  isAuthenticated,
}: {
  copy: AuthorLandingCopy;
  locale: Locale;
  isAuthenticated: boolean;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="relative z-50 border-b" aria-label="Main navigation" style={{ borderColor: "oklch(1 0 0 / 0.08)" }}>
      <div className="author-shell flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-0">
        <Link href={`/${locale}`} className="inline-flex min-h-11 items-center">
          <SeiznLockup tone="light" />
        </Link>
        <div className="hidden items-center gap-7 lg:flex">
          <a href="#workflow" className="text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.66)" }}>
            {copy.nav.workflow}
          </a>
          <Link href={`/${locale}/demo`} className="text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.66)" }}>
            {copy.nav.demo}
          </Link>
          <a href="#pricing" className="text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.66)" }}>
            {copy.nav.pricing}
          </a>
          <Link href={`/${locale}/docs`} className="text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.66)" }}>
            {copy.nav.docs}
          </Link>
          <LanguageSwitcher currentLocale={locale} variant="dark" />
          <span className="h-5 w-px" style={{ background: "oklch(1 0 0 / 0.12)" }} />
          <Link
            href={isAuthenticated ? "/dashboard/author" : "/login"}
            className="text-sm font-medium"
            style={{ color: "oklch(1 0 0 / 0.72)" }}
          >
            {isAuthenticated ? "Dashboard" : copy.nav.signIn}
          </Link>
          <Link
            href={isAuthenticated ? "/dashboard/author" : "/signup"}
            className="author-btn px-4 py-2 text-sm"
            style={{ background: "var(--ink-0)", color: "var(--ink-900)" }}
          >
            {isAuthenticated ? "Open workspace" : copy.nav.start}
          </Link>
        </div>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border lg:hidden"
          style={{ borderColor: "oklch(1 0 0 / 0.12)", background: "oklch(1 0 0 / 0.06)", color: "var(--ink-0)" }}
          aria-label={copy.nav.menu}
          aria-controls="author-mobile-menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      </div>
      {mobileMenuOpen ? (
        <div
          id="author-mobile-menu"
          className="border-t lg:hidden"
          style={{ borderColor: "oklch(1 0 0 / 0.08)", background: "var(--ink-900)" }}
        >
          <div className="author-shell grid gap-1 px-4 py-3 sm:px-6">
            <a href="#workflow" onClick={closeMobileMenu} className="min-h-11 py-3 text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.78)" }}>
              {copy.nav.workflow}
            </a>
            <Link href={`/${locale}/demo`} onClick={closeMobileMenu} className="min-h-11 py-3 text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.78)" }}>
              {copy.nav.demo}
            </Link>
            <a href="#pricing" onClick={closeMobileMenu} className="min-h-11 py-3 text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.78)" }}>
              {copy.nav.pricing}
            </a>
            <Link href={`/${locale}/docs`} onClick={closeMobileMenu} className="min-h-11 py-3 text-sm font-medium" style={{ color: "oklch(1 0 0 / 0.78)" }}>
              {copy.nav.docs}
            </Link>
            <div className="py-2">
              <LanguageSwitcher currentLocale={locale} variant="dark" align="left" fullWidth />
            </div>
            <Link
              href={isAuthenticated ? "/dashboard/author" : "/login"}
              onClick={closeMobileMenu}
              className="min-h-11 py-3 text-sm font-medium"
              style={{ color: "oklch(1 0 0 / 0.78)" }}
            >
              {isAuthenticated ? "Dashboard" : copy.nav.signIn}
            </Link>
            <Link
              href={isAuthenticated ? "/dashboard/author" : "/signup"}
              onClick={closeMobileMenu}
              className="author-btn mt-2 min-h-11 justify-center px-4 py-2 text-sm"
              style={{ background: "var(--ink-0)", color: "var(--ink-900)" }}
            >
              {isAuthenticated ? "Open workspace" : copy.nav.start}
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function CharacterChipStrip() {
  const chips = [
    { label: "Han Iseul", tone: "canon" },
    { label: "Jeong Serin", tone: "canon" },
    { label: "Yun Hana", tone: "conflict" },
    { label: "Park Jio", tone: "canon" },
  ];

  return (
    <div
      className="mt-7 flex gap-2 overflow-x-auto border-y py-3 lg:hidden"
      style={{ borderColor: "oklch(1 0 0 / 0.08)", scrollbarWidth: "none" }}
      data-testid="character-chip-strip"
    >
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="author-mono inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px]"
          style={{ borderColor: "oklch(1 0 0 / 0.10)", background: "oklch(1 0 0 / 0.06)", color: "oklch(1 0 0 / 0.86)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: chip.tone === "conflict" ? "var(--signal-conflict)" : "var(--signal-canon)" }}
          />
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function PlanPicker({
  copy,
  locale,
  selectedPlan,
  setSelectedPlan,
  cadence,
  setCadence,
  checkoutLabel,
}: {
  copy: AuthorLandingCopy;
  locale: Locale;
  selectedPlan: AuthorBillingTier;
  setSelectedPlan: (tier: AuthorBillingTier) => void;
  cadence: BillingCadence;
  setCadence: (cadence: BillingCadence) => void;
  checkoutLabel: string;
}) {
  return (
    <div className="mt-8" data-testid="hero-plan-picker">
      <div
        className="grid gap-1.5 rounded-[var(--radius-md)] border p-1 lg:inline-flex"
        style={{ borderColor: "oklch(1 0 0 / 0.09)", background: "oklch(1 0 0 / 0.04)" }}
      >
        {HERO_PLANS.map((tier) => {
          const plan = AUTHOR_BILLING_TIERS[tier];
          const active = selectedPlan === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setSelectedPlan(tier)}
              aria-pressed={active}
              className="min-h-11 rounded-[var(--radius-md)] px-3.5 text-left text-sm font-medium lg:text-center"
              style={{
                background: active ? "var(--ink-0)" : "transparent",
                color: active ? "var(--ink-900)" : "oklch(1 0 0 / 0.72)",
              }}
            >
              {plan.label}
              <span className="author-mono ml-2 text-[11px]" style={{ color: active ? "var(--ink-500)" : "oklch(1 0 0 / 0.45)" }}>
                ${plan.monthlyUsd}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] lg:flex lg:flex-wrap lg:items-center">
        <div
          style={
            {
              "--szn-text-2": "oklch(1 0 0 / 0.72)",
              "--checkout-link-color": "var(--signal-canon)",
            } as CSSProperties
          }
        >
          <CheckoutButton
            tier={selectedPlan}
            cadence={cadence}
            successUrl="/dashboard/author/settings?section=billing&success=true"
            cancelUrl={`/${locale}/pricing`}
            privacyHref={`/${locale}/legal/privacy`}
            termsHref={`/${locale}/legal/terms`}
            legalCopy={copy.checkout}
            className="author-btn min-h-12 w-full bg-[color:var(--ink-0)] px-5 py-3 text-sm text-[color:var(--ink-900)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            disabled={false}
          >
            {checkoutLabel}
          </CheckoutButton>
        </div>
        <button
          type="button"
          onClick={() => setCadence(cadence === "monthly" ? "yearly" : "monthly")}
          aria-pressed={cadence === "yearly"}
          className="author-btn min-h-11 border px-4 text-sm"
          style={{ borderColor: "oklch(1 0 0 / 0.18)", color: "oklch(1 0 0 / 0.86)" }}
        >
          <span
            className="relative h-4 w-7 rounded-full"
            style={{ background: cadence === "yearly" ? "var(--signal-canon)" : "oklch(1 0 0 / 0.18)" }}
          >
            <span
              className="absolute top-0.5 h-3 w-3 rounded-full transition-[left]"
              style={{ left: cadence === "yearly" ? 14 : 2, background: "var(--ink-0)" }}
            />
          </span>
          {copy.hero.yearly}
        </button>
      </div>
    </div>
  );
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}
