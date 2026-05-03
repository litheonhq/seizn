import Link from "next/link";
import type { SVGProps } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { ExtremeHomepageClient } from "./index";
import { SeiznMark } from "@/components/landing/brand-marks";
import {
  getFeatureContent,
  getMCPFeatureContent,
  getTrustContent,
  getSectionContent,
  type FeatureKey,
  type MCPFeatureKey,
  type TrustKey,
} from "./feature-translations";

// =============================================================================
// Icons — Existing
// =============================================================================

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

function ComplianceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ForgetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

// =============================================================================
// Feature Showcase (replaces WhySeizn)
// =============================================================================

const FEATURES: {
  key: FeatureKey;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  badgeColor: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    key: "semantic-memory",
    icon: DatabaseIcon,
    badgeColor: "emerald",
    gradient: "from-szn-accent to-szn-accent-2",
    iconBg: "bg-szn-accent/10",
    iconColor: "text-szn-accent",
  },
  {
    key: "finops",
    icon: AutopilotIcon,
    badgeColor: "blue",
    gradient: "from-blue-400 to-cyan-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "compliance",
    icon: ComplianceIcon,
    badgeColor: "indigo",
    gradient: "from-indigo-400 to-indigo-600",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    key: "observability",
    icon: TracingIcon,
    badgeColor: "purple",
    gradient: "from-purple-400 to-purple-600",
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    key: "policy-engine",
    icon: GovernanceIcon,
    badgeColor: "rose",
    gradient: "from-rose-400 to-rose-600",
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
    iconColor: "text-rose-600 dark:text-rose-400",
  },
  {
    key: "one-sdk",
    icon: LessGlueIcon,
    badgeColor: "amber",
    gradient: "from-amber-400 to-amber-600",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
];

const BADGE_COLORS: Record<string, string> = {
  emerald: "bg-szn-accent/10 text-szn-accent",
  rose: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  indigo: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400",
  amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
};

function getSectionCopy(locale: Locale) {
  return getSectionContent(locale);
}

function FeatureShowcase({ locale }: { locale: Locale }) {
  const copy = getSectionCopy(locale);
  return (
    <section className="py-20 px-4 sm:px-6 bg-szn-bg/80">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-szn-surface text-xs font-medium text-szn-text-2 mb-4">
            <AutopilotIcon className="w-3.5 h-3.5" />
            {copy.platformCapabilities}
          </div>
          <h2 className="text-3xl font-semibold text-szn-text-1 mb-4">
            {copy.platformTitle}
          </h2>
          <p className="text-szn-text-2 max-w-2xl mx-auto">
            {copy.platformSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const content = getFeatureContent(locale, f.key);
            return (
              <div key={f.key} className="szn-card szn-card-hover rounded-2xl p-6 overflow-hidden relative">
                <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${f.gradient}`} />
                <div className={`w-12 h-12 ${f.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${f.iconColor}`} />
                </div>
                <h3 className="text-lg font-semibold text-szn-text-1 mb-2">{content.title}</h3>
                <p className="text-szn-text-2 text-sm leading-relaxed">{content.desc}</p>
                <div className="mt-4">
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${BADGE_COLORS[f.badgeColor]}`}>{content.badge}</span>
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
// MCP & Developer Tools
// =============================================================================

function PlugIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function SyncIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function KeyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

const MCP_FEATURES: {
  key: MCPFeatureKey;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  editors: string[];
}[] = [
  {
    key: "mcp-server",
    icon: TerminalIcon,
    editors: ["Claude Code", "Cursor", "Windsurf", "Copilot", "Cline", "Aider", "Codex"],
  },
  {
    key: "config-sync",
    icon: SyncIcon,
    editors: ["CLAUDE.md", "AGENTS.md", ".cursorrules", ".windsurfrules"],
  },
  {
    key: "oauth-device",
    icon: KeyIcon,
    editors: ["RFC 8628", "Zero-copy Auth"],
  },
  {
    key: "auto-context",
    icon: PlugIcon,
    editors: ["Auto-detect", "Webhooks", "MCP Resources"],
  },
];

function MCPDeveloperTools({ locale }: { locale: Locale }) {
  const copy = getSectionCopy(locale);
  return (
    <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-szn-surface to-szn-bg">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-szn-accent/10 text-xs font-medium text-szn-accent mb-4">
            <TerminalIcon className="w-3.5 h-3.5" />
            {copy.mcpTools}
          </div>
          <h2 className="text-3xl font-semibold text-szn-text-1 mb-4">
            {copy.mcpTitle}
          </h2>
          <p className="text-szn-text-2 max-w-2xl mx-auto">
            {copy.mcpSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {MCP_FEATURES.map((f) => {
            const Icon = f.icon;
            const content = getMCPFeatureContent(locale, f.key);
            return (
              <div key={f.key} className="szn-card szn-card-hover rounded-2xl p-6 overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-szn-accent to-szn-accent-2" />
                <div className="w-12 h-12 bg-szn-accent/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-szn-accent" />
                </div>
                <h3 className="text-lg font-semibold text-szn-text-1 mb-2">{content.title}</h3>
                <p className="text-szn-text-2 text-sm leading-relaxed mb-4">{content.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.editors.map((e) => (
                    <span key={e} className="text-xs font-medium px-2 py-0.5 rounded bg-szn-surface text-szn-text-1">{e}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <Link
            href={`/${locale}/docs/integrations`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-szn-accent hover:bg-szn-accent/90 text-white font-medium rounded-full transition-colors"
          >
            {copy.setupMcp}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="mt-3 text-sm text-szn-text-2">
            {copy.mcpHint}
          </p>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Trust & Compliance (replaces TrustBadges)
// =============================================================================

const TRUST_ITEMS: {
  key: TrustKey;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  color: string;
}[] = [
  { key: "rls", icon: SecurityIcon, color: "emerald" },
  { key: "owasp", icon: ShieldCheckIcon, color: "rose" },
  { key: "rate-limits", icon: RateLimitIcon, color: "blue" },
  { key: "audit", icon: AuditIcon, color: "purple" },
  { key: "eu-ai-act", icon: GlobeIcon, color: "indigo" },
  { key: "gdpr", icon: ForgetIcon, color: "rose" },
  { key: "soc2", icon: CertificateIcon, color: "amber" },
  { key: "iso42001", icon: GovernanceIcon, color: "emerald" },
];

const TRUST_ICON_STYLES: Record<string, { bg: string; text: string }> = {
  emerald: { bg: "bg-szn-accent/10", text: "text-szn-accent" },
  rose: { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-600 dark:text-rose-400" },
  blue: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" },
  indigo: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-600 dark:text-indigo-400" },
  amber: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
};

function TrustAndCompliance({ locale }: { locale: Locale }) {
  const copy = getSectionCopy(locale);
  return (
    <section className="py-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-szn-text-1 mb-2">
            {copy.trustTitle}
          </h2>
          <p className="text-sm text-szn-text-2">
            {copy.trustSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon;
            const style = TRUST_ICON_STYLES[item.color];
            const content = getTrustContent(locale, item.key);
            return (
              <div key={item.key} className="szn-card rounded-xl p-5 text-center">
                <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center mx-auto mb-3`}>
                  <Icon className={`w-5 h-5 ${style.text}`} />
                </div>
                <div className="font-medium text-sm text-szn-text-1">{content.title}</div>
                <div className="text-xs text-szn-text-2 mt-1">{content.desc}</div>
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
    <section className="py-20 px-4 sm:px-6 bg-[#0B1220] text-[#EAF0FF] relative overflow-hidden">
      {/* Radial glow accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-szn-accent/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="max-w-4xl mx-auto text-center relative">
        <h2 className="text-3xl sm:text-4xl font-semibold mb-4">
          {t.extremeHome?.pricingCta?.title || copy.pricingTitle}
        </h2>
        <p className="text-[#EAF0FF]/60 mb-10 max-w-lg mx-auto">
          {t.extremeHome?.pricingCta?.subtitle || copy.pricingSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/pricing`}
            className="px-8 py-3.5 bg-gradient-to-r from-szn-accent to-szn-accent-2 text-white font-medium rounded-full hover:-translate-y-0.5 transition-all shadow-lg shadow-szn-accent/25 hover:shadow-xl hover:shadow-szn-accent/30"
          >
            {t.extremeHome?.pricingCta?.viewPricing || "See Plans & Pricing"}
          </Link>
          <Link
            href={`/${locale}/enterprise`}
            className="px-8 py-3.5 border border-[#EAF0FF]/20 bg-white/5 backdrop-blur-sm text-[#EAF0FF] font-medium rounded-full hover:bg-[#EAF0FF]/10 hover:border-[#EAF0FF]/40 hover:-translate-y-0.5 transition-all"
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
              <span aria-label="Seizn" className="w-6 h-6 inline-flex items-center justify-center">
                <SeiznMark size={24} color="var(--ink-900)" />
              </span>
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
      <FeatureShowcase locale={locale} />
      <MCPDeveloperTools locale={locale} />
      <TrustAndCompliance locale={locale} />
      <PricingCTA locale={locale} t={dict} />
      <Footer locale={locale} t={dict} />
    </div>
  );
}
