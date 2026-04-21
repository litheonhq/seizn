"use client";

import { useState, useEffect, Suspense, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Brain, GitFork, Send } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { analytics } from "@/lib/analytics";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import type { RequestConfig } from "./snippet-tabs";
import { SnippetSkeleton } from "./loading-skeleton";
import { MenuIcon, CloseIcon } from "./icons";

const SnippetTabs = dynamic(
  () => import("./snippet-tabs").then((mod) => ({ default: mod.SnippetTabs })),
  { loading: () => <SnippetSkeleton />, ssr: false }
);

const HeroGraphAnimation = dynamic(
  () => import("./hero-graph-animation").then((mod) => ({ default: mod.HeroGraphAnimation })),
  { ssr: false }
);

type ExtremeHomeMessages = NonNullable<Dictionary["extremeHome"]>;

interface ExtremeHomepageClientProps {
  messages: Dictionary["extremeHome"];
  locale: Locale;
}

const DEFAULT_CONFIG: RequestConfig = {
  query: "How does the NPC remember our past encounter?",
  dataset: "npc-memory",
  budgetMs: 500,
  hybridSearch: true,
  rerank: true,
  answerContract: false,
  topK: 5,
};

// =============================================================================
// Memory ticker — live-feel metrics under hero
// =============================================================================

const MEMORY_TICKER_ITEMS: Array<{ label: string; value: string }> = [
  { label: "ENTITIES ACTIVE", value: "1,284,910" },
  { label: "RECALL P95", value: "142ms" },
  { label: "CACHE HIT", value: "96.7%" },
  { label: "CROSS-GEN RETAIN", value: "98.2%" },
  { label: "LIVE SESSIONS", value: "8,409" },
  { label: "GRAPH NODES", value: "41.7M" },
];

function MemoryTicker() {
  const items = [...MEMORY_TICKER_ITEMS, ...MEMORY_TICKER_ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-szn-border-subtle bg-szn-surface-1">
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-szn-bg to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-szn-bg to-transparent" />
      <div className="szn-marquee py-4">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline gap-3 whitespace-nowrap">
            <span className="szn-eyebrow">{item.label}</span>
            <span className="font-mono text-szn-text-1 text-sm tabular-nums">{item.value}</span>
            <span className="text-szn-text-3">·</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactPlaygroundPreview({ locale }: { locale: Locale }) {
  return (
    <section className="border-t border-szn-border-subtle bg-szn-surface-1 px-6 py-20 sm:px-8">
      <div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <div>
          <div className="szn-section-number mb-6">03 / LIVE PLAYGROUND</div>
          <h2 className="szn-serif text-[clamp(32px,4vw,54px)] leading-[1.05] text-szn-text-1">
            Watch an NPC form memory in one turn.
          </h2>
          <p className="mt-5 max-w-[48ch] text-[15px] leading-[1.6] text-szn-text-2">
            Archivist Vale runs through the same public memory route, rate limits, canon locks, and usage ledger your own NPCs use.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/playground`}
              onClick={() => analytics.featureUsed("extreme_home_playground_preview_clicked", { target: "playground" })}
              className="szn-btn-signal"
            >
              Open playground
              <Send className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/signup?plan=free&template=archivist-vale&npc=archivist_vale&source=homepage"
              onClick={() => analytics.featureUsed("extreme_home_playground_fork_clicked", { target: "signup" })}
              className="szn-btn-ghost"
            >
              Fork Vale
              <GitFork className="h-4 w-4 opacity-70" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-szn-border-subtle bg-szn-bg p-4 shadow-2xl shadow-black/20 sm:grid-cols-[1fr_0.82fr]">
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-szn-signal">
                  Archivist Vale
                </p>
                <p className="mt-1 text-sm text-szn-text-2">Drowned archive scene</p>
              </div>
              <span className="rounded-sm bg-szn-signal/10 px-2 py-1 font-mono text-[11px] text-szn-signal">
                live
              </span>
            </div>
            <div className="space-y-3">
              <div className="ml-auto max-w-[82%] rounded-md bg-szn-signal px-3 py-2 text-sm text-szn-signal-fg">
                Last time you promised to hide a brass key for me.
              </div>
              <div className="max-w-[88%] rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-szn-text-1">
                I will index that promise and check it against the locks before I hand you a door.
              </div>
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-szn-text-1">
              <Brain className="h-4 w-4 text-szn-signal" aria-hidden="true" />
              Memory formed
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <span className="rounded-sm bg-szn-signal/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-szn-signal">
                experience
              </span>
              <p className="mt-3 text-sm leading-6 text-szn-text-1">
                Visitor scene memory: Last time Vale promised to hide a brass key.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["playground", "keys", "promise"].map((tag) => (
                  <span key={tag} className="rounded-sm border border-white/10 px-2 py-1 text-[11px] text-szn-text-3">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Navigation
// =============================================================================

const Navigation = memo(function Navigation({
  locale,
  mobileMenuOpen,
  setMobileMenuOpen,
  t,
}: {
  locale: Locale;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  t: ExtremeHomeMessages;
}) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-szn-bg/80 backdrop-blur-xl border-b border-szn-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <Image
              src="/seizn-icon.svg"
              alt="Seizn"
              className="w-7 h-7"
              width={28}
              height={28}
              priority
              unoptimized
            />
            <span className="font-medium text-[15px] tracking-[-0.01em] text-szn-text-1">Seizn</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            <Link href={`/${locale}/docs`} className="text-[13px] text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t.nav?.docs || "Docs"}
            </Link>
            <Link href={`/${locale}/pricing`} className="text-[13px] text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t.nav?.pricing || "Pricing"}
            </Link>
            <Link href={`/${locale}/comparison`} className="text-[13px] text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t.nav?.compare || "Compare"}
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-[13px] text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t.nav?.enterprise || "Enterprise"}
            </Link>
            <a
              href="https://github.com/seizn-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.github || "GitHub"}
            </a>
            <Link href="/status" className="text-[13px] text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t.nav?.status || "Status"}
            </Link>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href={`/${locale}/enterprise`}
            className="text-[13px] font-medium px-4 py-2 rounded-md bg-szn-signal text-szn-signal-fg hover:bg-szn-signal-hover transition-colors"
          >
            {t.nav?.getApiKey || "Book a demo"}
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden p-2 text-szn-text-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen ? "true" : "false"}
          aria-controls="extreme-home-mobile-menu"
        >
          {mobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
      </div>

      <div
        id="extreme-home-mobile-menu"
        className={`md:hidden bg-szn-bg border-t border-szn-border-subtle overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 py-4 space-y-3">
          <Link href={`/${locale}/docs`} className="block py-2.5 text-sm text-szn-text-2">{t.nav?.docs || "Docs"}</Link>
          <Link href={`/${locale}/pricing`} className="block py-2.5 text-sm text-szn-text-2">{t.nav?.pricing || "Pricing"}</Link>
          <Link href={`/${locale}/comparison`} className="block py-2.5 text-sm text-szn-text-2">{t.nav?.compare || "Compare"}</Link>
          <Link href={`/${locale}/enterprise`} className="block py-2.5 text-sm text-szn-text-2">{t.nav?.enterprise || "Enterprise"}</Link>
          <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="block py-2.5 text-sm text-szn-text-2">{t.nav?.github || "GitHub"}</a>
          <Link href="/status" className="block py-2.5 text-sm text-szn-text-2">{t.nav?.status || "Status"}</Link>
          <div className="pt-2 border-t border-szn-border-subtle">
            <LanguageSwitcher currentLocale={locale} />
          </div>
          <Link href={`/${locale}/enterprise`} className="block w-full text-center bg-szn-signal text-szn-signal-fg font-medium py-3 rounded-md mt-3">
            {t.nav?.getApiKey || "Book a demo"}
          </Link>
        </div>
      </div>
    </nav>
  );
});

// =============================================================================
// Hero — Editorial serif H1 + italic accent + living graph ambient
// =============================================================================

// Sorted longest-first so "NPCs" matches before "NPC". Module-level so the
// React Compiler can preserve referential stability across renders.
const ITALIC_CANDIDATES = [
  "characters",
  "character",
  "NPCs",
  "NPC",
  "npcs",
  "npc",
  "agents",
  "agent",
  "캐릭터",
  "에이전트",
] as const;

function pickItalicWord(heroTitle: string): { before: string; word: string; after: string } {
  for (const c of ITALIC_CANDIDATES) {
    const idx = heroTitle.indexOf(c);
    if (idx !== -1) {
      return {
        before: heroTitle.slice(0, idx),
        word: heroTitle.slice(idx, idx + c.length),
        after: heroTitle.slice(idx + c.length),
      };
    }
  }
  return { before: heroTitle, word: "", after: "" };
}

export function ExtremeHomepageClient({ messages, locale }: ExtremeHomepageClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHeroMotionReady, setIsHeroMotionReady] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const enableHeroMotion = () => setIsHeroMotionReady(true);

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(enableHeroMotion, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(enableHeroMotion, 250);
    }
    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  const t = (messages ?? {}) as ExtremeHomeMessages;

  // Hero title — the accent word renders in italic serif. Kept as a plain call
  // so React Compiler can auto-memoize; no manual useMemo needed.
  const heroTitle = t.heroTitle || "Memory for the characters you ship.";
  const italicPick = pickItalicWord(heroTitle);

  return (
    // Force dark on the whole marketing page. Tokens resolve against the dark palette.
    <div className="dark bg-szn-bg text-szn-text-1 min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-szn-signal focus:text-szn-signal-fg"
      >
        Skip to main content
      </a>

      <Navigation
        locale={locale}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        t={t}
      />

      <main id="main-content">
        {/* Hero */}
        <section className="relative min-h-[92vh] flex items-center overflow-hidden">
          {/* Ambient graph canvas */}
          <div className="absolute inset-0 z-[0] pointer-events-none" aria-hidden="true">
            {isHeroMotionReady ? <HeroGraphAnimation /> : null}
          </div>

          {/* Plasma signal glow */}
          <div className="absolute inset-0 z-[0] szn-glow-signal opacity-60 pointer-events-none" aria-hidden="true" />

          {/* Subtle grid */}
          <div
            className="absolute inset-0 z-[0] opacity-[0.025] pointer-events-none"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          {/* Top fade */}
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-szn-bg to-transparent z-[1] pointer-events-none" />

          <div className="relative z-10 w-full pt-28 lg:pt-36 pb-20 lg:pb-28 px-6 sm:px-8">
            <div className="max-w-[1100px] mx-auto">
              <Image
                src="/brand/seizn-stacked-1024.png"
                alt="Seizn"
                width={480}
                height={640}
                priority
                className="mb-10 h-auto w-[min(68vw,300px)] sm:w-[360px]"
              />

              {/* Eyebrow */}
              <div className="flex items-center gap-4 mb-8">
                <span className="szn-section-number">01 / MEMORY LAYER</span>
              </div>

              {/* Editorial H1 */}
              <h1 className="szn-serif text-[clamp(52px,8.2vw,124px)] text-szn-text-1 leading-[0.96] mb-10 max-w-[14ch]">
                {italicPick.word ? (
                  <>
                    <span>{italicPick.before}</span>
                    <em className="italic text-szn-signal font-normal">{italicPick.word}</em>
                    <span>{italicPick.after}</span>
                  </>
                ) : (
                  heroTitle
                )}
              </h1>

              {/* Lede */}
              <p className="text-[17px] sm:text-lg text-szn-text-2 max-w-[58ch] leading-[1.55] mb-12">
                {t.heroSubtitle ||
                  "Seizn is the persistence layer for AI characters — entity memory, relationship graphs, and cross-generation recall that plug into Inworld, Convai, or any LLM runtime."}
              </p>

              {/* CTAs */}
              <div className={`flex items-center gap-3 flex-wrap ${isHeroMotionReady ? "animate-fade-in-up animate-delay-300" : ""}`}>
                <Link
                  href={`/${locale}/docs`}
                  onClick={() => analytics.featureUsed("extreme_home_primary_cta_clicked", { target: "docs" })}
                  className="szn-btn-signal"
                >
                  {t.ctaStart || "Start building"}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href={`/${locale}/playground`}
                  onClick={() => analytics.featureUsed("extreme_home_demo_cta_clicked", { target: "playground" })}
                  className="szn-btn-ghost"
                >
                  {t.ctaDemo || "Play the demo"}
                  <Send className="h-4 w-4 opacity-70" aria-hidden="true" />
                </Link>
              </div>

              {/* Social proof line */}
              <div className={`flex items-center gap-3 mt-10 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-400" : ""}`}>
                <span className="szn-signal-dot" aria-hidden="true" />
                <span className="text-[13px] text-szn-text-2 font-mono tracking-tight">
                  {t.socialProof || "Built for studios scaling from 10 to 10,000 NPCs."}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom fade into ticker */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-szn-bg to-transparent z-[1] pointer-events-none" />
        </section>

        {/* Live memory ticker */}
        <MemoryTicker />

        <CompactPlaygroundPreview locale={locale} />

        {/* Integration / code snippet */}
        <section className="py-24 px-6 sm:px-8 border-t border-szn-border-subtle">
          <div className="max-w-[1100px] mx-auto">
            <div className="mb-12 max-w-2xl">
              <div className="szn-section-number mb-6">04 / INTEGRATION</div>
              <h2 className="szn-serif text-[clamp(32px,4.2vw,56px)] text-szn-text-1 leading-[1.05] mb-5">
                {t.copySnippetTitle || "Drop into Unity, Unreal, or any runtime."}
              </h2>
              <p className="text-szn-text-2 text-[15px] leading-[1.6]">
                {t.copySnippetSubtitle || "HTTP wrapper and official C# / C++ / TS plugins. No custom infrastructure — ship in an afternoon."}
              </p>
            </div>
            <Suspense fallback={<SnippetSkeleton />}>
              <SnippetTabs config={DEFAULT_CONFIG} />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
