import Link from "next/link";
import Image from "next/image";
import type { JSX, SVGProps } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { ExtremeHomepageClient } from "./index";
import {
  getTrustContent,
  getSectionContent,
  type TrustKey,
} from "./feature-translations";

// =============================================================================
// Icons — Existing
// =============================================================================

function GovernanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function SecurityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function RateLimitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AuditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

// =============================================================================
// Icons — New
// =============================================================================

function DatabaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function CertificateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function PlugIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function getSectionCopy(locale: Locale) {
  return getSectionContent(locale);
}

// =============================================================================
// Trust & Compliance
// =============================================================================

const TRUST_ITEMS: {
  key: TrustKey;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
}[] = [
  { key: "rls", icon: SecurityIcon },
  { key: "rate-limits", icon: RateLimitIcon },
  { key: "audit", icon: AuditIcon },
  { key: "soc2", icon: CertificateIcon },
];

function TrustAndCompliance({ locale }: { locale: Locale }) {
  const copy = getSectionCopy(locale);
  return (
    <section className="py-16 px-4 sm:px-6 border-t border-szn-border-subtle">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <h2 className="text-xl font-semibold text-szn-text-1 mb-1">
              {copy.trustTitle}
            </h2>
            <p className="text-sm text-szn-text-2">
              {copy.trustSubtitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-8">
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon;
            const content = getTrustContent(locale, item.key);
            return (
              <div key={item.key} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-szn-text-1 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm text-szn-text-1">{content.title}</div>
                  <div className="text-xs text-szn-text-2 mt-0.5 leading-relaxed">{content.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Pricing CTA
// =============================================================================

function PricingCTA({ locale, t }: { locale: Locale; t: Dictionary }) {
  const copy = getSectionCopy(locale);
  return (
    <section className="py-24 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-szn-text-1 mb-4">
          {t.extremeHome?.pricingCta?.title || copy.pricingTitle}
        </h2>
        <p className="text-szn-text-2 mb-10 max-w-xl mx-auto leading-relaxed">
          {t.extremeHome?.pricingCta?.subtitle || copy.pricingSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={`/${locale}/pricing`}
            className="inline-flex items-center justify-center px-6 py-3 bg-szn-text-1 text-szn-bg font-medium rounded-lg hover:bg-szn-text-1/90 transition-colors"
          >
            {t.extremeHome?.pricingCta?.viewPricing || "See Plans & Pricing"}
          </Link>
          <Link
            href={`/${locale}/enterprise`}
            className="inline-flex items-center justify-center px-6 py-3 border border-szn-border text-szn-text-1 font-medium rounded-lg hover:border-szn-text-3 hover:bg-szn-surface-1 transition-colors"
          >
            {t.extremeHome?.pricingCta?.contactSales || "Talk to Sales"}
          </Link>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Footer
// =============================================================================

function Footer({ locale, t }: { locale: Locale; t: Dictionary }) {
  const copy = getSectionCopy(locale);
  return (
    <footer className="pt-12 pb-8 px-4 sm:px-6">
      {/* Gradient divider */}
      <div className="max-w-6xl mx-auto mb-12">
        <div className="h-px bg-gradient-to-r from-transparent via-szn-border to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Main footer grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href={`/${locale}`} className="flex items-center gap-2 mb-3">
              <Image
                src="/seizn-icon.svg"
                alt="Seizn"
                className="w-6 h-6"
                width={24}
                height={24}
                priority={false}
                unoptimized
              />
              <span className="font-semibold text-szn-text-1">Seizn</span>
            </Link>
            <p className="text-sm text-szn-text-2 leading-relaxed">
              {copy.footerTagline}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold text-szn-text-1 uppercase tracking-wider mb-3">{copy.productLabel}</h4>
            <ul className="space-y-2.5">
              <li><Link href={`/${locale}/docs`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.docs || "Docs"}</Link></li>
              <li><Link href={`/${locale}/pricing`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.pricing || "Pricing"}</Link></li>
              <li><Link href={`/${locale}/comparison`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.compare || copy.compareLabel}</Link></li>
              <li><Link href={`/${locale}/docs/limits`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.limits || "Limits"}</Link></li>
              <li><Link href={`/${locale}/docs/integrations`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{copy.mcpServerLabel}</Link></li>
              <li><Link href="/status" className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.status || "Status"}</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold text-szn-text-1 uppercase tracking-wider mb-3">{copy.resourcesLabel}</h4>
            <ul className="space-y-2.5">
              <li><Link href={`/${locale}/help`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.help || "Help"}</Link></li>
              <li><Link href={`/${locale}/enterprise`} className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.enterprise || "Enterprise"}</Link></li>
              <li>
                <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                  {copy.githubLabel}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-szn-text-1 uppercase tracking-wider mb-3">{copy.legalLabel}</h4>
            <ul className="space-y-2.5">
              <li><Link href="/terms" className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.footer?.terms || "Terms"}</Link></li>
              <li><Link href="/privacy" className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.footer?.privacy || "Privacy"}</Link></li>
              <li><Link href="/refund" className="text-sm text-szn-text-2 hover:text-[color:var(--theme-primary)] transition-colors">{t.footer?.contact || "Refund"}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-szn-border">
          <div className="text-sm text-szn-text-3 text-center">
            {t.footer?.copyright?.replace('{year}', new Date().getFullYear().toString()) || `\u00A9 ${new Date().getFullYear()} Seizn. All rights reserved.`}
          </div>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// Why Seizn for NPCs (NPC-memory pivot, reads from dict.extremeHome.whySeizn)
// =============================================================================

function WhySeiznForNpcs({ dict }: { dict: Dictionary }) {
  const w = dict.extremeHome?.whySeizn;
  if (!w) return null;
  const cards = [
    {
      icon: PlugIcon,
      title: w.tracingTitle,
      desc: w.tracingDesc,
      badge: w.tracingBadge,
    },
    {
      icon: DatabaseIcon,
      title: w.autopilotTitle,
      desc: w.autopilotDesc,
      badge: w.autopilotBadge,
    },
    {
      icon: GovernanceIcon,
      title: w.governanceTitle,
      desc: w.governanceDesc,
      badge: w.governanceBadge,
    },
  ];
  return (
    <section className="py-24 px-4 sm:px-6 border-t border-szn-border-subtle">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-szn-text-1 mb-4">
            {w.title}
          </h2>
          <p className="text-szn-text-2 leading-relaxed">
            {w.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-szn-border-subtle border border-szn-border-subtle rounded-xl overflow-hidden">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="bg-szn-bg p-8">
                <Icon className="w-5 h-5 text-szn-text-1 mb-6" />
                <h3 className="text-base font-semibold text-szn-text-1 mb-2">{c.title}</h3>
                <p className="text-szn-text-2 text-sm leading-relaxed mb-4">{c.desc}</p>
                <div className="text-xs font-mono uppercase tracking-wider text-szn-text-3">{c.badge}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Page Composition
// =============================================================================

interface ExtremeHomepageProps {
  dict: Dictionary;
  locale: Locale;
}

export function ExtremeHomepage({ dict, locale }: ExtremeHomepageProps) {
  return (
    <div className="min-h-screen bg-szn-bg">
      <ExtremeHomepageClient messages={dict.extremeHome} locale={locale} />
      <WhySeiznForNpcs dict={dict} />
      <TrustAndCompliance locale={locale} />
      <PricingCTA locale={locale} t={dict} />
      <Footer locale={locale} t={dict} />
    </div>
  );
}
