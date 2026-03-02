"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

// Get nested value from object using dot notation
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

// Replace {param} placeholders with values
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`;
  });
}

export function LimitsClient({ locale, dictionary }: Props) {
  const currentYear = new Date().getFullYear();

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(dictionary, key);
    if (!value) return key;
    return interpolate(value, params);
  };

  // Plan data
  const plans = [
    {
      name: t("limits.plans.free.name"),
      monthlyQuota: "1,000",
      rps: "10",
      overage: t("limits.plans.free.overage"),
    },
    {
      name: t("limits.plans.plus.name"),
      monthlyQuota: "10,000",
      rps: "50",
      overage: t("limits.plans.plus.overage"),
    },
    {
      name: t("limits.plans.pro.name"),
      monthlyQuota: "100,000",
      rps: "200",
      overage: t("limits.plans.pro.overage"),
    },
    {
      name: t("limits.plans.enterprise.name"),
      monthlyQuota: t("limits.unlimited"),
      rps: t("limits.custom"),
      overage: t("limits.plans.enterprise.overage"),
    },
  ];

  // Response headers
  const headers = [
    {
      name: "x-ratelimit-limit",
      description: t("limits.headers.limit"),
    },
    {
      name: "x-ratelimit-remaining",
      description: t("limits.headers.remaining"),
    },
    {
      name: "x-ratelimit-reset",
      description: t("limits.headers.reset"),
    },
    {
      name: "x-quota-limit",
      description: t("limits.headers.quotaLimit"),
    },
    {
      name: "x-quota-remaining",
      description: t("limits.headers.quotaRemaining"),
    },
    {
      name: "x-quota-reset",
      description: t("limits.headers.quotaReset"),
    },
  ];

  return (
    <div className="min-h-screen bg-szn-bg">
      {/* Header */}
      <header className="border-b border-szn-border sticky top-0 bg-szn-bg/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-szn-text-1">
            Seizn<span className="text-szn-accent">.</span>
          </Link>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/docs`}
              className="text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              {t("docs.nav.dashboard")}
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-szn-accent hover:bg-szn-accent/80 text-white font-medium rounded-lg transition-colors"
            >
              {t("docs.nav.getStarted")}
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 flex gap-12">
        {/* Sidebar Navigation */}
        <nav className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold text-szn-text-3 uppercase tracking-wider mb-3">{t("limits.sidebar.onThisPage")}</p>
            <a href="#quotas" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("limits.sidebar.quotas")}</a>
            <a href="#rate-limits" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("limits.sidebar.rateLimits")}</a>
            <a href="#overage" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("limits.sidebar.overage")}</a>
            <a href="#reset" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("limits.sidebar.reset")}</a>
            <a href="#headers" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("limits.sidebar.headers")}</a>

            <p className="text-xs font-semibold text-szn-text-3 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.resources")}</p>
            <Link href={`/${locale}/docs`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.overview")}</Link>
            <Link href={`/${locale}/docs/faq`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.faq")}</Link>
            <Link href={`/${locale}/pricing`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("nav.pricing")}</Link>
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Hero */}
          <div className="mb-12">
            <nav className="text-sm text-szn-text-3 mb-4">
              <Link href={`/${locale}/docs`} className="hover:text-szn-accent">{t("docs.sidebar.overview")}</Link>
              <span className="mx-2">/</span>
              <span className="text-szn-text-1">{t("limits.title")}</span>
            </nav>
            <h1 className="text-4xl font-bold text-szn-text-1 mb-4">
              {t("limits.title")}
            </h1>
            <p className="text-xl text-szn-text-2 max-w-2xl">
              {t("limits.subtitle")}
            </p>
          </div>

          {/* Monthly Quotas Section */}
          <section id="quotas" className="mb-16">
            <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("limits.quotas.title")}</h2>
            <p className="text-szn-text-2 mb-6">{t("limits.quotas.description")}</p>

            <div className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-szn-surface-1">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("limits.table.plan")}</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("limits.table.monthlyQuota")}</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("limits.table.rps")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-szn-border">
                  {plans.map((plan) => (
                    <tr key={plan.name}>
                      <td className="px-6 py-4 font-medium text-szn-text-1">{plan.name}</td>
                      <td className="px-6 py-4 text-szn-text-2">{plan.monthlyQuota}</td>
                      <td className="px-6 py-4 text-szn-text-2">{plan.rps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Rate Limits Section */}
          <section id="rate-limits" className="mb-16">
            <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("limits.rateLimit.title")}</h2>
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <p className="text-szn-text-1 mb-4">
                {t("limits.rateLimit.description")}
              </p>
              <ul className="space-y-3 text-szn-text-2">
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-szn-text-1">{t("limits.plans.free.name")}:</strong> 10 {t("limits.requestsPerSecond")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-szn-text-1">{t("limits.plans.plus.name")}:</strong> 50 {t("limits.requestsPerSecond")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-szn-text-1">{t("limits.plans.pro.name")}:</strong> 200 {t("limits.requestsPerSecond")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-szn-text-1">{t("limits.plans.enterprise.name")}:</strong> {t("limits.custom")}</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Overage Behavior Section */}
          <section id="overage" className="mb-16">
            <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("limits.overage.title")}</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-300 mb-3">{t("limits.overage.softThrottle.title")}</h3>
                <p className="text-amber-700 dark:text-amber-400 text-sm mb-4">{t("limits.overage.softThrottle.description")}</p>
                <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-400">
                  <li className="flex items-start gap-2">
                    <span>-</span>
                    <span>{t("limits.overage.softThrottle.point1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>-</span>
                    <span>{t("limits.overage.softThrottle.point2")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>-</span>
                    <span>{t("limits.overage.softThrottle.point3")}</span>
                  </li>
                </ul>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-3">{t("limits.overage.hard429.title")}</h3>
                <p className="text-red-700 dark:text-red-400 text-sm mb-4">{t("limits.overage.hard429.description")}</p>
                <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-3">
                  <code className="text-sm text-red-800 dark:text-red-300">
                    HTTP/1.1 429 Too Many Requests
                  </code>
                </div>
                <p className="text-sm text-red-700 dark:text-red-400 mt-3">{t("limits.overage.hard429.recommendation")}</p>
              </div>
            </div>
          </section>

          {/* Reset Times Section */}
          <section id="reset" className="mb-16">
            <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("limits.reset.title")}</h2>
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-szn-text-1 mb-3">{t("limits.reset.monthly.title")}</h3>
                  <p className="text-szn-text-2 text-sm mb-2">{t("limits.reset.monthly.description")}</p>
                  <div className="bg-szn-surface-1 rounded-lg p-3">
                    <code className="text-sm text-szn-text-1">
                      {t("limits.reset.monthly.time")}
                    </code>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-szn-text-1 mb-3">{t("limits.reset.rateLimit.title")}</h3>
                  <p className="text-szn-text-2 text-sm mb-2">{t("limits.reset.rateLimit.description")}</p>
                  <div className="bg-szn-surface-1 rounded-lg p-3">
                    <code className="text-sm text-szn-text-1">
                      {t("limits.reset.rateLimit.time")}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Response Headers Section */}
          <section id="headers" className="mb-16">
            <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("limits.headersSection.title")}</h2>
            <p className="text-szn-text-2 mb-6">{t("limits.headersSection.description")}</p>

            <div className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-szn-surface-1">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("limits.headersSection.header")}</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("limits.headersSection.headerDescription")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-szn-border">
                  {headers.map((header) => (
                    <tr key={header.name}>
                      <td className="px-6 py-4">
                        <code className="text-szn-accent font-mono text-sm">{header.name}</code>
                      </td>
                      <td className="px-6 py-4 text-szn-text-2">{header.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Example Response */}
            <div className="mt-6 bg-szn-surface rounded-xl p-4 overflow-x-auto">
              <p className="text-sm text-szn-text-2 mb-2">{t("limits.headersSection.example")}</p>
              <pre className="text-sm text-szn-text-1 font-mono">
{`HTTP/1.1 200 OK
x-ratelimit-limit: 50
x-ratelimit-remaining: 47
x-ratelimit-reset: 1706140800
x-quota-limit: 10000
x-quota-remaining: 8542
x-quota-reset: 2026-02-01T00:00:00Z`}
              </pre>
            </div>
          </section>

          {/* Upgrade CTA */}
          <section className="bg-gradient-to-r from-szn-accent to-szn-accent-2 rounded-2xl p-8 text-white">
            <h2 className="text-2xl font-bold mb-4">{t("limits.upgrade.title")}</h2>
            <p className="text-szn-text-1 mb-6">{t("limits.upgrade.description")}</p>
            <div className="flex gap-4">
              <Link
                href={`/${locale}/pricing`}
                className="px-6 py-3 bg-white text-szn-accent font-semibold rounded-lg hover:bg-szn-accent/10 transition-colors"
              >
                {t("limits.upgrade.viewPlans")}
              </Link>
              <Link
                href={`/${locale}/enterprise`}
                className="px-6 py-3 bg-szn-accent text-white font-semibold rounded-lg hover:bg-szn-accent/80 transition-colors border border-szn-accent"
              >
                {t("limits.upgrade.contactSales")}
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-szn-border py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-szn-text-3 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}
