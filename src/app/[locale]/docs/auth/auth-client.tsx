"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="relative mt-4">
      <div className="absolute top-2 right-2 text-xs text-zinc-500">
        {language}
      </div>
      <pre className="bg-zinc-200 dark:bg-zinc-800 rounded-lg p-4 overflow-x-auto">
        <code className="text-sm text-zinc-700 dark:text-zinc-300">{code}</code>
      </pre>
    </div>
  );
}

export function AuthClient({ locale }: Props) {
  const currentYear = new Date().getFullYear();

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
              Docs
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm text-zinc-500">
          <Link href={`/${locale}/docs`} className="hover:text-emerald-600">Docs</Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-900 dark:text-white">Authentication</span>
        </nav>

        {/* Title */}
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
          Authentication
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-12">
          Learn how to authenticate your requests to the Seizn API.
        </p>

        {/* Bearer Token (Canonical) */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Bearer Token Authentication
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              All API requests require authentication using a Bearer token in the <code className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded text-emerald-600 dark:text-emerald-400">Authorization</code> header.
            </p>
            <CodeBlock
              language="bash"
              code={`curl -H "Authorization: Bearer szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-emerald-600 dark:text-emerald-400 text-sm">
                <strong>Recommended:</strong> Use the <code className="bg-emerald-500/20 px-1 rounded">Authorization: Bearer</code> header for all new integrations.
              </p>
            </div>
          </div>
        </section>

        {/* API Key Format */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            API Key Format
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              Seizn API keys follow this format:
            </p>
            <CodeBlock
              language="text"
              code={`szn_<random_string>

Example: szn_abc123def456ghi789jkl012mno345pqr`}
            />
            <ul className="mt-4 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500">•</span>
                <span>Prefix <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">szn_</code> identifies Seizn keys</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500">•</span>
                <span>36 character random string follows the prefix</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500">•</span>
                <span>Keys are case-sensitive</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Legacy x-api-key (Deprecated) */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Legacy: x-api-key Header
            <span className="ml-3 px-2 py-1 text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">Deprecated</span>
          </h2>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-amber-600 dark:text-amber-400 font-medium mb-2">
                  Deprecation Notice
                </p>
                <p className="text-zinc-700 dark:text-zinc-300 text-sm">
                  The <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">x-api-key</code> header is deprecated and will be removed on <strong>May 1, 2026</strong>. Please migrate to <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">Authorization: Bearer</code>.
                </p>
              </div>
            </div>
            <CodeBlock
              language="bash"
              code={`# Deprecated - do not use for new integrations
curl -H "x-api-key: szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <p className="mt-4 text-zinc-600 dark:text-zinc-400 text-sm">
              When using the deprecated header, the API will return these headers:
            </p>
            <CodeBlock
              language="http"
              code={`Deprecation: true
Sunset: 2026-05-01T00:00:00Z
Link: <https://seizn.com/docs/auth#migration>; rel="deprecation"
X-Deprecation-Notice: x-api-key header is deprecated. Use Authorization: Bearer instead.`}
            />
          </div>
        </section>

        {/* Migration Guide */}
        <section className="mb-12" id="migration">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Migration Guide
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-6">
              Follow these steps to migrate from <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">x-api-key</code> to <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">Authorization: Bearer</code>:
            </p>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Update Header Name</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-2">Change the header from <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">x-api-key</code> to <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">Authorization</code>.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Add Bearer Prefix</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-2">Prepend <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">Bearer </code> (with a space) to your API key.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Test Your Integration</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-2">Verify your requests work with the new header format.</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-red-500 dark:text-red-400 mb-2">Before (Deprecated)</p>
                <CodeBlock
                  language="bash"
                  code={`curl -H "x-api-key: szn_xxx" ...`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-500 dark:text-emerald-400 mb-2">After (Recommended)</p>
                <CodeBlock
                  language="bash"
                  code={`curl -H "Authorization: Bearer szn_xxx" ...`}
                />
              </div>
            </div>
          </div>
        </section>

        {/* SDK Examples */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            SDK Authentication
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Python</h3>
              <CodeBlock
                language="python"
                code={`from seizn import Seizn

# API key from environment variable (recommended)
client = Seizn()

# Or pass explicitly
client = Seizn(api_key="szn_xxx")`}
              />
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">JavaScript</h3>
              <CodeBlock
                language="javascript"
                code={`import { Seizn } from 'seizn';

// API key from environment variable (recommended)
const client = new Seizn();

// Or pass explicitly
const client = new Seizn({ apiKey: 'szn_xxx' });`}
              />
            </div>
          </div>
        </section>

        {/* Security Best Practices */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Security Best Practices
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <ul className="space-y-4 text-zinc-600 dark:text-zinc-400">
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                <div>
                  <strong className="text-zinc-700 dark:text-zinc-300">Never expose keys in client-side code</strong>
                  <p className="text-sm mt-1">API keys should only be used server-side. Use a backend proxy for browser applications.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                <div>
                  <strong className="text-zinc-700 dark:text-zinc-300">Use environment variables</strong>
                  <p className="text-sm mt-1">Store API keys in environment variables, not in source code.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                <div>
                  <strong className="text-zinc-700 dark:text-zinc-300">Rotate keys regularly</strong>
                  <p className="text-sm mt-1">Generate new keys periodically and revoke old ones from the dashboard.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                <div>
                  <strong className="text-zinc-700 dark:text-zinc-300">Set key expiration</strong>
                  <p className="text-sm mt-1">Configure auto-expiration for keys (90 days recommended).</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Error Responses */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Authentication Errors
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-200 dark:bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Error Code</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr>
                  <td className="px-6 py-4"><code className="text-red-600 dark:text-red-400">AUTH_MISSING_KEY</code></td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">401</td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">No API key provided</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-600 dark:text-red-400">AUTH_INVALID_KEY</code></td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">401</td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">Invalid or inactive API key</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-red-600 dark:text-red-400">AUTH_EXPIRED_KEY</code></td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">401</td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">API key has expired</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <Link href={`/${locale}/docs`} className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Docs
          </Link>
          <Link href={`/${locale}/docs/security`} className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-2">
            Security & Governance
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
          &copy; {currentYear} Seizn. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
