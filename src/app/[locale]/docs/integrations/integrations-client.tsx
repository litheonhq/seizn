'use client';

import Link from 'next/link';
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (typeof current === "string") return current;
  return undefined;
}

const integrations = [
  {
    id: 'langchain',
    icon: '🦜',
    href: '/docs/integrations/langchain',
    badgeKey: 'docs.integrationsPage.cards.langchain.badge',
    titleKey: 'docs.integrationsPage.cards.langchain.title',
    descKey: 'docs.integrationsPage.cards.langchain.description',
    tags: ['RAG', 'Python', 'TypeScript'],
  },
  {
    id: 'llamaindex',
    icon: '🦙',
    href: '/docs/integrations/llamaindex',
    badgeKey: 'docs.integrationsPage.cards.llamaindex.badge',
    titleKey: 'docs.integrationsPage.cards.llamaindex.title',
    descKey: 'docs.integrationsPage.cards.llamaindex.description',
    tags: ['RAG', 'Python', 'TypeScript'],
  },
  {
    id: 'opentelemetry',
    icon: '📊',
    href: '/docs/integrations/opentelemetry',
    badgeKey: 'docs.integrationsPage.cards.opentelemetry.badge',
    titleKey: 'docs.integrationsPage.cards.opentelemetry.title',
    descKey: 'docs.integrationsPage.cards.opentelemetry.description',
    tags: ['Observability', 'Datadog', 'Grafana', 'Jaeger'],
  },
];

export function IntegrationsClient({ locale, dictionary }: Props) {
  const t = (key: string): string => {
    const value = getNestedValue(dictionary, key);
    return value ?? key;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}`} className="text-xl font-bold text-zinc-900 dark:text-white">
              Seizn<span className="text-emerald-500 dark:text-emerald-400">.</span>
            </Link>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <Link href={`/${locale}/docs`} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              {t("nav.docs")}
            </Link>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="text-zinc-900 dark:text-white">{t("docs.integrationsPage.breadcrumb")}</span>
          </div>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/dashboard`}
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={`/${locale}/login`}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              {t("nav.getStarted")}
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
            {t("docs.integrationsPage.title")}
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            {t("docs.integrationsPage.subtitle")}
          </p>
        </div>

        {/* Integration Cards */}
        <div className="grid gap-6">
          {integrations.map((integration) => (
            <Link
              key={integration.id}
              href={`/${locale}${integration.href}`}
              className="group block bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">{integration.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {t(integration.titleKey)}
                    </h2>
                    <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">
                      {t(integration.badgeKey)}
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-3">
                    {t(integration.descKey)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {integration.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-zinc-400 group-hover:text-emerald-500 transition-colors flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Coming Soon Section */}
        <div className="mt-12 p-6 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">
            {t("docs.integrationsPage.comingSoon.title")}
          </h3>
          <p className="text-zinc-600 dark:text-zinc-400 mb-4">
            {t("docs.integrationsPage.comingSoon.description")}
          </p>
          <div className="flex flex-wrap gap-3">
            {['Vercel AI SDK', 'Haystack', 'Semantic Kernel', 'AutoGen'].map((name) => (
              <span
                key={name}
                className="px-3 py-1.5 text-sm bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 rounded-lg"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Back to Docs */}
        <div className="mt-8 text-center">
          <Link
            href={`/${locale}/docs`}
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {t("docs.integrationsPage.backToDocs")}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
          {t("docs.footer.copyright").replace("{year}", new Date().getFullYear().toString())}
        </div>
      </footer>
    </div>
  );
}
