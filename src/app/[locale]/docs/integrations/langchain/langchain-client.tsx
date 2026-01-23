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
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-200 dark:bg-zinc-800 rounded-t-lg border-b border-zinc-300 dark:border-zinc-700">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</span>
          <span className="text-xs text-zinc-500">{language}</span>
        </div>
      )}
      <div className={`relative ${title ? 'rounded-b-lg' : 'rounded-lg'}`}>
        {!title && (
          <div className="absolute top-2 right-2 text-xs text-zinc-500">
            {language}
          </div>
        )}
        <button
          onClick={handleCopy}
          className="absolute top-2 right-12 px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre className={`bg-zinc-200 dark:bg-zinc-800 ${title ? '' : 'rounded-lg'} p-4 overflow-x-auto`}>
          <code className="text-sm text-zinc-700 dark:text-zinc-300">{code}</code>
        </pre>
      </div>
    </div>
  );
}

export function LangChainClient({ locale, dictionary }: Props) {
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
            <Link href={`/${locale}/docs/integrations`} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              {t("docs.integrationsPage.breadcrumb")}
            </Link>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="text-zinc-900 dark:text-white">LangChain</span>
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
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">🦜</span>
            <span className="px-3 py-1 text-sm font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg">
              {t("docs.langchainPage.badge")}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
            {t("docs.langchainPage.title")}
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400">
            {t("docs.langchainPage.subtitle")}
          </p>
        </div>

        {/* 60-Second Overview */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-500">01</span>
            {t("docs.langchainPage.overview.title")}
          </h2>
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              {t("docs.langchainPage.overview.description")}
            </p>
            <ul className="space-y-2 text-zinc-600 dark:text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#10003;</span>
                <span>{t("docs.langchainPage.overview.feature1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#10003;</span>
                <span>{t("docs.langchainPage.overview.feature2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#10003;</span>
                <span>{t("docs.langchainPage.overview.feature3")}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Installation */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-500">02</span>
            {t("docs.langchainPage.installation.title")}
          </h2>
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              {t("docs.langchainPage.installation.description")}
            </p>
            <CodeBlock
              language="bash"
              code={`# TypeScript / JavaScript
npm install seizn @langchain/core

# Python
pip install seizn langchain`}
              title="Installation"
            />
          </div>
        </section>

        {/* 5-Minute Example */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-500">03</span>
            {t("docs.langchainPage.example.title")}
          </h2>
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              {t("docs.langchainPage.example.description")}
            </p>

            <CodeBlock
              language="typescript"
              title="TypeScript"
              code={`import { SeiznRetriever } from 'seizn/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Initialize the Seizn retriever
const retriever = new SeiznRetriever({
  apiKey: process.env.SEIZN_API_KEY,
  dataset: 'my-docs',
  topK: 5,
  threshold: 0.7,
});

// Create a RAG chain
const llm = new ChatOpenAI({ model: 'gpt-4' });

const prompt = ChatPromptTemplate.fromTemplate(\`
Answer the question based on the following context:
{context}

Question: {input}
\`);

const documentChain = await createStuffDocumentsChain({ llm, prompt });
const retrievalChain = await createRetrievalChain({
  combineDocsChain: documentChain,
  retriever,
});

// Run the chain
const response = await retrievalChain.invoke({
  input: 'How do I configure rate limiting?',
});

console.log(response.answer);
// Trace ID available for debugging
console.log('Trace:', response.seiznTrace);`}
            />

            <CodeBlock
              language="python"
              title="Python"
              code={`from seizn.langchain import SeiznRetriever
from langchain_openai import ChatOpenAI
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

# Initialize the Seizn retriever
retriever = SeiznRetriever(
    api_key=os.environ["SEIZN_API_KEY"],
    dataset="my-docs",
    top_k=5,
    threshold=0.7,
)

# Create a RAG chain
llm = ChatOpenAI(model="gpt-4")

prompt = ChatPromptTemplate.from_template("""
Answer the question based on the following context:
{context}

Question: {input}
""")

document_chain = create_stuff_documents_chain(llm, prompt)
retrieval_chain = create_retrieval_chain(retriever, document_chain)

# Run the chain
response = retrieval_chain.invoke({
    "input": "How do I configure rate limiting?"
})

print(response["answer"])
# Trace ID available for debugging
print("Trace:", response.get("seizn_trace"))`}
            />
          </div>
        </section>

        {/* Production Tips */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-500">04</span>
            {t("docs.langchainPage.production.title")}
          </h2>
          <div className="space-y-4">
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">
                {t("docs.langchainPage.production.caching.title")}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                {t("docs.langchainPage.production.caching.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const retriever = new SeiznRetriever({
  apiKey: process.env.SEIZN_API_KEY,
  dataset: 'my-docs',
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
  },
});`}
              />
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">
                {t("docs.langchainPage.production.reranking.title")}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                {t("docs.langchainPage.production.reranking.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const retriever = new SeiznRetriever({
  apiKey: process.env.SEIZN_API_KEY,
  dataset: 'my-docs',
  rerank: {
    enabled: true,
    model: 'cohere-rerank-v3',
    topN: 3,
  },
});`}
              />
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">
                {t("docs.langchainPage.production.filtering.title")}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                {t("docs.langchainPage.production.filtering.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`const retriever = new SeiznRetriever({
  apiKey: process.env.SEIZN_API_KEY,
  dataset: 'my-docs',
  filter: {
    category: 'api-docs',
    language: 'en',
  },
});`}
              />
            </div>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-500">05</span>
            {t("docs.langchainPage.troubleshooting.title")}
          </h2>
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-200 dark:bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("docs.langchainPage.troubleshooting.errorColumn")}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("docs.langchainPage.troubleshooting.causeColumn")}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("docs.langchainPage.troubleshooting.solutionColumn")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr>
                  <td className="px-6 py-4"><code className="text-red-500 text-sm">SEIZN_AUTH_ERROR</code></td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 text-sm">{t("docs.langchainPage.troubleshooting.authCause")}</td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 text-sm">{t("docs.langchainPage.troubleshooting.authSolution")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-500 text-sm">SEIZN_RATE_LIMIT</code></td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 text-sm">{t("docs.langchainPage.troubleshooting.rateCause")}</td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 text-sm">{t("docs.langchainPage.troubleshooting.rateSolution")}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-amber-500 text-sm">Empty results</code></td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 text-sm">{t("docs.langchainPage.troubleshooting.emptyCause")}</td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 text-sm">{t("docs.langchainPage.troubleshooting.emptySolution")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <Link
            href={`/${locale}/docs/integrations`}
            className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("docs.langchainPage.nav.backToIntegrations")}
          </Link>
          <Link
            href={`/${locale}/docs/integrations/llamaindex`}
            className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            {t("docs.langchainPage.nav.nextLlamaIndex")}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
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
