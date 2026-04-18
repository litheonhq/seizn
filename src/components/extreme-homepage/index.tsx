"use client";

import { useState, useEffect, useMemo, Suspense, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { LanguageSwitcher } from "@/components/language-switcher";
import { analytics } from "@/lib/analytics";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import type { RequestConfig } from "./snippet-tabs";
import { SnippetSkeleton } from "./loading-skeleton";
import { MenuIcon, CloseIcon } from "./icons";

// SnippetTabs uses react-syntax-highlighter which is heavy - lazy load it
const SnippetTabs = dynamic(
  () => import("./snippet-tabs").then((mod) => ({ default: mod.SnippetTabs })),
  { loading: () => <SnippetSkeleton />, ssr: false }
);

// Knowledge graph background animation for hero section
const HeroGraphAnimation = dynamic(
  () => import("./hero-graph-animation").then((mod) => ({ default: mod.HeroGraphAnimation })),
  { ssr: false }
);

// Memory pipeline flow animation for hero section
const MemoryFlowAnimation = dynamic(
  () => import("./memory-flow-animation").then((mod) => ({ default: mod.MemoryFlowAnimation })),
  { loading: () => <div className="h-24" />, ssr: false }
);

type ExtremeHomeMessages = NonNullable<Dictionary["extremeHome"]>;

interface ExtremeHomepageClientProps {
  messages: Dictionary["extremeHome"];
  locale: Locale;
}

const SMALLGOD_PLAY_URL = "https://smallgod.app/play?seed=404";

const DEFAULT_CONFIG: RequestConfig = {
  query: "How does the NPC remember our past encounter?",
  dataset: "npc-memory",
  budgetMs: 500,
  hybridSearch: true,
  rerank: true,
  answerContract: false,
  topK: 5,
};

/** Determine seasonal theme class based on current month */
function getSeasonalTheme(): string {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return "theme-spring";
  if (month >= 5 && month <= 7) return "theme-summer";
  if (month >= 8 && month <= 10) return "theme-autumn";
  return "theme-winter";
}

// Memoized Navigation component to prevent unnecessary re-renders
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-szn-bg/95 backdrop-blur-sm border-b border-szn-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + Navigation Links */}
        <div className="flex items-center gap-8">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <Image
              src="/seizn-icon.svg"
              alt="Seizn"
              className="w-8 h-8"
              width={32}
              height={32}
              priority
              unoptimized
            />
            <span className="font-semibold text-xl tracking-tight text-szn-text-1">Seizn</span>
          </Link>

          {/* Desktop Nav - Links next to logo */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href={`/${locale}/docs`}
              className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.docs || "Docs"}
            </Link>
            <Link
              href={`/${locale}/pricing`}
              className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.pricing || "Pricing"}
            </Link>
            <Link
              href={`/${locale}/comparison`}
              className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.compare || "Compare"}
            </Link>
            <Link
              href={`/${locale}/enterprise`}
              className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.enterprise || "Enterprise"}
            </Link>
            <a
              href="https://github.com/seizn-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.github || "GitHub"}
            </a>
            <Link
              href="/status"
              className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t.nav?.status || "Status"}
            </Link>
          </div>
        </div>

        {/* Desktop Nav - Right Side */}
        <div className="hidden md:flex items-center gap-4">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href={`/${locale}/enterprise`}
            className="text-sm bg-gradient-to-r from-szn-accent to-szn-accent-2 text-white px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
          >
            {t.nav?.getApiKey || "Book a demo"}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-szn-text-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="extreme-home-mobile-menu"
        >
          {mobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu - animated */}
      <div
        id="extreme-home-mobile-menu"
        className={`md:hidden bg-szn-bg border-t border-szn-border overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 py-4 space-y-3">
          <Link href={`/${locale}/docs`} className="block py-2.5 text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">
            {t.nav?.docs || "Docs"}
          </Link>
          <Link href={`/${locale}/pricing`} className="block py-2.5 text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">
            {t.nav?.pricing || "Pricing"}
          </Link>
          <Link href={`/${locale}/comparison`} className="block py-2.5 text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">
            {t.nav?.compare || "Compare"}
          </Link>
          <Link href={`/${locale}/enterprise`} className="block py-2.5 text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">
            {t.nav?.enterprise || "Enterprise"}
          </Link>
          <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="block py-2.5 text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">
            {t.nav?.github || "GitHub"}
          </a>
          <Link href="/status" className="block py-2.5 text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">
            {t.nav?.status || "Status"}
          </Link>
          <div className="pt-2 border-t border-szn-border">
            <LanguageSwitcher currentLocale={locale} />
          </div>
          <Link href={`/${locale}/enterprise`} className="block w-full text-center bg-gradient-to-r from-szn-accent to-szn-accent-2 text-white py-3 rounded-full mt-3">
            {t.nav?.getApiKey || "Book a demo"}
          </Link>
        </div>
      </div>
    </nav>
  );
});

export function ExtremeHomepageClient({ messages, locale }: ExtremeHomepageClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHeroMotionReady, setIsHeroMotionReady] = useState(false);

  // Close mobile menu on resize - use passive listener
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const enableHeroMotion = () => setIsHeroMotionReady(true);

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(enableHeroMotion, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(enableHeroMotion, 250);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const t = (messages ?? {}) as ExtremeHomeMessages;
  const seasonalTheme = useMemo(() => getSeasonalTheme(), []);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-gray-900 focus:text-white"
      >
        Skip to main content
      </a>

      {/* Sticky Navigation - Memoized */}
      <Navigation
        locale={locale}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        t={t}
      />

      <main id="main-content">
      {/* Hero Section - Fullscreen background video with text overlay */}
      <section className={`relative min-h-screen flex items-center overflow-hidden ${seasonalTheme}`}>
        {/* Background Video Layer */}
        <div className="absolute inset-0 z-0">
          {/* Video element — replace src with actual mp4/webm when ready */}
          <video
            className="hero-video absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            aria-hidden="true"
          >
            {/* Uncomment and add your video sources when ready:
            <source src="/hero-bg.webm" type="video/webm" />
            <source src="/hero-bg.mp4" type="video/mp4" />
            */}
          </video>

          {/* Animated placeholder gradient (shown until real video is added) */}
          <div className="hero-placeholder absolute inset-0 theme-gradient-bg" aria-hidden="true">
            {/* Animated gradient orbs */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-1/4 -left-1/4 w-[60%] h-[60%] rounded-full bg-[color:var(--theme-primary)]/10 blur-[100px] animate-float-slow" />
              <div className="absolute -bottom-1/4 -right-1/4 w-[50%] h-[50%] rounded-full bg-[color:var(--theme-secondary)]/10 blur-[100px] animate-float-medium" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full bg-[color:var(--theme-accent)]/15 blur-[80px] animate-float-fast" />
            </div>
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 hero-grid-pattern opacity-[0.03] dark:opacity-[0.05]" />
          </div>

          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-szn-bg/60 via-szn-bg/40 to-szn-bg/80" />
        </div>

        {/* Knowledge Graph Animation Layer */}
        <div className="absolute inset-0 z-[1] pointer-events-none" aria-hidden="true">
          {isHeroMotionReady ? <HeroGraphAnimation /> : null}
        </div>

        {/* Content Layer */}
        <div className="relative z-10 w-full pt-24 lg:pt-32 pb-16 lg:pb-24 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* H1 - Category claim */}
            <h1 className="text-[clamp(36px,4.5vw,60px)] font-semibold tracking-tight text-szn-text-1 leading-[1.08]">
              {t.heroTitle || "The standard backend for agent runtime persistence."}
            </h1>

            {/* Subtitle - Value prop */}
            <p className="text-lg lg:text-xl text-szn-text-2 max-w-2xl mx-auto leading-relaxed">
              {t.heroSubtitle || "MCP server, checkpointer, and policy/trace layer\u2014one SDK to persist, govern, and observe every agent session."}
            </p>

            {/* CTAs - Primary and Secondary */}
            <div className={`flex items-center justify-center gap-4 flex-wrap pt-2 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-300" : ""}`}>
              <Link
                href={`/${locale}/docs`}
                onClick={() => analytics.featureUsed("extreme_home_primary_cta_clicked", { target: "docs" })}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                {t.ctaStart || "Start Building Free"}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href={SMALLGOD_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => analytics.featureUsed("extreme_home_demo_cta_clicked", { target: "smallgod" })}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-szn-card/80 backdrop-blur-sm text-szn-text-1 font-medium rounded-xl border border-szn-border/80 hover:border-szn-border hover:bg-szn-card transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t.ctaDemo || "Play smallgod"}
              </a>
            </div>

            {/* Social Proof */}
            <div className={`flex items-center justify-center gap-2 pt-4 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-400" : ""}`}>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-szn-accent opacity-75 ${isHeroMotionReady ? "animate-ping" : ""}`} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-szn-accent" />
              </span>
              <span className="text-sm text-szn-text-2">
                {t.socialProof || "Built for game studios scaling from 10 to 10,000 NPCs."}
              </span>
            </div>

            {/* Memory Flow Pipeline Animation */}
            <div className={`pt-8 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-500" : ""}`}>
              {isHeroMotionReady ? <MemoryFlowAnimation /> : <div className="h-24" aria-hidden="true" />}
            </div>
          </div>
        </div>

        {/* Bottom gradient fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-szn-bg to-transparent z-10 pointer-events-none" />
      </section>


      {/* Drop-in code sample */}
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto szn-card rounded-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-szn-surface mb-3">
              <svg className="w-5 h-5 text-szn-text-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-szn-text-1 mb-2">{t.copySnippetTitle || "Drop into Unity, Unreal, or any runtime"}</h2>
            <p className="text-sm text-szn-text-2">
              {t.copySnippetSubtitle || "HTTP wrapper + official C#/C++ plugins. No custom infrastructure needed."}
            </p>
          </div>
          <Suspense fallback={<SnippetSkeleton />}>
            <SnippetTabs config={DEFAULT_CONFIG} />
          </Suspense>
        </div>
      </section>
      </main>


    </>
  );
}
