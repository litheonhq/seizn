"use client";

import { useState } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { copyToClipboard } from "@/lib/clipboard";

// Quickstart card component with Copy + Run buttons
function QuickstartCard({
  step,
  title,
  description,
  code,
  expectedOutput,
  language = "bash",
}: {
  step: string;
  title: string;
  description: string;
  code: string;
  expectedOutput: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleCopy = async () => {
    const result = await copyToClipboard(code);
    if (result.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Show manual copy hint for Linux/Firefox permission issues
      alert(result.error);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    // Simulate running the command
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRunning(false);
    setShowOutput(true);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-300 transition-colors">
      {/* Step Badge */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">
          {step}
        </span>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>

      <p className="text-gray-500 text-sm mb-4">{description}</p>

      {/* Code Block */}
      <div className="relative">
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <span className="text-xs text-gray-400">{language}</span>
        </div>
        <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto text-sm">
          <code className="text-gray-700">{code}</code>
        </pre>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-zinc-700 text-gray-700 rounded-lg text-sm transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-gray-900 rounded-lg text-sm transition-colors"
        >
          {isRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run
            </>
          )}
        </button>
      </div>

      {/* Expected Output */}
      {showOutput && (
        <div className="mt-4 p-4 bg-gray-100 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-emerald-600 text-sm font-medium">Success!</span>
          </div>
          <pre className="text-xs text-gray-500 overflow-x-auto">
            <code>{expectedOutput}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

export function DocsClient() {
  const { t } = useDashboardTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Seizn<span className="text-emerald-600">.</span>
          </Link>
          <div className="flex-1 flex justify-center px-4">
            <DocsSearch />
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              {t("docs.nav.dashboard")}
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-medium rounded-lg transition-colors"
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("docs.sidebar.overview")}</p>
            <Link href="/docs/quickstart" className="block py-1.5 text-sm text-emerald-600 font-medium hover:text-emerald-300 transition-colors">{t("docs.sidebar.quickStart")}</Link>
            <a href="#authentication" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.authentication")}</a>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.apiReference")}</p>
            <a href="#endpoints" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.endpoints")}</a>
            <a href="#rate-limits" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.rateLimits")}</a>
            <a href="#errors" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.errorCodes")}</a>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6">{t("docs.sidebar.resources")}</p>
            <a href="#security" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.security")}</a>
            <a href="#sdks" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.sdks")}</a>
            <Link href="/docs/faq" className="block py-1.5 text-sm text-gray-500 hover:text-emerald-600 transition-colors">{t("docs.sidebar.faq")}</Link>
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {t("docs.hero.title")}
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mb-8">
            {t("docs.hero.subtitle")}
          </p>
        </div>

        {/* 1-Minute Quickstart Cards */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {t("docs.quickStart.oneMinuteTitle") || "1-Minute Quickstart"}
            </h2>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-600 text-sm font-medium rounded-full">
              ~60 sec
            </span>
          </div>

          <div className="grid gap-6">
            {/* Step 1: Get API Key */}
            <QuickstartCard
              step="1"
              title={t("docs.quickStart.step1Title") || "Get Your API Key"}
              description={t("docs.quickStart.step1Desc") || "Create a free account and generate your API key from the dashboard."}
              code={`# Go to dashboard and create API key
open https://seizn.com/dashboard/keys

# Or use CLI
npx seizn init`}
              expectedOutput={`API Key created: szn_live_abc123...
Save this key securely - it won't be shown again.`}
            />

            {/* Step 2: Save First Memory */}
            <QuickstartCard
              step="2"
              title={t("docs.quickStart.step2Title") || "Save Your First Memory"}
              description={t("docs.quickStart.step2Desc") || "Store a piece of information that can be retrieved later."}
              code={`curl -X POST https://seizn.com/api/memories \\
  -H "x-api-key: $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers dark mode"}'`}
              expectedOutput={`{
  "success": true,
  "memory": {
    "id": "mem_7x8y9z...",
    "content": "User prefers dark mode"
  }
}`}
            />

            {/* Step 3: Search with Trace */}
            <QuickstartCard
              step="3"
              title={t("docs.quickStart.step3Title") || "Search & See the Trace"}
              description={t("docs.quickStart.step3Desc") || "Run a semantic search and view the full trace of what happened."}
              code={`curl -X POST https://seizn.com/api/summer/retrieve \\
  -H "x-api-key: $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "user preferences", "trace": true}'`}
              expectedOutput={`{
  "results": [...],
  "trace": {
    "id": "tr_abc123",
    "latency_ms": 127,
    "steps": ["embed", "search", "rerank"]
  }
}`}
            />
          </div>

          <div className="mt-6 p-4 bg-white border border-gray-200 rounded-xl">
            <p className="text-gray-500 text-sm">
              <span className="text-emerald-600 font-medium">Next step:</span>{" "}
              {t("docs.quickStart.nextStep") || "View your trace in the dashboard to debug and optimize your retrieval."}
              <Link href="/dashboard/fall" className="ml-2 text-emerald-600 hover:underline">
                Open Dashboard →
              </Link>
            </p>
          </div>
        </section>

        {/* Quick Start (Original - now renamed) */}
        <section id="quickstart" className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.quickStart.title")}</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-gray-700 mb-4">
              {t("docs.quickStart.description")}{" "}
              <Link href="/dashboard" className="text-emerald-600 hover:underline">
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
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.authentication.title")}</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-gray-700 mb-4">
              {t("docs.authentication.description")}{" "}
              <code className="px-2 py-1 bg-gray-100 rounded text-emerald-600">
                {t("docs.authentication.header")}
              </code>{" "}
              {t("docs.authentication.headerSuffix")}
            </p>
            <CodeBlock
              language="bash"
              code={`curl -H "x-api-key: szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-700 text-sm">
                <strong>{t("docs.authentication.securityTitle")}</strong> {t("docs.authentication.securityText")}
              </p>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section id="endpoints" className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.endpoints.title")}</h2>

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
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.rateLimits.title")}</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t("docs.rateLimits.plan")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t("docs.rateLimits.dailyApiCalls")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t("docs.rateLimits.maxMemories")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t("docs.rateLimits.apiKeys")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-6 py-4 text-gray-700">{t("docs.rateLimits.free")}</td>
                  <td className="px-6 py-4 text-gray-500">1,000</td>
                  <td className="px-6 py-4 text-gray-500">10,000</td>
                  <td className="px-6 py-4 text-gray-500">2</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-gray-700">{t("docs.rateLimits.plus")}</td>
                  <td className="px-6 py-4 text-gray-500">10,000</td>
                  <td className="px-6 py-4 text-gray-500">100,000</td>
                  <td className="px-6 py-4 text-gray-500">5</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-gray-700">{t("docs.rateLimits.pro")}</td>
                  <td className="px-6 py-4 text-gray-500">100,000</td>
                  <td className="px-6 py-4 text-gray-500">1,000,000</td>
                  <td className="px-6 py-4 text-gray-500">10</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-gray-700">{t("docs.rateLimits.enterprise")}</td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.rateLimits.unlimited")}</td>
                  <td className="px-6 py-4 text-gray-500">100</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-gray-500 text-sm">
            {t("docs.rateLimits.exceeded")}{" "}
            <code className="px-2 py-1 bg-gray-100 rounded text-red-400">429 Too Many Requests</code>{" "}
            {t("docs.rateLimits.response")}
          </p>
        </section>

        {/* Error Codes */}
        <section id="errors" className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.errors.title")}</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t("docs.errors.code")}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t("docs.errors.description")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-6 py-4"><code className="text-emerald-600">200</code></td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.errors.success")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-amber-700">400</code></td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.errors.badRequest")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-400">401</code></td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.errors.unauthorized")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-400">429</code></td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.errors.tooManyRequests")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-400">500</code></td>
                  <td className="px-6 py-4 text-gray-500">{t("docs.errors.serverError")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security & Governance */}
        <section id="security" className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.security.title")}</h2>
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("docs.security.dataSecurityTitle")}</h3>
              <ul className="space-y-3 text-gray-500">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.encryptionAtRest")}</strong> {t("docs.security.encryptionAtRestDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.encryptionInTransit")}</strong> {t("docs.security.encryptionInTransitDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.tenantIsolation")}</strong> {t("docs.security.tenantIsolationDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("docs.security.apiKeyManagement")}</h3>
              <ul className="space-y-3 text-gray-500">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.keyRotation")}</strong> {t("docs.security.keyRotationDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.keyExpiration")}</strong> {t("docs.security.keyExpirationDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.usageTracking")}</strong> {t("docs.security.usageTrackingDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("docs.security.dataRetention")}</h3>
              <ul className="space-y-3 text-gray-500">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.export")}</strong> {t("docs.security.exportDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.deletion")}</strong> {t("docs.security.deletionDesc")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span><strong className="text-gray-700">{t("docs.security.compliance")}</strong> {t("docs.security.complianceDesc")}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* SDKs */}
        <section id="sdks" className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("docs.sdks.title")}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">{t("docs.sdks.python")}</h3>
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

            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-8 h-8 text-yellow-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">{t("docs.sdks.javascript")}</h3>
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

        {/* Supported Browsers */}
        <section id="supported-browsers" className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Supported Browsers
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-gray-700 mb-4">
              Seizn is tested and supported on the latest versions of the following browsers across Windows, macOS, and Linux:
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-3.953 6.848c.062.004.124.006.187.01.062.004.125.006.188.006a12 12 0 0 0 10.814-17.568H15.273z"/>
                </svg>
                <div>
                  <span className="font-medium text-gray-900">Chrome / Chromium</span>
                  <span className="text-sm text-gray-500 block">Latest 2 versions</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <svg className="w-6 h-6 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 0 1-.13-.24 2.118 2.118 0 0 1-.172-.46.03.03 0 0 0-.027-.03.038.038 0 0 0-.021 0l-.006.001a.037.037 0 0 0-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 0 0-2.305.587.297.297 0 0 0-.147.37c.057.162.24.24.396.17a5.622 5.622 0 0 1 2.008-.523l.067-.005a5.847 5.847 0 0 1 1.957.222l.095.03a5.816 5.816 0 0 1 .616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 0 1 .368.211 5.953 5.953 0 0 1 2.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 0 1-1.513-.292 4.42 4.42 0 0 1-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 0 0-.301-.227 5.388 5.388 0 0 1-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 0 0-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 0 0-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.014-.076.026-.153.038-.229a10.016 10.016 0 0 0 .26-4.062z"/>
                </svg>
                <div>
                  <span className="font-medium text-gray-900">Firefox</span>
                  <span className="text-sm text-gray-500 block">Latest 2 versions + ESR</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 12c0 6.627 5.373 12 12 12s12-5.373 12-12h-9.29c-.409 1.792-2.026 3.13-3.96 3.13-2.247 0-4.069-1.82-4.069-4.066S8.503 6.998 10.75 6.998c1.885 0 3.47 1.28 3.925 3.014H24C24 4.383 18.627 0 12 0S0 4.383 0 12z"/>
                </svg>
                <div>
                  <span className="font-medium text-gray-900">Edge</span>
                  <span className="text-sm text-gray-500 block">Latest 2 versions</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <svg className="w-6 h-6 text-gray-800" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 24C5.373 24 0 18.627 0 12S5.373 0 12 0s12 5.373 12 12-5.373 12-12 12zm-1.95-3.645v-1.2c-.393 0-1.073-.02-1.691-.178a4.59 4.59 0 0 1-1.471-.646l.396-1.236a4.18 4.18 0 0 0 1.32.591c.477.124.966.168 1.446.168.834 0 1.481-.168 1.927-.507.444-.337.667-.813.667-1.423 0-.5-.157-.894-.474-1.183-.315-.29-.876-.55-1.68-.782l-.899-.262c-.997-.282-1.738-.685-2.22-1.206-.484-.52-.726-1.173-.726-1.956 0-.918.304-1.656.912-2.214.607-.558 1.446-.862 2.517-.912V6.12h1.2v1.2c.702.05 1.302.182 1.8.396a4.096 4.096 0 0 1 1.224.726l-.648 1.152a3.694 3.694 0 0 0-1.068-.594 3.672 3.672 0 0 0-1.308-.228c-.768 0-1.358.163-1.77.49-.41.328-.616.782-.616 1.362 0 .46.149.836.449 1.125.3.29.802.534 1.507.732l.96.276c1.069.306 1.855.717 2.359 1.233.504.516.756 1.188.756 2.016 0 .94-.319 1.695-.957 2.268-.638.573-1.533.898-2.682.973v1.308h-1.2z"/>
                </svg>
                <div>
                  <span className="font-medium text-gray-900">Safari</span>
                  <span className="text-sm text-gray-500 block">Latest 2 versions (macOS/iOS)</span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-emerald-700 text-sm">
                <strong>Linux Users:</strong> Seizn is fully tested on Ubuntu (24.04, 22.04), Fedora, and Arch Linux with both Chromium and Firefox. All features including clipboard operations, keyboard shortcuts, and file uploads are supported.
              </p>
            </div>
          </div>
        </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-400 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="relative mt-4">
      <div className="absolute top-2 right-2 text-xs text-gray-400">
        {language}
      </div>
      <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto">
        <code className="text-sm text-gray-700">{code}</code>
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
    <div className="mb-8 bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-3 py-1 rounded text-sm font-mono font-bold text-gray-900 ${methodColor}`}>
            {method}
          </span>
          <code className="text-lg text-gray-900 font-mono">{path}</code>
        </div>
        <p className="text-gray-500">{description}</p>
      </div>

      {(requestBody || queryParams) && (
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {requestBody ? requestBodyLabel : queryParamsLabel}
          </h4>
          <div className="space-y-2">
            {Object.entries(requestBody || queryParams || {}).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <code className="text-emerald-600 font-mono">{key}</code>
                <span className="text-gray-400">-</span>
                <span className="text-gray-500">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">{responseLabel}</h4>
        <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-gray-700">{responseExample}</code>
        </pre>
      </div>
    </div>
  );
}
