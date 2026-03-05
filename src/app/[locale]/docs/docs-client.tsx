"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { DocsSearch } from "@/components/docs/DocsSearch";
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

export function LocaleDocsClient({ locale, dictionary }: Props) {
  const currentYear = new Date().getFullYear();

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(dictionary, key);
    if (!value) return key;
    return interpolate(value, params);
  };

  return (
    <div className="min-h-screen bg-szn-bg">
      {/* Header */}
      <header className="border-b border-szn-border sticky top-0 bg-szn-bg/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-szn-text-1">
            Seizn<span className="text-szn-accent">.</span>
          </Link>
          <div className="flex-1 flex justify-center px-4">
            <DocsSearch
              locale={locale}
              translations={{
                placeholder: t("docs.search.placeholder"),
                buttonText: t("docs.search.buttonText"),
                noResults: t("docs.search.noResults"),
                hint: t("docs.search.hint"),
                navigate: t("docs.search.navigate"),
                select: t("docs.search.select"),
              }}
            />
          </div>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/dashboard"
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

      <main className="max-w-7xl mx-auto px-6 py-12 flex gap-12">
        {/* Sidebar Navigation */}
        <nav className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold text-szn-text-3 uppercase tracking-wider mb-3">{t("docs.sidebar.overview")}</p>
            <Link href={`/${locale}/docs/tutorial`} className="block py-1.5 text-sm text-szn-accent font-medium hover:text-szn-accent/80 transition-colors">{t("docs.sidebar.tutorial")}</Link>
            <a href="#quickstart" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.quickStart")}</a>
            <Link href={`/${locale}/docs/auth`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.authentication")}</Link>

            <p className="text-xs font-semibold text-szn-text-3 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.apiReference")}</p>
            <a href="#endpoints" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.endpoints")}</a>
            <a href="#rate-limits" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.rateLimits")}</a>
            <a href="#errors" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.errorCodes")}</a>

            <p className="text-xs font-semibold text-szn-text-3 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.resources")}</p>
            <Link href={`/${locale}/docs/security`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.security")}</Link>
            <a href="#sdks" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.sdks")}</a>
            <Link href={`/${locale}/docs/integrations`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.integrations")}</Link>
            <Link href={`/${locale}/docs/faq`} className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{t("docs.sidebar.faq")}</Link>

            <p className="text-xs font-semibold text-szn-text-3 uppercase tracking-wider mb-3 mt-6">{"MCP & Dev Tools"}</p>
            <a href="#mcp-server" className="block py-1.5 text-sm text-szn-accent font-medium hover:text-szn-accent/80 transition-colors">{"MCP Server"}</a>
            <a href="#config-sync" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{"Config Sync"}</a>
            <a href="#oauth-device-flow" className="block py-1.5 text-sm text-szn-text-2 hover:text-szn-accent transition-colors">{"OAuth Device Flow"}</a>
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="text-4xl font-bold text-szn-text-1 mb-4">
            {t("docs.hero.title")}
          </h1>
          <p className="text-xl text-szn-text-2 max-w-2xl mb-8">
            {t("docs.hero.subtitle")}
          </p>
        </div>

        {/* Quick Start */}
        <section id="quickstart" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.quickStart.title")}</h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.quickStart.description")}{" "}
              <Link href="/dashboard" className="text-szn-accent hover:underline">
                {t("docs.quickStart.dashboardLink")}
              </Link>
              {t("docs.quickStart.then")}
            </p>
            <CodeBlock
              language="bash"
              code={`# Add a memory
curl -X POST https://seizn.com/api/memories \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers dark mode interfaces"}'

# Search memories
curl "https://seizn.com/api/memories?query=user+preferences" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
            />
          </div>
        </section>

        {/* Authentication */}
        <section id="authentication" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.authentication.title")}</h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.authentication.description")}{" "}
              <code className="px-2 py-1 bg-szn-surface-1 rounded text-szn-accent">
                {t("docs.authentication.header")}
              </code>{" "}
              {t("docs.authentication.headerSuffix")}
            </p>
            <CodeBlock
              language="bash"
              code={`curl -H "Authorization: Bearer szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-amber-600 dark:text-amber-400 text-sm">
                <strong>{t("docs.authentication.securityTitle")}</strong> {t("docs.authentication.securityText")}
              </p>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section id="endpoints" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.endpoints.title")}</h2>

          {/* POST /api/memories */}
          <Endpoint
            method="POST"
            path="/api/memories"
            description={t("docs.endpoints.postMemories.description")}
            requestBodyLabel={t("docs.endpoints.requestBody")}
            responseLabel={t("docs.endpoints.response")}
            requestBody={{
              content: "string (required)",
              memory_type: "string - fact, preference, experience, relationship, instruction",
              tags: "string[]",
              namespace: "string (default: \"default\")",
              scope: "string - user, session, agent",
              session_id: "string",
              agent_id: "string",
            }}
            responseExample={`{
  "success": true,
  "memory": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "content": "User prefers dark mode interfaces",
    "memory_type": "preference",
    "tags": ["ui", "settings"],
    "namespace": "default",
    "created_at": "2026-01-08T10:30:00Z"
  }
}`}
          />

          {/* GET /api/memories */}
          <Endpoint
            method="GET"
            path="/api/memories"
            description={t("docs.endpoints.getMemories.description")}
            queryParamsLabel={t("docs.endpoints.queryParams")}
            responseLabel={t("docs.endpoints.response")}
            queryParams={{
              query: "string (required)",
              limit: "number (default: 10, max: 100)",
              threshold: "number 0-1 (default: 0.7)",
              namespace: "string",
            }}
            responseExample={`{
  "success": true,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "content": "User prefers dark mode interfaces",
      "memory_type": "preference",
      "tags": ["ui", "settings"],
      "similarity": 0.89
    }
  ],
  "count": 1
}`}
          />

          {/* DELETE /api/memories */}
          <Endpoint
            method="DELETE"
            path="/api/memories"
            description={t("docs.endpoints.deleteMemories.description")}
            queryParamsLabel={t("docs.endpoints.queryParams")}
            responseLabel={t("docs.endpoints.response")}
            queryParams={{
              ids: "string (required) - comma-separated",
            }}
            responseExample={`{
  "success": true,
  "deleted": 3
}`}
          />

          {/* POST /api/extract */}
          <Endpoint
            method="POST"
            path="/api/extract"
            description={t("docs.endpoints.extract.description")}
            requestBodyLabel={t("docs.endpoints.requestBody")}
            responseLabel={t("docs.endpoints.response")}
            requestBody={{
              conversation: "string (required)",
              model: "string - haiku | sonnet (default: haiku)",
              auto_store: "boolean (default: true)",
              namespace: "string (default: \"default\")",
            }}
            responseExample={`{
  "message": "Extracted 3 memories, stored 3",
  "extracted": [
    {
      "content": "User is a software developer working with Python",
      "memory_type": "fact",
      "tags": ["profession", "programming"],
      "confidence": 0.95,
      "importance": 7
    }
  ],
  "stored": [...]
}`}
          />

          {/* POST /api/query */}
          <Endpoint
            method="POST"
            path="/api/query"
            description={t("docs.endpoints.query.description")}
            requestBodyLabel={t("docs.endpoints.requestBody")}
            responseLabel={t("docs.endpoints.response")}
            requestBody={{
              query: "string (required)",
              model: "string - haiku | sonnet (default: haiku)",
              top_k: "number (default: 5)",
              namespace: "string",
              include_memories: "boolean (default: true)",
            }}
            responseExample={`{
  "response": "Based on your preferences, I'd recommend using VS Code with a dark theme...",
  "memories_used": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "content": "User prefers dark mode interfaces",
      "similarity": 0.85
    }
  ],
  "model_used": "haiku"
}`}
          />
        </section>

        {/* Rate Limits */}
        <section id="rate-limits" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.rateLimits.title")}</h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-szn-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("docs.rateLimits.plan")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("docs.rateLimits.monthlyApiCalls")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("docs.rateLimits.maxMemories")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("docs.rateLimits.apiKeys")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border">
                <tr>
                  <td className="px-6 py-4 text-szn-text-1">{t("docs.rateLimits.free")}</td>
                  <td className="px-6 py-4 text-szn-text-2">1,000</td>
                  <td className="px-6 py-4 text-szn-text-2">100</td>
                  <td className="px-6 py-4 text-szn-text-2">2</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-szn-text-1">{t("docs.rateLimits.starter")}</td>
                  <td className="px-6 py-4 text-szn-text-2">50,000</td>
                  <td className="px-6 py-4 text-szn-text-2">5,000</td>
                  <td className="px-6 py-4 text-szn-text-2">3</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-szn-text-1">{t("docs.rateLimits.plus")}</td>
                  <td className="px-6 py-4 text-szn-text-2">500,000</td>
                  <td className="px-6 py-4 text-szn-text-2">50,000</td>
                  <td className="px-6 py-4 text-szn-text-2">5</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-szn-text-1">{t("docs.rateLimits.pro")}</td>
                  <td className="px-6 py-4 text-szn-text-2">2,000,000</td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-szn-text-2">10</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-szn-text-1">{t("docs.rateLimits.enterprise")}</td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-szn-text-2">100</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-szn-text-2 text-sm">
            {t("docs.rateLimits.exceeded")}{" "}
            <code className="px-2 py-1 bg-szn-surface-1 rounded text-red-500 dark:text-red-400">429 Too Many Requests</code>{" "}
            {t("docs.rateLimits.response")}
          </p>
        </section>

        {/* Error Codes */}
        <section id="errors" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.errors.title")}</h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-szn-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("docs.errors.code")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">{t("docs.errors.description")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border">
                <tr>
                  <td className="px-6 py-4"><code className="text-szn-accent">200</code></td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.errors.success")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-amber-600 dark:text-amber-400">400</code></td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.errors.badRequest")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-600 dark:text-red-400">401</code></td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.errors.unauthorized")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-600 dark:text-red-400">429</code></td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.errors.tooManyRequests")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-600 dark:text-red-400">500</code></td>
                  <td className="px-6 py-4 text-szn-text-2">{t("docs.errors.serverError")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security & Governance */}
        <section id="security" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.security.title")}</h2>
          <div className="space-y-6">
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-4">{t("docs.security.dataSecurityTitle")}</h3>
              <ul className="space-y-3 text-szn-text-2">
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.encryptionAtRest")}</strong> {t("docs.security.encryptionAtRestDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.encryptionInTransit")}</strong> {t("docs.security.encryptionInTransitDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.tenantIsolation")}</strong> {t("docs.security.tenantIsolationDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-4">{t("docs.security.apiKeyManagement")}</h3>
              <ul className="space-y-3 text-szn-text-2">
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.keyRotation")}</strong> {t("docs.security.keyRotationDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.keyExpiration")}</strong> {t("docs.security.keyExpirationDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.usageTracking")}</strong> {t("docs.security.usageTrackingDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-4">{t("docs.security.dataRetention")}</h3>
              <ul className="space-y-3 text-szn-text-2">
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.export")}</strong> {t("docs.security.exportDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.deletion")}</strong> {t("docs.security.deletionDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-szn-accent">✓</span>
                  <span><strong className="text-szn-text-1">{t("docs.security.compliance")}</strong> {t("docs.security.complianceDesc")}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* SDKs */}
        <section id="sdks" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{t("docs.sdks.title")}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-yellow-500 dark:text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />
                </svg>
                <h3 className="text-lg font-semibold text-szn-text-1">{t("docs.sdks.python")}</h3>
              </div>
              <CodeBlock language="bash" code={`pip install seizn`} />
              <CodeBlock
                language="python"
                code={`from seizn import Seizn

client = Seizn(api_key="your_api_key")

# Add memory
client.add("User prefers dark mode")

# Search
results = client.search("preferences")

# Extract from conversation
client.extract(conversation="...")`}
              />
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-yellow-500 dark:text-yellow-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z" />
                </svg>
                <h3 className="text-lg font-semibold text-szn-text-1">{t("docs.sdks.javascript")}</h3>
              </div>
              <CodeBlock language="bash" code={`npm install seizn`} />
              <CodeBlock
                language="javascript"
                code={`import { Seizn } from 'seizn';

const client = new Seizn({ apiKey: 'your_api_key' });

// Add memory
await client.add('User prefers dark mode');

// Search
const results = await client.search('preferences');

// Extract from conversation
await client.extract({ conversation: '...' });`}
              />
            </div>
          </div>
        </section>

        {/* MCP Server */}
        <section id="mcp-server" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{"MCP Server — Every Editor, One Memory"}</h2>
          <div className="bg-szn-accent/10 border border-szn-accent/30 rounded-xl p-6 mb-6">
            <p className="text-szn-text-1 mb-4">
              {"The Seizn MCP Server ("}
              <code className="px-2 py-1 bg-szn-accent/10 rounded text-szn-accent">{"seizn-mcp"}</code>
              {") bridges your Seizn memories to AI coding assistants via the Model Context Protocol. 40+ tools, MCP Resources, webhooks, OAuth device flow, and multi-editor config sync — all in one package."}
            </p>
            <CodeBlock
              language="bash"
              code={`# Install globally or use npx
npx seizn-mcp@latest

# Or add to Claude Code settings (~/.claude/settings.json)
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "seizn-mcp@latest"],
      "env": { "SEIZN_API_KEY": "your-api-key" }
    }
  }
}`}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">{"Supported Editors"}</h3>
              <ul className="space-y-2 text-szn-text-2">
                <li className="flex items-center gap-2"><span className="text-szn-accent">{">"}</span> <strong className="text-szn-text-1">{"Claude Code"}</strong> {"— native MCP"}</li>
                <li className="flex items-center gap-2"><span className="text-szn-accent">{">"}</span> <strong className="text-szn-text-1">{"Cursor"}</strong> {"— native MCP"}</li>
                <li className="flex items-center gap-2"><span className="text-szn-accent">{">"}</span> <strong className="text-szn-text-1">{"Windsurf"}</strong> {"— native MCP"}</li>
                <li className="flex items-center gap-2"><span className="text-szn-accent">{">"}</span> <strong className="text-szn-text-1">{"Cline"}</strong> {"— native MCP"}</li>
                <li className="flex items-center gap-2"><span className="text-blue-500">{"~"}</span> <strong className="text-szn-text-1">{"GitHub Copilot"}</strong> {"— via config sync"}</li>
                <li className="flex items-center gap-2"><span className="text-blue-500">{"~"}</span> <strong className="text-szn-text-1">{"Aider"}</strong> {"— via config sync"}</li>
                <li className="flex items-center gap-2"><span className="text-blue-500">{"~"}</span> <strong className="text-szn-text-1">{"OpenAI Codex"}</strong> {"— via config sync"}</li>
              </ul>
            </div>
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">{"Key Features"}</h3>
              <ul className="space-y-2 text-szn-text-2">
                <li className="flex items-start gap-2"><span className="text-szn-accent mt-1">{">"}</span> <span><strong className="text-szn-text-1">{"40+ MCP Tools"}</strong> {"— memories, knowledge graph, profile, webhooks, config sync"}</span></li>
                <li className="flex items-start gap-2"><span className="text-szn-accent mt-1">{">"}</span> <span><strong className="text-szn-text-1">{"MCP Resources"}</strong> {"— seizn://memories/recent, seizn://profile, seizn://context/{format}"}</span></li>
                <li className="flex items-start gap-2"><span className="text-szn-accent mt-1">{">"}</span> <span><strong className="text-szn-text-1">{"OAuth Device Flow"}</strong> {"— browser auth, no API key copy"}</span></li>
                <li className="flex items-start gap-2"><span className="text-szn-accent mt-1">{">"}</span> <span><strong className="text-szn-text-1">{"Auto Context"}</strong> {"— detects project from package.json, pyproject.toml, Cargo.toml"}</span></li>
                <li className="flex items-start gap-2"><span className="text-szn-accent mt-1">{">"}</span> <span><strong className="text-szn-text-1">{"UTF-8 Support"}</strong> {"— Korean, Japanese, Chinese, Arabic and 100+ languages"}</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* Config Sync */}
        <section id="config-sync" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{"Multi-Editor Config Sync"}</h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6 mb-6">
            <p className="text-szn-text-1 mb-4">
              {"Seizn exports your memories as editor-specific configuration files. Your AI preferences follow you across every tool."}
            </p>
            <div className="bg-szn-surface-1 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-szn-surface-1">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-szn-text-1">{"File"}</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-szn-text-1">{"AI Tool"}</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-szn-text-1">{"Method"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-szn-border">
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{"CLAUDE.md"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"Claude Code"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"MCP + File"}</td></tr>
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{"AGENTS.md"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"OpenAI Codex"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"File Sync"}</td></tr>
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{".cursor/rules"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"Cursor"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"MCP + File"}</td></tr>
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{".windsurfrules"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"Windsurf"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"MCP + File"}</td></tr>
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{".github/copilot-instructions.md"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"GitHub Copilot"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"File Sync"}</td></tr>
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{".clinerules"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"Cline"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"MCP + File"}</td></tr>
                  <tr><td className="px-4 py-2 text-sm font-mono text-szn-accent">{"CONVENTIONS.md"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"Aider"}</td><td className="px-4 py-2 text-sm text-szn-text-2">{"File Sync"}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* OAuth Device Flow */}
        <section id="oauth-device-flow" className="mb-16">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-6">{"OAuth Device Flow"}</h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {"No more copying API keys. The MCP server supports RFC 8628 Device Authorization Grant for browser-based authentication."}
            </p>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="bg-szn-surface-1 rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">{"1"}</div>
                <p className="text-sm text-szn-text-2">{"Run "}<code className="text-szn-accent">{"auth_login"}</code>{" tool"}</p>
              </div>
              <div className="bg-szn-surface-1 rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">{"2"}</div>
                <p className="text-sm text-szn-text-2">{"Enter code "}<code className="text-szn-accent">{"ABCD-1234"}</code>{" in browser"}</p>
              </div>
              <div className="bg-szn-surface-1 rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">{"3"}</div>
                <p className="text-sm text-szn-text-2">{"Token saved to "}<code className="text-szn-accent">{"~/.seizn/"}</code></p>
              </div>
            </div>
            <div className="p-4 bg-szn-accent/10 border border-szn-accent/20 rounded-lg">
              <p className="text-szn-accent text-sm">
                <strong>{"Zero-copy auth:"}</strong>{" The device flow generates a human-readable code, opens your browser, and saves credentials automatically. Works with any terminal or SSH session."}
              </p>
            </div>
          </div>
        </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-szn-border py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-szn-text-3 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="relative mt-4">
      <div className="absolute top-2 right-2 text-xs text-szn-text-3">
        {language}
      </div>
      <pre className="bg-szn-surface-1 rounded-lg p-4 overflow-x-auto">
        <code className="text-sm text-szn-text-1">{code}</code>
      </pre>
    </div>
  );
}

function Endpoint({
  method,
  path,
  description,
  requestBody,
  queryParams,
  responseExample,
  requestBodyLabel,
  queryParamsLabel,
  responseLabel,
}: {
  method: string;
  path: string;
  description: string;
  requestBody?: Record<string, string>;
  queryParams?: Record<string, string>;
  responseExample: string;
  requestBodyLabel?: string;
  queryParamsLabel?: string;
  responseLabel?: string;
}) {
  const methodColor =
    method === "GET"
      ? "bg-blue-500"
      : method === "POST"
        ? "bg-szn-accent"
        : method === "DELETE"
          ? "bg-red-500"
          : "bg-szn-surface";

  return (
    <div className="mb-8 bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
      <div className="p-6 border-b border-szn-border">
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-3 py-1 rounded text-sm font-mono font-bold text-white ${methodColor}`}>
            {method}
          </span>
          <code className="text-lg text-szn-text-1 font-mono">{path}</code>
        </div>
        <p className="text-szn-text-2">{description}</p>
      </div>

      {(requestBody || queryParams) && (
        <div className="p-6 border-b border-szn-border">
          <h4 className="text-sm font-semibold text-szn-text-1 mb-3">
            {requestBody ? requestBodyLabel : queryParamsLabel}
          </h4>
          <div className="space-y-2">
            {Object.entries(requestBody || queryParams || {}).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <code className="text-szn-accent font-mono">{key}</code>
                <span className="text-szn-text-3">-</span>
                <span className="text-szn-text-2">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-6">
        <h4 className="text-sm font-semibold text-szn-text-1 mb-3">{responseLabel}</h4>
        <pre className="bg-szn-surface-1 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-szn-text-1">{responseExample}</code>
        </pre>
      </div>
    </div>
  );
}
