"use client";

import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { DocsSearch } from "@/components/docs/DocsSearch";

export function DocsClient() {
  const { t } = useDashboardTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Seizn<span className="text-emerald-400">.</span>
          </Link>
          <div className="flex-1 flex justify-center px-4">
            <DocsSearch />
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-zinc-400 hover:text-white transition-colors"
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
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{t("docs.sidebar.overview")}</p>
            <Link href="/docs/quickstart" className="block py-1.5 text-sm text-emerald-400 font-medium hover:text-emerald-300 transition-colors">{t("docs.sidebar.quickStart")}</Link>
            <a href="#authentication" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.authentication")}</a>

            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.apiReference")}</p>
            <a href="#endpoints" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.endpoints")}</a>
            <a href="#rate-limits" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.rateLimits")}</a>
            <a href="#errors" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.errorCodes")}</a>

            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.resources")}</p>
            <a href="#security" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.security")}</a>
            <a href="#sdks" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.sdks")}</a>
            <Link href="/docs/faq" className="block py-1.5 text-sm text-zinc-400 hover:text-emerald-400 transition-colors">{t("docs.sidebar.faq")}</Link>
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="text-4xl font-bold text-white mb-4">
            {t("docs.hero.title")}
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mb-8">
            {t("docs.hero.subtitle")}
          </p>
        </div>

        {/* Quick Start */}
        <section id="quickstart" className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.quickStart.title")}</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-300 mb-4">
              {t("docs.quickStart.description")}{" "}
              <Link href="/dashboard" className="text-emerald-400 hover:underline">
                {t("docs.quickStart.dashboardLink")}
              </Link>
              {t("docs.quickStart.then")}
            </p>
            <CodeBlock
              language="bash"
              code={`# Add a memory
curl -X POST https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers dark mode interfaces"}'

# Search memories
curl "https://seizn.com/api/memories?query=user+preferences" \\
  -H "x-api-key: YOUR_API_KEY"`}
            />
          </div>
        </section>

        {/* Authentication */}
        <section id="authentication" className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.authentication.title")}</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-300 mb-4">
              {t("docs.authentication.description")}{" "}
              <code className="px-2 py-1 bg-zinc-800 rounded text-emerald-400">
                {t("docs.authentication.header")}
              </code>{" "}
              {t("docs.authentication.headerSuffix")}
            </p>
            <CodeBlock
              language="bash"
              code={`curl -H "x-api-key: szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-amber-400 text-sm">
                <strong>{t("docs.authentication.securityTitle")}</strong> {t("docs.authentication.securityText")}
              </p>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section id="endpoints" className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.endpoints.title")}</h2>

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
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.rateLimits.title")}</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-300">{t("docs.rateLimits.plan")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-300">{t("docs.rateLimits.dailyApiCalls")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-300">{t("docs.rateLimits.maxMemories")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-300">{t("docs.rateLimits.apiKeys")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                <tr>
                  <td className="px-6 py-4 text-zinc-300">{t("docs.rateLimits.free")}</td>
                  <td className="px-6 py-4 text-zinc-400">1,000</td>
                  <td className="px-6 py-4 text-zinc-400">10,000</td>
                  <td className="px-6 py-4 text-zinc-400">2</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-zinc-300">{t("docs.rateLimits.plus")}</td>
                  <td className="px-6 py-4 text-zinc-400">10,000</td>
                  <td className="px-6 py-4 text-zinc-400">100,000</td>
                  <td className="px-6 py-4 text-zinc-400">5</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-zinc-300">{t("docs.rateLimits.pro")}</td>
                  <td className="px-6 py-4 text-zinc-400">100,000</td>
                  <td className="px-6 py-4 text-zinc-400">1,000,000</td>
                  <td className="px-6 py-4 text-zinc-400">10</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-zinc-300">{t("docs.rateLimits.enterprise")}</td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-zinc-400">100</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-zinc-400 text-sm">
            {t("docs.rateLimits.exceeded")}{" "}
            <code className="px-2 py-1 bg-zinc-800 rounded text-red-400">429 Too Many Requests</code>{" "}
            {t("docs.rateLimits.response")}
          </p>
        </section>

        {/* Error Codes */}
        <section id="errors" className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.errors.title")}</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-300">{t("docs.errors.code")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-300">{t("docs.errors.description")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                <tr>
                  <td className="px-6 py-4"><code className="text-emerald-400">200</code></td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.errors.success")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-amber-400">400</code></td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.errors.badRequest")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-400">401</code></td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.errors.unauthorized")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-400">429</code></td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.errors.tooManyRequests")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-400">500</code></td>
                  <td className="px-6 py-4 text-zinc-400">{t("docs.errors.serverError")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security & Governance */}
        <section id="security" className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.security.title")}</h2>
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t("docs.security.dataSecurityTitle")}</h3>
              <ul className="space-y-3 text-zinc-400">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.encryptionAtRest")}</strong> {t("docs.security.encryptionAtRestDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.encryptionInTransit")}</strong> {t("docs.security.encryptionInTransitDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.tenantIsolation")}</strong> {t("docs.security.tenantIsolationDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t("docs.security.apiKeyManagement")}</h3>
              <ul className="space-y-3 text-zinc-400">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.keyRotation")}</strong> {t("docs.security.keyRotationDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.keyExpiration")}</strong> {t("docs.security.keyExpirationDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.usageTracking")}</strong> {t("docs.security.usageTrackingDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t("docs.security.dataRetention")}</h3>
              <ul className="space-y-3 text-zinc-400">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.export")}</strong> {t("docs.security.exportDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.deletion")}</strong> {t("docs.security.deletionDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span><strong className="text-zinc-300">{t("docs.security.compliance")}</strong> {t("docs.security.complianceDesc")}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* SDKs */}
        <section id="sdks" className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">{t("docs.sdks.title")}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />
                </svg>
                <h3 className="text-lg font-semibold text-white">{t("docs.sdks.python")}</h3>
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-yellow-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z" />
                </svg>
                <h3 className="text-lg font-semibold text-white">{t("docs.sdks.javascript")}</h3>
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
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="relative mt-4">
      <div className="absolute top-2 right-2 text-xs text-zinc-500">
        {language}
      </div>
      <pre className="bg-zinc-800 rounded-lg p-4 overflow-x-auto">
        <code className="text-sm text-zinc-300">{code}</code>
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
        ? "bg-emerald-500"
        : method === "DELETE"
          ? "bg-red-500"
          : "bg-zinc-500";

  return (
    <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-3 py-1 rounded text-sm font-mono font-bold text-white ${methodColor}`}>
            {method}
          </span>
          <code className="text-lg text-white font-mono">{path}</code>
        </div>
        <p className="text-zinc-400">{description}</p>
      </div>

      {(requestBody || queryParams) && (
        <div className="p-6 border-b border-zinc-800">
          <h4 className="text-sm font-semibold text-zinc-300 mb-3">
            {requestBody ? requestBodyLabel : queryParamsLabel}
          </h4>
          <div className="space-y-2">
            {Object.entries(requestBody || queryParams || {}).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <code className="text-emerald-400 font-mono">{key}</code>
                <span className="text-zinc-500">-</span>
                <span className="text-zinc-400">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-6">
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">{responseLabel}</h4>
        <pre className="bg-zinc-800 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-zinc-300">{responseExample}</code>
        </pre>
      </div>
    </div>
  );
}
