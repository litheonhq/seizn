'use client';

import { useState } from 'react';
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

function CodeBlock({ language, code, title }: { language: string; code: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative mt-4">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 bg-szn-surface-1 rounded-t-lg border-b border-szn-border">
          <span className="text-sm font-medium text-szn-text-1">{title}</span>
          <span className="text-xs text-szn-text-3">{language}</span>
        </div>
      )}
      <div className={`relative ${title ? 'rounded-b-lg' : 'rounded-lg'}`}>
        {!title && (
          <div className="absolute top-2 right-2 text-xs text-szn-text-3">
            {language}
          </div>
        )}
        <button
          onClick={handleCopy}
          className="absolute top-2 right-12 px-2 py-1 text-xs bg-szn-surface hover:bg-szn-surface-1 text-white rounded transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre className={`bg-szn-surface-1 ${title ? '' : 'rounded-lg'} p-4 overflow-x-auto`}>
          <code className="text-sm text-szn-text-1">{code}</code>
        </pre>
      </div>
    </div>
  );
}

export function OpenTelemetryClient({ locale, dictionary }: Props) {
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
            <Link href={`/${locale}/docs/integrations`} className="text-szn-text-2 hover:text-szn-text-1 transition-colors">
              {t("docs.integrationsPage.breadcrumb")}
            </Link>
            <span className="text-szn-text-3">/</span>
            <span className="text-szn-text-1">OpenTelemetry</span>
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
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">📊</span>
            <span className="px-3 py-1 text-sm font-medium bg-szn-accent/10 text-szn-accent rounded-lg">
              {t("docs.opentelemetryPage.badge")}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-szn-text-1 mb-4">
            {t("docs.opentelemetryPage.title")}
          </h1>
          <p className="text-xl text-szn-text-2">
            {t("docs.opentelemetryPage.subtitle")}
          </p>
        </div>

        {/* 60-Second Overview */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">01</span>
            {t("docs.opentelemetryPage.overview.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.opentelemetryPage.overview.description")}
            </p>
            <ul className="space-y-2 text-szn-text-2">
              <li className="flex items-start gap-2">
                <span className="text-szn-accent mt-1">&#10003;</span>
                <span>{t("docs.opentelemetryPage.overview.feature1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-szn-accent mt-1">&#10003;</span>
                <span>{t("docs.opentelemetryPage.overview.feature2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-szn-accent mt-1">&#10003;</span>
                <span>{t("docs.opentelemetryPage.overview.feature3")}</span>
              </li>
            </ul>

            {/* Supported Backends */}
            <div className="mt-6 pt-6 border-t border-szn-border">
              <h4 className="text-sm font-semibold text-szn-text-1 mb-3">
                {t("docs.opentelemetryPage.overview.supportedBackends")}
              </h4>
              <div className="flex flex-wrap gap-3">
                {['Datadog', 'Grafana Tempo', 'Jaeger', 'Honeycomb', 'New Relic', 'Zipkin'].map((backend) => (
                  <span
                    key={backend}
                    className="px-3 py-1.5 text-sm bg-szn-surface-1 text-szn-text-1 rounded-lg"
                  >
                    {backend}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Installation & Setup */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">02</span>
            {t("docs.opentelemetryPage.installation.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.opentelemetryPage.installation.description")}
            </p>
            <CodeBlock
              language="bash"
              code={`# Enable OTLP export in your Seizn client
# Set these environment variables

# Required: OTLP endpoint
export SEIZN_OTLP_ENDPOINT="https://your-collector:4318"

# Optional: Authentication
export SEIZN_OTLP_HEADERS="Authorization=Bearer your-token"

# Optional: Service name (default: seizn-client)
export SEIZN_SERVICE_NAME="my-rag-app"`}
              title="Environment Variables"
            />
          </div>
        </section>

        {/* Backend-Specific Examples */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">03</span>
            {t("docs.opentelemetryPage.examples.title")}
          </h2>
          <div className="space-y-6">

            {/* Datadog */}
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-purple-600 rounded flex items-center justify-center text-white font-bold text-sm">DD</div>
                <h3 className="text-lg font-semibold text-szn-text-1">Datadog</h3>
              </div>
              <p className="text-szn-text-2 mb-4">
                {t("docs.opentelemetryPage.examples.datadog.description")}
              </p>
              <CodeBlock
                language="bash"
                title="Datadog Configuration"
                code={`# Option 1: Direct to Datadog (via Agent)
export SEIZN_OTLP_ENDPOINT="http://localhost:4318"
# Datadog Agent must have OTLP receiver enabled

# Option 2: Direct to Datadog API
export SEIZN_OTLP_ENDPOINT="https://trace.agent.datadoghq.com"
export SEIZN_OTLP_HEADERS="DD-API-KEY=your-datadog-api-key"

# Enable in Seizn
export SEIZN_TELEMETRY_ENABLED="true"`}
              />
              <CodeBlock
                language="yaml"
                title="datadog-agent.yaml"
                code={`otlp_config:
  receiver:
    protocols:
      http:
        endpoint: 0.0.0.0:4318`}
              />
            </div>

            {/* Grafana */}
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white font-bold text-sm">G</div>
                <h3 className="text-lg font-semibold text-szn-text-1">Grafana Tempo</h3>
              </div>
              <p className="text-szn-text-2 mb-4">
                {t("docs.opentelemetryPage.examples.grafana.description")}
              </p>
              <CodeBlock
                language="bash"
                title="Grafana Cloud Configuration"
                code={`# Grafana Cloud
export SEIZN_OTLP_ENDPOINT="https://tempo-us-central1.grafana.net/tempo"
export SEIZN_OTLP_HEADERS="Authorization=Basic $(echo -n 'instance-id:api-token' | base64)"

# Self-hosted Tempo
export SEIZN_OTLP_ENDPOINT="http://tempo:4318"

# Enable in Seizn
export SEIZN_TELEMETRY_ENABLED="true"`}
              />
            </div>

            {/* Jaeger */}
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white font-bold text-sm">J</div>
                <h3 className="text-lg font-semibold text-szn-text-1">Jaeger</h3>
              </div>
              <p className="text-szn-text-2 mb-4">
                {t("docs.opentelemetryPage.examples.jaeger.description")}
              </p>
              <CodeBlock
                language="bash"
                title="Jaeger Configuration"
                code={`# Jaeger with OTLP receiver (v1.35+)
export SEIZN_OTLP_ENDPOINT="http://jaeger:4318"
export SEIZN_TELEMETRY_ENABLED="true"`}
              />
              <CodeBlock
                language="bash"
                title="Docker Compose Example"
                code={`# Run Jaeger with OTLP support
docker run -d --name jaeger \\
  -e COLLECTOR_OTLP_ENABLED=true \\
  -p 16686:16686 \\
  -p 4318:4318 \\
  jaegertracing/all-in-one:latest`}
              />
            </div>
          </div>
        </section>

        {/* Production Tips */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">04</span>
            {t("docs.opentelemetryPage.production.title")}
          </h2>
          <div className="space-y-4">
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
                {t("docs.opentelemetryPage.production.sampling.title")}
              </h3>
              <p className="text-szn-text-2 mb-4">
                {t("docs.opentelemetryPage.production.sampling.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`import { Seizn } from 'seizn';

const client = new Seizn({
  apiKey: process.env.SEIZN_API_KEY,
  telemetry: {
    enabled: true,
    samplingRate: 0.1, // Sample 10% of traces
    // Or use tail-based sampling
    sampleOnlyErrors: true,
    sampleSlowRequests: {
      enabled: true,
      thresholdMs: 1000,
    },
  },
});`}
              />
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
                {t("docs.opentelemetryPage.production.attributes.title")}
              </h3>
              <p className="text-szn-text-2 mb-4">
                {t("docs.opentelemetryPage.production.attributes.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const client = new Seizn({
  apiKey: process.env.SEIZN_API_KEY,
  telemetry: {
    enabled: true,
    resourceAttributes: {
      'deployment.environment': 'production',
      'service.version': '1.2.3',
      'service.namespace': 'rag-apps',
    },
    spanAttributes: {
      'user.tier': 'enterprise',
      'feature.flag.rerank': 'enabled',
    },
  },
});`}
              />
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
                {t("docs.opentelemetryPage.production.batching.title")}
              </h3>
              <p className="text-szn-text-2 mb-4">
                {t("docs.opentelemetryPage.production.batching.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const client = new Seizn({
  apiKey: process.env.SEIZN_API_KEY,
  telemetry: {
    enabled: true,
    batchConfig: {
      maxQueueSize: 2048,
      scheduledDelayMs: 5000,
      maxExportBatchSize: 512,
    },
  },
});`}
              />
            </div>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">05</span>
            {t("docs.opentelemetryPage.troubleshooting.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-szn-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">
                    {t("docs.opentelemetryPage.troubleshooting.issueColumn")}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">
                    {t("docs.opentelemetryPage.troubleshooting.causeColumn")}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">
                    {t("docs.opentelemetryPage.troubleshooting.solutionColumn")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border">
                <tr>
                  <td className="px-6 py-4 text-szn-text-1 text-sm">{t("docs.opentelemetryPage.troubleshooting.noTracesIssue")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.opentelemetryPage.troubleshooting.noTracesCause")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.opentelemetryPage.troubleshooting.noTracesSolution")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-szn-text-1 text-sm">{t("docs.opentelemetryPage.troubleshooting.connectionIssue")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.opentelemetryPage.troubleshooting.connectionCause")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.opentelemetryPage.troubleshooting.connectionSolution")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-szn-text-1 text-sm">{t("docs.opentelemetryPage.troubleshooting.missingSpansIssue")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.opentelemetryPage.troubleshooting.missingSpansCause")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.opentelemetryPage.troubleshooting.missingSpansSolution")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Debug Mode */}
          <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-2">
              {t("docs.opentelemetryPage.troubleshooting.debugTitle")}
            </h4>
            <p className="text-amber-700 dark:text-amber-300 text-sm mb-3">
              {t("docs.opentelemetryPage.troubleshooting.debugDescription")}
            </p>
            <CodeBlock
              language="bash"
              code={`export SEIZN_TELEMETRY_DEBUG="true"
export OTEL_LOG_LEVEL="debug"`}
            />
          </div>
        </section>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-8 border-t border-szn-border">
          <Link
            href={`/${locale}/docs/integrations/llamaindex`}
            className="flex items-center gap-2 text-szn-text-2 hover:text-szn-accent transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("docs.opentelemetryPage.nav.prevLlamaIndex")}
          </Link>
          <Link
            href={`/${locale}/docs/integrations`}
            className="flex items-center gap-2 text-szn-text-2 hover:text-szn-accent transition-colors"
          >
            {t("docs.opentelemetryPage.nav.backToIntegrations")}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
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
