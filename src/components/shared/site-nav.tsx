"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/config";

type NavLabels = Partial<{
  docs: string;
  pricing: string;
  compare: string;
  enterprise: string;
  github: string;
  status: string;
  cta: string;
}>;

type LandingNavProps = {
  locale: Locale;
  labels?: NavLabels;
  ctaHref?: string;
  ctaLabel?: string;
};

function label(labels: NavLabels | undefined, key: keyof NavLabels, fallback: string) {
  return labels?.[key] ?? fallback;
}

export function LandingNav({
  locale,
  labels,
  ctaHref,
  ctaLabel,
}: LandingNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const ctaText = ctaLabel ?? label(labels, "cta", "Book a demo");
  const ctaTarget = ctaHref ?? `/${locale}/enterprise`;

  const navLinks = [
    { href: `/${locale}/docs`, label: label(labels, "docs", "Docs") },
    { href: `/${locale}/pricing`, label: label(labels, "pricing", "Pricing") },
    { href: `/${locale}/comparison`, label: label(labels, "compare", "Compare") },
    { href: `/${locale}/enterprise`, label: label(labels, "enterprise", "Enterprise") },
    { href: `/${locale}/status`, label: label(labels, "status", "Status") },
  ];

  return (
    <nav className="sticky left-0 right-0 top-0 z-50 border-b border-szn-border-subtle bg-szn-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <Image
              src="/icons/seizn-mark.svg"
              alt="Seizn"
              className="h-7 w-7"
              width={28}
              height={28}
              priority
            />
            <span className="text-[15px] font-medium text-szn-text-1">Seizn</span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1"
              >
                {item.label}
              </Link>
            ))}
            <a
              href="https://github.com/seizn-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1"
            >
              {label(labels, "github", "GitHub")}
            </a>
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher currentLocale={locale} />
          <Link href={ctaTarget} className="szn-btn-glass px-4 py-2 text-[13px]">
            {ctaText}
          </Link>
        </div>

        <button
          type="button"
          className="p-2 text-szn-text-2 md:hidden"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="site-nav-mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div
        id="site-nav-mobile-menu"
        className={`overflow-hidden border-t border-szn-border-subtle bg-szn-bg transition-all duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? "max-h-[460px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-3 px-4 py-4">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block py-2.5 text-sm text-szn-text-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/seizn-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="block py-2.5 text-sm text-szn-text-2"
          >
            {label(labels, "github", "GitHub")}
          </a>
          <div className="border-t border-szn-border-subtle pt-2">
            <LanguageSwitcher currentLocale={locale} />
          </div>
          <Link
            href={ctaTarget}
            className="szn-btn-glass mt-3 w-full"
            onClick={() => setMobileMenuOpen(false)}
          >
            {ctaText}
          </Link>
        </div>
      </div>
    </nav>
  );
}
