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
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-zinc-900 dark:text-white">
            Seizn<span className="text-emerald-500 dark:text-emerald-400">.</span>
          </Link>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/docs`}
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              {t("docs.nav.dashboard")}
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
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
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{t("limits.sidebar.onThisPage")}</p>
            <a href="#quotas" className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("limits.sidebar.quotas")}</a>
            <a href="#rate-limits" className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("limits.sidebar.rateLimits")}</a>
            <a href="#overage" className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("limits.sidebar.overage")}</a>
            <a href="#reset" className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("limits.sidebar.reset")}</a>
            <a href="#headers" className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("limits.sidebar.headers")}</a>

            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.resources")}</p>
            <Link href={`/${locale}/docs`} className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("docs.sidebar.overview")}</Link>
            <Link href={`/${locale}/docs/faq`} className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("docs.sidebar.faq")}</Link>
            <Link href={`/${locale}/pricing`} className="block py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("nav.pricing")}</Link>
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Hero */}
          <div className="mb-12">
            <nav className="text-sm text-zinc-500 mb-4">
              <Link href={`/${locale}/docs`} className="hover:text-emerald-600">{t("docs.sidebar.overview")}</Link>
              <span className="mx-2">/</span>
              <span className="text-zinc-900 dark:text-white">{t("limits.title")}</span>
            </nav>
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
              {t("limits.title")}
            </h1>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl">
              {t("limits.subtitle")}
            </p>
          </div>

          {/* Monthly Quotas Section */}
          <section id="quotas" className="mb-16">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">{t("limits.quotas.title")}</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">{t("limits.quotas.description")}</p>

            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-200 dark:bg-zinc-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("limits.table.plan")}</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("limits.table.monthlyQuota")}</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("limits.table.rps")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {plans.map((plan) => (
                    <tr key={plan.name}>
                      <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white">{plan.name}</td>
                      <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{plan.monthlyQuota}</td>
                      <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{plan.rps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Rate Limits Section */}
          <section id="rate-limits" className="mb-16">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">{t("limits.rateLimit.title")}</h2>
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <p className="text-zinc-700 dark:text-zinc-300 mb-4">
                {t("limits.rateLimit.description")}
              </p>
              <ul className="space-y-3 text-zinc-600 dark:text-zinc-400">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-zinc-700 dark:text-zinc-300">{t("limits.plans.free.name")}:</strong> 10 {t("limits.requestsPerSecond")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-zinc-700 dark:text-zinc-300">{t("limits.plans.plus.name")}:</strong> 50 {t("limits.requestsPerSecond")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-zinc-700 dark:text-zinc-300">{t("limits.plans.pro.name")}:</strong> 200 {t("limits.requestsPerSecond")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span><strong className="text-zinc-700 dark:text-zinc-300">{t("limits.plans.enterprise.name")}:</strong> {t("limits.custom")}</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Overage Behavior Section */}
          <section id="overage" className="mb-16">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">{t("limits.overage.title")}</h2>
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
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">{t("limits.reset.title")}</h2>
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">{t("limits.reset.monthly.title")}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-2">{t("limits.reset.monthly.description")}</p>
                  <div className="bg-zinc-200 dark:bg-zinc-800 rounded-lg p-3">
                    <code className="text-sm text-zinc-700 dark:text-zinc-300">
                      {t("limits.reset.monthly.time")}
                    </code>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">{t("limits.reset.rateLimit.title")}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-2">{t("limits.reset.rateLimit.description")}</p>
                  <div className="bg-zinc-200 dark:bg-zinc-800 rounded-lg p-3">
                    <code className="text-sm text-zinc-700 dark:text-zinc-300">
                      {t("limits.reset.rateLimit.time")}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Response Headers Section */}
          <section id="headers" className="mb-16">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">{t("limits.headersSection.title")}</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">{t("limits.headersSection.description")}</p>

            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-200 dark:bg-zinc-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("limits.headersSection.header")}</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("limits.headersSection.headerDescription")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {headers.map((header) => (
                    <tr key={header.name}>
                      <td className="px-6 py-4">
                        <code className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">{header.name}</code>
                      </td>
                      <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{header.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Example Response */}
            <div className="mt-6 bg-zinc-900 rounded-xl p-4 overflow-x-auto">
              <p className="text-sm text-zinc-400 mb-2">{t("limits.headersSection.example")}</p>
              <pre className="text-sm text-zinc-300 font-mono">
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
          <section className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-8 text-white">
            <h2 className="text-2xl font-bold mb-4">{t("limits.upgrade.title")}</h2>
            <p className="text-emerald-100 mb-6">{t("limits.upgrade.description")}</p>
            <div className="flex gap-4">
              <Link
                href={`/${locale}/pricing`}
                className="px-6 py-3 bg-white text-emerald-600 font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
              >
                {t("limits.upgrade.viewPlans")}
              </Link>
              <Link
                href={`/${locale}/enterprise`}
                className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors border border-emerald-400"
              >
                {t("limits.upgrade.contactSales")}
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}
