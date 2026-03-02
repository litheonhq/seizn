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

export function LlamaIndexClient({ locale, dictionary }: Props) {
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
            <span className="text-szn-text-1">LlamaIndex</span>
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
            <span className="text-4xl">🦙</span>
            <span className="px-3 py-1 text-sm font-medium bg-szn-accent/10 text-szn-accent rounded-lg">
              {t("docs.llamaindexPage.badge")}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-szn-text-1 mb-4">
            {t("docs.llamaindexPage.title")}
          </h1>
          <p className="text-xl text-szn-text-2">
            {t("docs.llamaindexPage.subtitle")}
          </p>
        </div>

        {/* 60-Second Overview */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">01</span>
            {t("docs.llamaindexPage.overview.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.llamaindexPage.overview.description")}
            </p>
            <ul className="space-y-2 text-szn-text-2">
              <li className="flex items-start gap-2">
                <span className="text-szn-accent mt-1">&#10003;</span>
                <span>{t("docs.llamaindexPage.overview.feature1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-szn-accent mt-1">&#10003;</span>
                <span>{t("docs.llamaindexPage.overview.feature2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-szn-accent mt-1">&#10003;</span>
                <span>{t("docs.llamaindexPage.overview.feature3")}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Installation */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">02</span>
            {t("docs.llamaindexPage.installation.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.llamaindexPage.installation.description")}
            </p>
            <CodeBlock
              language="bash"
              code={`# TypeScript / JavaScript
npm install seizn llamaindex

# Python
pip install seizn llama-index`}
              title="Installation"
            />
          </div>
        </section>

        {/* 5-Minute Example */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">03</span>
            {t("docs.llamaindexPage.example.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
            <p className="text-szn-text-1 mb-4">
              {t("docs.llamaindexPage.example.description")}
            </p>

            <CodeBlock
              language="typescript"
              title="TypeScript"
              code={`import { SeiznRetriever } from 'seizn/llamaindex';
import { OpenAI } from 'llamaindex';
import { VectorStoreIndex, RetrieverQueryEngine } from 'llamaindex';

// Initialize the Seizn retriever
const retriever = new SeiznRetriever({
  apiKey: process.env.SEIZN_API_KEY,
  dataset: 'my-docs',
  topK: 5,
  threshold: 0.7,
});

// Create a query engine with the retriever
const llm = new OpenAI({ model: 'gpt-4' });
const queryEngine = new RetrieverQueryEngine(retriever, llm);

// Query your documents
const response = await queryEngine.query(
  'How do I configure rate limiting?'
);

console.log(response.response);
// Access the trace for debugging
console.log('Trace:', response.metadata?.seiznTrace);`}
            />

            <CodeBlock
              language="python"
              title="Python"
              code={`import os
from seizn.llamaindex import SeiznRetriever
from llama_index.llms.openai import OpenAI
from llama_index.core.query_engine import RetrieverQueryEngine

# Initialize the Seizn retriever
retriever = SeiznRetriever(
    api_key=os.environ["SEIZN_API_KEY"],
    dataset="my-docs",
    top_k=5,
    threshold=0.7,
)

# Create a query engine with the retriever
llm = OpenAI(model="gpt-4")
query_engine = RetrieverQueryEngine.from_args(
    retriever=retriever,
    llm=llm,
)

# Query your documents
response = query_engine.query(
    "How do I configure rate limiting?"
)

print(response.response)
# Access the trace for debugging
print("Trace:", response.metadata.get("seizn_trace"))`}
            />
          </div>
        </section>

        {/* Production Tips */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">04</span>
            {t("docs.llamaindexPage.production.title")}
          </h2>
          <div className="space-y-4">
            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
                {t("docs.llamaindexPage.production.streaming.title")}
              </h3>
              <p className="text-szn-text-2 mb-4">
                {t("docs.llamaindexPage.production.streaming.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const queryEngine = new RetrieverQueryEngine(retriever, llm);

// Enable streaming response
const stream = await queryEngine.query(
  'Explain the authentication flow',
  { streaming: true }
);

for await (const chunk of stream) {
  process.stdout.write(chunk.response);
}`}
              />
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
                {t("docs.llamaindexPage.production.hybrid.title")}
              </h3>
              <p className="text-szn-text-2 mb-4">
                {t("docs.llamaindexPage.production.hybrid.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const retriever = new SeiznRetriever({
  apiKey: process.env.SEIZN_API_KEY,
  dataset: 'my-docs',
  searchMode: 'hybrid', // vector + keyword
  hybridAlpha: 0.7,     // 70% vector, 30% keyword
});`}
              />
            </div>

            <div className="bg-szn-surface border border-szn-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-szn-text-1 mb-3">
                {t("docs.llamaindexPage.production.nodePostprocessors.title")}
              </h3>
              <p className="text-szn-text-2 mb-4">
                {t("docs.llamaindexPage.production.nodePostprocessors.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`import { SimilarityPostprocessor, KeywordNodePostprocessor } from 'llamaindex';

const queryEngine = new RetrieverQueryEngine(retriever, llm, {
  nodePostprocessors: [
    new SimilarityPostprocessor({ similarityCutoff: 0.7 }),
    new KeywordNodePostprocessor({
      requiredKeywords: ['authentication'],
      excludeKeywords: ['deprecated'],
    }),
  ],
});`}
              />
            </div>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-szn-text-1 mb-4 flex items-center gap-2">
            <span className="text-szn-accent">05</span>
            {t("docs.llamaindexPage.troubleshooting.title")}
          </h2>
          <div className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-szn-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">
                    {t("docs.llamaindexPage.troubleshooting.errorColumn")}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">
                    {t("docs.llamaindexPage.troubleshooting.causeColumn")}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-szn-text-1">
                    {t("docs.llamaindexPage.troubleshooting.solutionColumn")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border">
                <tr>
                  <td className="px-6 py-4"><code className="text-red-500 text-sm">SEIZN_AUTH_ERROR</code></td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.llamaindexPage.troubleshooting.authCause")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.llamaindexPage.troubleshooting.authSolution")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-500 text-sm">SEIZN_DATASET_NOT_FOUND</code></td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.llamaindexPage.troubleshooting.datasetCause")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.llamaindexPage.troubleshooting.datasetSolution")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-amber-500 text-sm">Low relevance scores</code></td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.llamaindexPage.troubleshooting.relevanceCause")}</td>
                  <td className="px-6 py-4 text-szn-text-2 text-sm">{t("docs.llamaindexPage.troubleshooting.relevanceSolution")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-8 border-t border-szn-border">
          <Link
            href={`/${locale}/docs/integrations/langchain`}
            className="flex items-center gap-2 text-szn-text-2 hover:text-szn-accent transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("docs.llamaindexPage.nav.prevLangChain")}
          </Link>
          <Link
            href={`/${locale}/docs/integrations/opentelemetry`}
            className="flex items-center gap-2 text-szn-text-2 hover:text-szn-accent transition-colors"
          >
            {t("docs.llamaindexPage.nav.nextOpenTelemetry")}
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
