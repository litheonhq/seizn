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
// Icons — monochrome stroke only, no fill
// =============================================================================

function GovernanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function SecurityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function RateLimitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AuditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function DatabaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function CertificateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function PlugIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function getSectionCopy(locale: Locale) {
  return getSectionContent(locale);
}

// =============================================================================
// 02 / RECALL — "What an NPC remembers"
// Editorial narrative + 3 memory entries styled like an archive log.
// Copy is intentionally evocative and locale-agnostic.
// =============================================================================

type RecallEntry = {
  stamp: string;
  entity: string;
  kind: "EVENT" | "FACT" | "RELATION";
  body: string;
  recalled: string;
};

const RECALL_ENTRIES: RecallEntry[] = [
  {
    stamp: "2024-11-03T19:42Z",
    entity: "elder/marun",
    kind: "EVENT",
    body: "The traveler returned the stolen seal. I said nothing, but I owe them.",
    recalled: "43 sessions later · on player re-entry",
  },
  {
    stamp: "2024-12-14T03:10Z",
    entity: "merchant/silas",
    kind: "FACT",
    body: "They once paid in counterfeit coin. I now check every purse twice.",
    recalled: "persists across NPC generation v12 → v14",
  },
  {
    stamp: "2025-02-21T22:55Z",
    entity: "guard/lia",
    kind: "RELATION",
    body: "My captain trusts them. That is enough reason to let them through the inner gate.",
    recalled: "propagated to 4 related NPCs in the faction graph",
  },
];

function RecallSection({ locale }: { locale: Locale }) {
  // Optional locale-specific wrapper copy; body stays English for demo clarity.
  const headings: Partial<Record<Locale, { eyebrow: string; title: string; italic: string; sub: string }>> = {
    en: {
      eyebrow: "02 / RECALL",
      title: "What a character {italic} remembers",
      italic: "actually",
      sub: "Not a transcript. Not a vector dump. Structured memories — events, facts, relationships — scoped to the character and retrievable at the speed of runtime.",
    },
    ko: {
      eyebrow: "02 / RECALL",
      title: "캐릭터는 {italic} 기억한다",
      italic: "진짜로",
      sub: "대화 로그가 아닙니다. 임베딩 덩어리도 아닙니다. 사건·사실·관계로 구조화된 기억을, 캐릭터 단위로 저장하고 런타임 속도로 불러옵니다.",
    },
    ja: {
      eyebrow: "02 / RECALL",
      title: "キャラクターは{italic}記憶する",
      italic: "ほんとうに",
      sub: "トランスクリプトでも、ベクター・ダンプでもありません。イベント・事実・関係を構造化した記憶を、キャラクター単位でランタイム速度で呼び出します。",
    },
  };
  const h = headings[locale] ?? headings.en!;
  const [before, after] = h.title.split("{italic}");

  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 border-t border-szn-border-subtle">
      <div className="max-w-[1100px] mx-auto">
        <div className="max-w-2xl mb-16">
          <div className="szn-section-number mb-6">{h.eyebrow}</div>
          <h2 className="szn-serif text-[clamp(36px,5vw,68px)] text-szn-text-1 leading-[1.02] mb-6">
            {before}
            <em className="italic text-szn-signal font-normal">{h.italic}</em>
            {after}
          </h2>
          <p className="text-szn-text-2 text-[15px] leading-[1.6]">{h.sub}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-szn-border-subtle border-y border-szn-border-subtle">
          {RECALL_ENTRIES.map((entry, i) => (
            <article key={i} className="bg-szn-bg p-7 lg:p-9 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <span className="font-mono text-[11px] text-szn-text-3 tabular-nums">{entry.stamp}</span>
                <span className="font-mono text-[10px] text-szn-signal tracking-[0.22em]">{entry.kind}</span>
              </div>
              <div className="font-mono text-[12px] text-szn-text-3 mb-5 truncate">{entry.entity}</div>
              <blockquote className="szn-serif italic text-[22px] leading-[1.35] text-szn-text-1 mb-6">
                &ldquo;{entry.body}&rdquo;
              </blockquote>
              <div className="mt-auto pt-5 border-t border-szn-border-subtle">
                <div className="szn-eyebrow mb-1">RECALLED</div>
                <div className="text-[13px] text-szn-text-2 leading-snug">{entry.recalled}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// 04 / BUILT FOR CHARACTERS — Why Seizn (restyled)
// =============================================================================

function WhySeiznForNpcs({ dict }: { dict: Dictionary }) {
  const w = dict.extremeHome?.whySeizn;
  if (!w) return null;

  const cards = [
    { icon: PlugIcon, title: w.tracingTitle, desc: w.tracingDesc, badge: w.tracingBadge },
    { icon: DatabaseIcon, title: w.autopilotTitle, desc: w.autopilotDesc, badge: w.autopilotBadge },
    { icon: GovernanceIcon, title: w.governanceTitle, desc: w.governanceDesc, badge: w.governanceBadge },
  ];

  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 border-t border-szn-border-subtle">
      <div className="max-w-[1100px] mx-auto">
        <div className="max-w-2xl mb-16">
          <div className="szn-section-number mb-6">04 / BUILT FOR CHARACTERS</div>
          <h2 className="szn-serif text-[clamp(36px,5vw,68px)] text-szn-text-1 leading-[1.02] mb-6">
            {w.title}
          </h2>
          <p className="text-szn-text-2 text-[15px] leading-[1.6]">{w.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-szn-border-subtle border-y border-szn-border-subtle">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={i}
                className="group relative bg-szn-bg p-8 flex flex-col transition-colors hover:bg-szn-surface-1"
              >
                {/* Signal line on the left — appears on hover */}
                <span
                  className="absolute left-0 top-8 bottom-8 w-px bg-szn-signal-line opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between mb-7">
                  <Icon className="w-5 h-5 text-szn-text-1" />
                  <span className="font-mono text-[10px] text-szn-text-3 tracking-[0.22em]">0{i + 1}</span>
                </div>
                <h3 className="text-[17px] font-medium text-szn-text-1 mb-3 tracking-[-0.01em]">{c.title}</h3>
                <p className="text-szn-text-2 text-[14px] leading-[1.6] mb-6">{c.desc}</p>
                <div className="mt-auto font-mono text-[10px] text-szn-signal tracking-[0.22em] uppercase">
                  {c.badge}
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
// Trust & Compliance — inline row, mono labels
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
    <section className="py-20 px-6 sm:px-8 border-t border-szn-border-subtle">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div className="max-w-xl">
            <div className="szn-eyebrow mb-3">TRUST & COMPLIANCE</div>
            <h2 className="szn-serif text-[28px] sm:text-[36px] text-szn-text-1 leading-[1.1]">
              {copy.trustTitle}
            </h2>
            <p className="text-[14px] text-szn-text-2 mt-3 leading-[1.6]">{copy.trustSubtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-szn-border-subtle border-y border-szn-border-subtle">
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon;
            const content = getTrustContent(locale, item.key);
            return (
              <div key={item.key} className="bg-szn-bg p-6 flex flex-col gap-4">
                <Icon className="w-4 h-4 text-szn-text-1" />
                <div>
                  <div className="text-[13px] font-medium text-szn-text-1 tracking-[-0.005em]">{content.title}</div>
                  <div className="text-[12px] text-szn-text-3 mt-1 leading-[1.55]">{content.desc}</div>
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
// Pricing CTA — editorial quiet hero, plasma signal primary
// =============================================================================

function PricingCTA({ locale, t }: { locale: Locale; t: Dictionary }) {
  const copy = getSectionCopy(locale);
  return (
    <section className="relative py-28 sm:py-36 px-6 sm:px-8 border-t border-szn-border-subtle overflow-hidden">
      <div className="absolute inset-0 szn-glow-signal opacity-40 pointer-events-none" aria-hidden="true" />
      <div className="relative max-w-3xl mx-auto text-center">
        <div className="szn-section-number mb-6 justify-center inline-flex">05 / SHIP IT</div>
        <h2 className="szn-serif text-[clamp(40px,5.6vw,80px)] text-szn-text-1 leading-[1.0] mb-8">
          {t.extremeHome?.pricingCta?.title || copy.pricingTitle}
        </h2>
        <p className="text-szn-text-2 mb-12 max-w-xl mx-auto leading-[1.6] text-[15px]">
          {t.extremeHome?.pricingCta?.subtitle || copy.pricingSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href={`/${locale}/pricing`} className="szn-btn-signal">
            {t.extremeHome?.pricingCta?.viewPricing || "See plans & pricing"}
          </Link>
          <Link href={`/${locale}/enterprise`} className="szn-btn-ghost">
            {t.extremeHome?.pricingCta?.contactSales || "Talk to sales"}
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
    <footer className="pt-16 pb-10 px-6 sm:px-8 border-t border-szn-border-subtle">
      <div className="max-w-[1100px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-14">
          <div className="col-span-2 md:col-span-1">
            <Link href={`/${locale}`} className="flex items-center gap-2 mb-4">
              <Image
                src="/seizn-icon.svg"
                alt="Seizn"
                className="w-6 h-6"
                width={24}
                height={24}
                priority={false}
                unoptimized
              />
              <span className="font-medium text-szn-text-1">Seizn</span>
            </Link>
            <p className="text-[13px] text-szn-text-2 leading-[1.6] max-w-[28ch]">
              {copy.footerTagline}
            </p>
          </div>

          <div>
            <h4 className="szn-eyebrow mb-4">{copy.productLabel}</h4>
            <ul className="space-y-3">
              <li><Link href={`/${locale}/docs`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.docs || "Docs"}</Link></li>
              <li><Link href={`/${locale}/pricing`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.pricing || "Pricing"}</Link></li>
              <li><Link href={`/${locale}/comparison`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.compare || copy.compareLabel}</Link></li>
              <li><Link href={`/${locale}/docs/limits`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.limits || "Limits"}</Link></li>
              <li><Link href={`/${locale}/docs/integrations`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{copy.mcpServerLabel}</Link></li>
              <li><Link href="/status" className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.status || "Status"}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="szn-eyebrow mb-4">{copy.resourcesLabel}</h4>
            <ul className="space-y-3">
              <li><Link href={`/${locale}/help`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.help || "Help"}</Link></li>
              <li><Link href={`/${locale}/enterprise`} className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.extremeHome?.nav?.enterprise || "Enterprise"}</Link></li>
              <li>
                <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors inline-flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                  {copy.githubLabel}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="szn-eyebrow mb-4">{copy.legalLabel}</h4>
            <ul className="space-y-3">
              <li><Link href="/terms" className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.footer?.terms || "Terms"}</Link></li>
              <li><Link href="/privacy" className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.footer?.privacy || "Privacy"}</Link></li>
              <li><Link href="/refund" className="text-[13px] text-szn-text-2 hover:text-szn-signal transition-colors">{t.footer?.contact || "Refund"}</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-szn-border-subtle">
          <div className="text-[12px] font-mono text-szn-text-3 text-center tracking-tight">
            {t.footer?.copyright?.replace('{year}', new Date().getFullYear().toString()) || `\u00A9 ${new Date().getFullYear()} Seizn. All rights reserved.`}
          </div>
        </div>
      </div>
    </footer>
  );
}

// =============================================================================
// Page Composition — dark wrapper, editorial flow
// =============================================================================

interface ExtremeHomepageProps {
  dict: Dictionary;
  locale: Locale;
}

export function ExtremeHomepage({ dict, locale }: ExtremeHomepageProps) {
  return (
    <div className="dark bg-szn-bg text-szn-text-1 min-h-screen">
      <ExtremeHomepageClient messages={dict.extremeHome} locale={locale} />
      <RecallSection locale={locale} />
      <WhySeiznForNpcs dict={dict} />
      <TrustAndCompliance locale={locale} />
      <PricingCTA locale={locale} t={dict} />
      <Footer locale={locale} t={dict} />
    </div>
  );
}
