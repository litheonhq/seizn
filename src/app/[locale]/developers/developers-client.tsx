"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { LandingNav } from "@/components/shared/site-nav";
import { ENGINE_SURFACE_URL } from "@/components/landing/author-landing-copy";

interface DevelopersCopy {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    primaryCtaHref: string;
    secondaryCta: string;
    secondaryCtaHref: string;
  };
  quickstart: {
    title: string;
    subtitle: string;
    steps: Array<{ number: string; title: string; body: string }>;
  };
  code: {
    title: string;
    subtitle: string;
    tabs: { rest: string; mcp: string };
    rest: string;
    mcp: string;
  };
  features: {
    title: string;
    items: Array<{ title: string; body: string }>;
  };
  pricing: {
    title: string;
    subtitle: string;
    cta: string;
    ctaHref: string;
    tiers: Array<{ name: string; price: string; note: string }>;
  };
  faq: {
    title: string;
    items: Array<{ q: string; a: string }>;
  };
}

interface DevelopersClientProps {
  locale: Locale;
  dict: Dictionary;
}

export function DevelopersClient({ locale, dict }: DevelopersClientProps) {
  const copy = (dict as unknown as { developersPage: DevelopersCopy }).developersPage;
  const engineLink = (dict as unknown as { authorLanding: { tracks: { engineLink: { label: string; linkText: string } } } }).authorLanding.tracks.engineLink;
  const [tab, setTab] = useState<"rest" | "mcp">("rest");

  return (
    <div className="min-h-screen" style={{ background: "var(--ink-0)", color: "var(--ink-900)" }}>
      <LandingNav locale={locale} />

      {/* Hero */}
      <section className="border-b" style={{ borderColor: "var(--ink-100)" }}>
        <div className="author-shell py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide" style={{ borderColor: "var(--ink-200)", color: "var(--ink-600)" }}>
              {copy.hero.eyebrow}
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={{ color: "var(--ink-900)" }}>
              {copy.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-7" style={{ color: "var(--ink-600)" }}>
              {copy.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/${locale}${copy.hero.primaryCtaHref}`}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-5 py-3 text-sm font-medium"
                style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}
              >
                {copy.hero.primaryCta}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href={`/${locale}${copy.hero.secondaryCtaHref}`}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-5 py-3 text-sm font-medium"
                style={{ borderColor: "var(--ink-200)", color: "var(--ink-900)" }}
              >
                {copy.hero.secondaryCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Quickstart */}
      <section className="author-section" style={{ background: "var(--ink-50)" }}>
        <div className="author-shell">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
              {copy.quickstart.title}
            </h2>
            <p className="mt-3 text-base" style={{ color: "var(--ink-600)" }}>
              {copy.quickstart.subtitle}
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {copy.quickstart.steps.map((step) => (
              <article
                key={step.number}
                className="rounded-[var(--radius-md)] border p-6"
                style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}
              >
                <div className="text-xs font-mono" style={{ color: "var(--ink-500)" }}>
                  {step.number}
                </div>
                <h3 className="mt-3 text-lg font-medium" style={{ color: "var(--ink-900)" }}>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Code preview with REST/MCP tabs */}
      <section className="author-section">
        <div className="author-shell">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
              {copy.code.title}
            </h2>
            <p className="mt-3 text-base" style={{ color: "var(--ink-600)" }}>
              {copy.code.subtitle}
            </p>
          </div>
          <div className="mt-8">
            <div className="inline-flex rounded-[var(--radius-md)] border p-1" style={{ borderColor: "var(--ink-200)", background: "var(--ink-50)" }}>
              {(["rest", "mcp"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className="rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium transition-colors"
                  style={
                    tab === id
                      ? { background: "var(--ink-900)", color: "var(--ink-0)" }
                      : { background: "transparent", color: "var(--ink-700)" }
                  }
                >
                  {copy.code.tabs[id]}
                </button>
              ))}
            </div>
            <pre
              className="mt-4 overflow-x-auto rounded-[var(--radius-md)] p-6 text-sm leading-6"
              style={{ background: "var(--ink-900)", color: "oklch(1 0 0 / 0.92)" }}
            >
              <code>{tab === "rest" ? copy.code.rest : copy.code.mcp}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="author-section" style={{ background: "var(--ink-50)" }}>
        <div className="author-shell">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
            {copy.features.title}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {copy.features.items.map((item) => (
              <article
                key={item.title}
                className="rounded-[var(--radius-md)] border p-5"
                style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}
              >
                <div className="flex items-start gap-2">
                  <Check size={18} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--ink-900)", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <h3 className="text-base font-medium" style={{ color: "var(--ink-900)" }}>
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                      {item.body}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="author-section">
        <div className="author-shell">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
                {copy.pricing.title}
              </h2>
              <p className="mt-3 text-base" style={{ color: "var(--ink-600)" }}>
                {copy.pricing.subtitle}
              </p>
            </div>
            <Link
              href={`/${locale}${copy.pricing.ctaHref}`}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium underline underline-offset-4"
              style={{ color: "var(--ink-900)", textDecorationColor: "var(--ink-300)" }}
            >
              {copy.pricing.cta}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {copy.pricing.tiers.map((tier) => (
              <div
                key={tier.name}
                className="rounded-[var(--radius-md)] border p-5"
                style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}
              >
                <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-500)" }}>
                  {tier.name}
                </div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: "var(--ink-900)" }}>
                  {tier.price}
                </div>
                <div className="mt-2 text-xs leading-5" style={{ color: "var(--ink-600)" }}>
                  {tier.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="author-section" style={{ background: "var(--ink-50)" }}>
        <div className="author-shell">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
            {copy.faq.title}
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {copy.faq.items.map((item) => (
              <article
                key={item.q}
                className="rounded-[var(--radius-md)] border p-5"
                style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}
              >
                <h3 className="text-base font-medium" style={{ color: "var(--ink-900)" }}>
                  {item.q}
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                  {item.a}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-600)" }}>
            <span>{engineLink.label}</span>
            <a
              href={ENGINE_SURFACE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4"
              style={{ color: "var(--ink-900)", textDecorationColor: "var(--ink-300)" }}
            >
              {engineLink.linkText}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
