import Link from "next/link";
import Image from "next/image";
import type { SVGProps } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { ExtremeHomepageClient } from "./index";

function TracingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function AutopilotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function GovernanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function LessGlueIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
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

function WhySeizn({ t }: { t: Dictionary }) {
  return (
    <section className="py-16 px-4 sm:px-6 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t.extremeHome?.whySeizn?.title || "Why Seizn vs LangChain + Pinecone?"}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            {t.extremeHome?.whySeizn?.subtitle || "Stop gluing together fragmented tools. Get everything you need in one integrated stack."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4">
              <TracingIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.tracingTitle || "Built-in Tracing + Eval"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.tracingDesc || "Every request is traced by default. Run evals, detect regressions, and debug production issues without adding LangSmith or custom logging."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.tracingBadge || "Default ON"}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
              <AutopilotIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.autopilotTitle || "Budget-aware Autopilot"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.autopilotDesc || "Set a latency or cost budget, and Autopilot automatically chooses the optimal retrieval strategy. No manual tuning required."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.autopilotBadge || "Optional"}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center mb-4">
              <GovernanceIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.governanceTitle || "Governance + Audit Logs"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.governanceDesc || "PII detection, GDPR-compliant forget, and complete audit trails. Built for teams who need compliance, not bolted on later."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.governanceBadge || "Default for Teams"}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-4">
              <LessGlueIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.lessGlueTitle || "Fewer Moving Parts"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.lessGlueDesc || "No more juggling LangChain + Pinecone + LangSmith + custom PII filters. One SDK, one dashboard, one bill."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.lessGlueBadge || "Less Glue Code"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBadges({ t }: { t: Dictionary }) {
  return (
    <section className="py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <SecurityIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{t.extremeHome?.trust?.security || "RLS + Key Hashing"}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t.extremeHome?.trust?.securityDesc || "Secure by default"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <RateLimitIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{t.extremeHome?.trust?.rateLimits || "Rate Limits"}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t.extremeHome?.trust?.rateLimitsDesc || "Usage alerts"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <AuditIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{t.extremeHome?.trust?.auditLogs || "Audit Logs"}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t.extremeHome?.trust?.auditLogsDesc || "Full traceability"}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingCTA({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <section className="py-16 px-4 sm:px-6 bg-[#0B1220] text-[#EAF0FF]">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-semibold mb-4">{t.extremeHome?.pricingCta?.title || "Simple, transparent pricing"}</h2>
        <p className="text-[#EAF0FF]/70 mb-8">
          {t.extremeHome?.pricingCta?.subtitle || "Start free, scale as you grow. No hidden fees."}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/pricing`}
            className="px-8 py-3 bg-gradient-to-r from-emerald-500/90 to-teal-600/90 backdrop-blur-sm text-white font-medium rounded-full hover:from-emerald-500 hover:to-teal-600 transition-all shadow-lg shadow-emerald-500/20"
          >
            {t.extremeHome?.pricingCta?.viewPricing || "View Pricing"}
          </Link>
          <Link
            href={`/${locale}/enterprise`}
            className="px-8 py-3 border border-[#EAF0FF]/30 bg-white/5 backdrop-blur-sm text-[#EAF0FF] font-medium rounded-full hover:bg-[#EAF0FF]/15 hover:border-[#EAF0FF]/40 transition-all"
          >
            {t.extremeHome?.pricingCta?.contactSales || "Contact Sales"}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <footer className="py-12 px-4 sm:px-6 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start justify-between gap-8">
        <div className="flex flex-col gap-2">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <Image
              src="/seizn-icon.svg"
              alt="Seizn"
              className="w-6 h-6"
              width={24}
              height={24}
              priority={false}
              unoptimized
            />
            <span className="font-medium text-gray-900 dark:text-gray-100">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {t.footer?.copyright?.replace('{year}', new Date().getFullYear().toString()) || `© ${new Date().getFullYear()} Seizn. All rights reserved.`}
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-6">
          <Link href="/docs" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.extremeHome?.nav?.docs || "Docs"}</Link>
          <Link href={`/${locale}/docs/limits`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.extremeHome?.nav?.limits || "Limits"}</Link>
          <Link href="/status" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.extremeHome?.nav?.status || "Status"}</Link>
          <Link href={`/${locale}/help`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.extremeHome?.nav?.help || "Help"}</Link>
          <a href="https://github.com/seizn" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">GitHub</a>
          <Link href="/terms" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.footer?.terms || "Terms"}</Link>
          <Link href="/privacy" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.footer?.privacy || "Privacy"}</Link>
          <Link href="/refund" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t.footer?.contact || "Refund"}</Link>
        </nav>
      </div>
    </footer>
  );
}

interface ExtremeHomepageProps {
  dict: Dictionary;
  locale: Locale;
}

export function ExtremeHomepage({ dict, locale }: ExtremeHomepageProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ExtremeHomepageClient dict={dict} locale={locale} />
      <WhySeizn t={dict} />
      <TrustBadges t={dict} />
      <PricingCTA locale={locale} t={dict} />
      <Footer locale={locale} t={dict} />
    </div>
  );
}
