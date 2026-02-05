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
    <section className="py-20 px-4 sm:px-6 bg-gray-50/80 dark:bg-gray-900/80">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t.extremeHome?.whySeizn?.title || "Why Seizn vs LangChain + Pinecone?"}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            {t.extremeHome?.whySeizn?.subtitle || "Stop gluing together fragmented tools. Get everything you need in one integrated stack."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card-premium glass-card-hover rounded-2xl p-6 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-400 to-purple-600" />
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4">
              <TracingIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.tracingTitle || "Built-in Tracing + Eval"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.tracingDesc || "Every request is traced by default. Run evals, detect regressions, and debug production issues without adding LangSmith or custom logging."}
            </p>
            <div className="mt-4">
              <span className="text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full">{t.extremeHome?.whySeizn?.tracingBadge || "Default ON"}</span>
            </div>
          </div>

          <div className="glass-card-premium glass-card-hover rounded-2xl p-6 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 to-cyan-500" />
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
              <AutopilotIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.autopilotTitle || "Budget-aware Autopilot"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.autopilotDesc || "Set a latency or cost budget, and Autopilot automatically chooses the optimal retrieval strategy. No manual tuning required."}
            </p>
            <div className="mt-4">
              <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full">{t.extremeHome?.whySeizn?.autopilotBadge || "Optional"}</span>
            </div>
          </div>

          <div className="glass-card-premium glass-card-hover rounded-2xl p-6 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-400 to-rose-600" />
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center mb-4">
              <GovernanceIcon className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.governanceTitle || "Governance + Audit Logs"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.governanceDesc || "PII detection, GDPR-compliant forget, and complete audit trails. Built for teams who need compliance, not bolted on later."}
            </p>
            <div className="mt-4">
              <span className="text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full">{t.extremeHome?.whySeizn?.governanceBadge || "Default for Teams"}</span>
            </div>
          </div>

          <div className="glass-card-premium glass-card-hover rounded-2xl p-6 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-400 to-amber-600" />
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-4">
              <LessGlueIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.extremeHome?.whySeizn?.lessGlueTitle || "Fewer Moving Parts"}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {t.extremeHome?.whySeizn?.lessGlueDesc || "No more juggling LangChain + Pinecone + LangSmith + custom PII filters. One SDK, one dashboard, one bill."}
            </p>
            <div className="mt-4">
              <span className="text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full">{t.extremeHome?.whySeizn?.lessGlueBadge || "Less Glue Code"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBadges({ t }: { t: Dictionary }) {
  return (
    <section className="py-14 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="glass-card-premium rounded-2xl px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-0 sm:divide-x sm:divide-gray-200 sm:dark:divide-gray-700">
            <div className="flex items-center gap-3 sm:px-8">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shadow-sm">
                <SecurityIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t.extremeHome?.trust?.security || "RLS + Key Hashing"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t.extremeHome?.trust?.securityDesc || "Secure by default"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:px-8">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shadow-sm">
                <RateLimitIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t.extremeHome?.trust?.rateLimits || "Rate Limits"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t.extremeHome?.trust?.rateLimitsDesc || "Usage alerts"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:px-8">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shadow-sm">
                <AuditIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t.extremeHome?.trust?.auditLogs || "Audit Logs"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t.extremeHome?.trust?.auditLogsDesc || "Full traceability"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingCTA({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <section className="py-20 px-4 sm:px-6 bg-[#0B1220] text-[#EAF0FF] relative overflow-hidden">
      {/* Radial glow accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="max-w-4xl mx-auto text-center relative">
        <h2 className="text-3xl sm:text-4xl font-semibold mb-4">{t.extremeHome?.pricingCta?.title || "Simple, transparent pricing"}</h2>
        <p className="text-[#EAF0FF]/60 mb-10 max-w-lg mx-auto">
          {t.extremeHome?.pricingCta?.subtitle || "Start free, scale as you grow. No hidden fees."}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/pricing`}
            className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-full hover:-translate-y-0.5 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30"
          >
            {t.extremeHome?.pricingCta?.viewPricing || "View Pricing"}
          </Link>
          <Link
            href={`/${locale}/enterprise`}
            className="px-8 py-3.5 border border-[#EAF0FF]/20 bg-white/5 backdrop-blur-sm text-[#EAF0FF] font-medium rounded-full hover:bg-[#EAF0FF]/10 hover:border-[#EAF0FF]/40 hover:-translate-y-0.5 transition-all"
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
    <footer className="pt-12 pb-8 px-4 sm:px-6">
      {/* Gradient divider */}
      <div className="max-w-6xl mx-auto mb-12">
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
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
              <span className="font-semibold text-gray-900 dark:text-gray-100">Seizn</span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {"Built for agents, governed by design."}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">{"Product"}</h4>
            <ul className="space-y-2.5">
              <li><Link href={`/${locale}/docs`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.docs || "Docs"}</Link></li>
              <li><Link href={`/${locale}/pricing`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.pricing || "Pricing"}</Link></li>
              <li><Link href={`/${locale}/docs/limits`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.limits || "Limits"}</Link></li>
              <li><Link href="/status" className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.status || "Status"}</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">{"Resources"}</h4>
            <ul className="space-y-2.5">
              <li><Link href={`/${locale}/help`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.help || "Help"}</Link></li>
              <li><Link href={`/${locale}/enterprise`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.extremeHome?.nav?.enterprise || "Enterprise"}</Link></li>
              <li>
                <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">{"Legal"}</h4>
            <ul className="space-y-2.5">
              <li><Link href="/terms" className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.footer?.terms || "Terms"}</Link></li>
              <li><Link href="/privacy" className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.footer?.privacy || "Privacy"}</Link></li>
              <li><Link href="/refund" className="text-sm text-gray-500 dark:text-gray-400 hover:text-[color:var(--theme-primary)] transition-colors">{t.footer?.contact || "Refund"}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
          <div className="text-sm text-gray-400 dark:text-gray-500 text-center">
            {t.footer?.copyright?.replace('{year}', new Date().getFullYear().toString()) || `© ${new Date().getFullYear()} Seizn. All rights reserved.`}
          </div>
        </div>
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
