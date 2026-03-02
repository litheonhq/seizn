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
    id: 'mcp-server',
    icon: '🔌',
    href: null,
    badgeKey: 'docs.integrationsPage.cards.mcpServer.badge',
    titleKey: 'docs.integrationsPage.cards.mcpServer.title',
    descKey: 'docs.integrationsPage.cards.mcpServer.description',
    tags: ['Claude Code', 'Cursor', 'Windsurf', 'Copilot', 'Cline', 'Aider', 'Codex'],
  },
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
    <div className="min-h-screen bg-szn-bg">
      {/* Header */}
      <header className="border-b border-szn-border sticky top-0 bg-szn-bg/80 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}`} className="text-xl font-bold text-szn-text-1">
              Seizn<span className="text-szn-accent">.</span>
            </Link>
            <span className="text-szn-text-3">/</span>
            <Link href={`/${locale}/docs`} className="text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t("nav.docs")}
            </Link>
            <span className="text-szn-text-3">/</span>
            <span className="text-szn-text-1">{t("docs.integrationsPage.breadcrumb")}</span>
          </div>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/dashboard`}
              className="text-szn-text-2 hover:text-szn-text-1 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={`/${locale}/login`}
              className="px-4 py-2 bg-szn-accent hover:bg-szn-accent/80 text-white font-medium rounded-lg transition-colors"
            >
              {t("nav.getStarted")}
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-szn-text-1 mb-4">
            {t("docs.integrationsPage.title")}
          </h1>
          <p className="text-xl text-szn-text-2 max-w-2xl mx-auto">
            {t("docs.integrationsPage.subtitle")}
          </p>
        </div>

        {/* Integration Cards */}
        <div className="grid gap-6">
          {integrations.map((integration) => {
            const cardContent = (
              <div className="flex items-start gap-4">
                <div className="text-4xl">{integration.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-semibold text-szn-text-1 group-hover:text-szn-accent transition-colors">
                      {t(integration.titleKey)}
                    </h2>
                    <span className="px-2 py-0.5 text-xs font-medium bg-szn-accent/10 text-szn-accent rounded">
                      {t(integration.badgeKey)}
                    </span>
                  </div>
                  <p className="text-szn-text-2 mb-3">
                    {t(integration.descKey)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {integration.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-szn-surface-1 text-szn-text-2 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {integration.id === 'mcp-server' && (
                    <div className="mt-4 p-3 bg-szn-surface rounded-lg">
                      <code className="text-xs text-szn-accent font-mono">npx seizn-mcp@latest</code>
                      <span className="text-xs text-szn-text-3 ml-2">— works in 30 seconds</span>
                    </div>
                  )}
                </div>
                {integration.href && (
                  <svg
                    className="w-5 h-5 text-szn-text-3 group-hover:text-szn-accent transition-colors flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );

            if (integration.href) {
              return (
                <Link
                  key={integration.id}
                  href={`/${locale}${integration.href}`}
                  className="group block bg-szn-surface border border-szn-border rounded-xl p-6 hover:border-szn-accent transition-colors"
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <div
                key={integration.id}
                className="group block bg-szn-surface border border-szn-accent/50 rounded-xl p-6"
              >
                {cardContent}
              </div>
            );
          })}
        </div>

        {/* Coming Soon Section */}
        <div className="mt-12 p-6 bg-szn-surface border border-szn-border rounded-xl">
          <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
            {t("docs.integrationsPage.comingSoon.title")}
          </h3>
          <p className="text-szn-text-2 mb-4">
            {t("docs.integrationsPage.comingSoon.description")}
          </p>
          <div className="flex flex-wrap gap-3">
            {['Vercel AI SDK', 'Haystack', 'Semantic Kernel', 'AutoGen'].map((name) => (
              <span
                key={name}
                className="px-3 py-1.5 text-sm bg-szn-surface-1 text-szn-text-3 rounded-lg"
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
            className="text-szn-accent hover:underline"
          >
            {t("docs.integrationsPage.backToDocs")}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-szn-border py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-szn-text-3 text-sm">
          {t("docs.footer.copyright").replace("{year}", new Date().getFullYear().toString())}
        </div>
      </footer>
    </div>
  );
}
