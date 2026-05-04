"use client";

import Link from "next/link";

const providers = [
  {
    name: "OpenAI",
    models: ["text-embedding-3-small", "text-embedding-3-large", "gpt-4o"],
    useCase: "Embedding, RAG Generation",
    icon: "🟢",
  },
  {
    name: "Anthropic",
    models: ["Claude 3.5 Sonnet", "Claude 3.5 Haiku"],
    useCase: "RAG Generation",
    icon: "🟠",
  },
  {
    name: "Cohere",
    models: ["embed-v3", "rerank-v3"],
    useCase: "Embedding, Reranking",
    icon: "🔵",
  },
  {
    name: "Voyage",
    models: ["voyage-3", "voyage-3-lite"],
    useCase: "Embedding",
    icon: "🟣",
  },
];

const steps = [
  {
    title: "Dashboard Configuration",
    description: "Add your provider keys in the dashboard settings.",
    code: null,
    action: {
      label: "Go to Settings",
      href: "/dashboard/settings",
    },
  },
  {
    title: "SDK Configuration",
    description: "Configure providers when initializing the Seizn client.",
    code: `import { Seizn } from 'seizn';

const seizn = new Seizn({
  apiKey: 'szn_...',
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    cohere: {
      apiKey: process.env.COHERE_API_KEY,
    }
  }
});`,
  },
  {
    title: "Per-Request Override",
    description: "Specify providers for individual requests.",
    code: `const results = await seizn.search({
  query: "authentication best practices",
  provider: {
    embedding: "openai",
    reranking: "cohere"
  }
});`,
  },
];

export default function BYOKPage() {
  return (
    <div className="min-h-screen bg-[var(--ink-50)]">
      {/* Header */}
      <header className="border-b border-[var(--ink-200)] sticky top-0 bg-[var(--ink-50)]/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-[var(--ink-900)]">
              Seizn<span className="text-[var(--ink-900)]">.</span>
            </Link>
            <span className="text-[var(--ink-600)]">/</span>
            <Link href="/docs" className="text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
              Docs
            </Link>
            <span className="text-[var(--ink-600)]">/</span>
            <span className="text-[var(--ink-900)]">BYOK</span>
          </div>
          <Link
            href="/dashboard/settings"
            className="px-4 py-2 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-[var(--ink-900)] font-medium rounded-lg transition-colors text-sm"
          >
            Configure Keys
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-blue-400/10 text-blue-400 text-sm font-medium rounded-full">
              Cost Control
            </span>
            <span className="text-[var(--ink-500)]">•</span>
            <span className="text-[var(--ink-600)] text-sm">Bring Your Own Key</span>
          </div>
          <h1 className="text-4xl font-bold text-[var(--ink-900)] mb-4">
            BYOK (Bring Your Own Key)
          </h1>
          <p className="text-xl text-[var(--ink-600)] max-w-2xl">
            Use your own API keys for embedding and LLM providers with Seizn.
            Pay providers directly, use Seizn for orchestration only.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl">
            <div className="w-10 h-10 bg-[var(--ink-900)]/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[var(--ink-900)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[var(--ink-900)] mb-2">Cost Control</h3>
            <p className="text-[var(--ink-600)] text-sm">
              Pay providers directly. Use Seizn for orchestration at reduced rates.
            </p>
          </div>

          <div className="p-6 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[var(--ink-900)] mb-2">Compliance</h3>
            <p className="text-[var(--ink-600)] text-sm">
              Keep API traffic within your existing provider agreements.
            </p>
          </div>

          <div className="p-6 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl">
            <div className="w-10 h-10 bg-[var(--ink-900)]/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[var(--ink-700)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[var(--ink-900)] mb-2">Flexibility</h3>
            <p className="text-[var(--ink-600)] text-sm">
              Switch providers without changing your Seizn integration.
            </p>
          </div>
        </div>

        {/* Supported Providers */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-6">Supported Providers</h2>
          <div className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--ink-50)]">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Provider</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Models</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Use Case</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink-200)]">
                {providers.map((provider) => (
                  <tr key={provider.name}>
                    <td className="px-6 py-4 text-[var(--ink-900)] font-medium">
                      <span className="mr-2">{provider.icon}</span>
                      {provider.name}
                    </td>
                    <td className="px-6 py-4 text-[var(--ink-600)] text-sm">
                      {provider.models.join(", ")}
                    </td>
                    <td className="px-6 py-4 text-[var(--ink-600)] text-sm">{provider.useCase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Setup Steps */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-6">Setup</h2>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div key={index} className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 bg-[var(--ink-900)]/10 text-[var(--ink-900)] rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--ink-900)]">{step.title}</h3>
                    <p className="text-[var(--ink-600)] text-sm">{step.description}</p>
                  </div>
                </div>

                {step.action && (
                  <Link
                    href={step.action.href}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-[var(--ink-900)] font-medium rounded-lg transition-colors text-sm ml-12"
                  >
                    {step.action.label}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                )}

                {step.code && (
                  <div className="bg-[var(--ink-50)] rounded-lg p-4 ml-12 overflow-x-auto">
                    <pre className="text-sm text-[var(--ink-900)]">
                      <code>{step.code}</code>
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Cost Comparison */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-6">Cost Comparison</h2>
          <div className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--ink-50)]">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Mode</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Embedding Cost</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Seizn Fee</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-600)]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink-200)]">
                <tr>
                  <td className="px-6 py-4 text-[var(--ink-900)] font-medium">Managed</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">Included</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">$0.001/query</td>
                  <td className="px-6 py-4 text-[var(--ink-900)] font-medium">$0.001/query</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-[var(--ink-900)] font-medium">BYOK</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">Your provider rate</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">$0.0005/query</td>
                  <td className="px-6 py-4 text-blue-400 font-medium">Provider + $0.0005</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Security */}
        <div className="mb-12 p-6 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl">
          <h2 className="text-xl font-bold text-[var(--ink-900)] mb-4">Security</h2>
          <ul className="space-y-3 text-[var(--ink-600)]">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--ink-900)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Keys are encrypted at rest (AES-256)
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--ink-900)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Keys are never logged or exposed in traces
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--ink-900)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              You can rotate keys anytime without downtime
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--ink-900)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Keys are scoped to your organization only
            </li>
          </ul>
        </div>

        {/* FAQ */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-6">FAQ</h2>
          <div className="space-y-4">
            <div className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl p-6">
              <h3 className="text-[var(--ink-900)] font-medium mb-2">Can I mix BYOK and Managed?</h3>
              <p className="text-[var(--ink-600)] text-sm">Yes. Use BYOK for embeddings, Managed for reranking, etc.</p>
            </div>
            <div className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl p-6">
              <h3 className="text-[var(--ink-900)] font-medium mb-2">Are BYOK queries counted against my Seizn quota?</h3>
              <p className="text-[var(--ink-600)] text-sm">Yes, API calls count regardless of key source. Only LLM costs differ.</p>
            </div>
            <div className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl p-6">
              <h3 className="text-[var(--ink-900)] font-medium mb-2">What happens if my provider key expires?</h3>
              <p className="text-[var(--ink-600)] text-sm">Queries fail with SEIZN_401 error. Seizn does not fall back automatically.</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center p-8 bg-gradient-to-br from-[var(--ink-900)]/10 to-[var(--ink-900)]-2/10 border border-[var(--ink-900)]/30 rounded-2xl">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">Ready to configure BYOK?</h2>
          <p className="text-[var(--ink-600)] mb-6">Add your provider keys in the dashboard to get started.</p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-[var(--ink-900)] font-medium rounded-lg transition-colors"
          >
            Configure Keys
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--ink-200)] py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-[var(--ink-500)] text-sm">
          Need help? Contact <a href="mailto:support@seizn.com" className="text-[var(--ink-900)] hover:underline">support@seizn.com</a>
        </div>
      </footer>
    </div>
  );
}
