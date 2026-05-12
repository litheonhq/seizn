"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SECURITY_POLICY, formatDays } from "@/lib/policy";

type Dictionary = Record<string, unknown>;

const recommendedKeyExpiryWindow = formatDays(SECURITY_POLICY.API_KEY_EXPIRY_RECOMMENDED_DAYS);

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="relative mt-4">
      <div className="absolute top-2 right-2 text-xs text-[var(--ink-500)]">
        {language}
      </div>
      <pre className="bg-[var(--ink-50)] rounded-lg p-4 overflow-x-auto">
        <code className="text-sm text-[var(--ink-900)]">{code}</code>
      </pre>
    </div>
  );
}

export function AuthClient({ locale }: Props) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[var(--ink-50)]">
      {/* Header */}
      <header className="border-b border-[var(--ink-200)] sticky top-0 bg-[var(--ink-50)]/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-[var(--ink-900)]">
            Seizn<span className="text-[var(--ink-900)]">.</span>
          </Link>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/docs`}
              className="text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/80 text-white font-medium rounded-lg transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm text-[var(--ink-500)]">
          <Link href={`/${locale}/docs`} className="hover:text-[var(--ink-900)]">Docs</Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--ink-900)]">Authentication</span>
        </nav>

        {/* Title */}
        <h1 className="text-4xl font-bold text-[var(--ink-900)] mb-4">
          Authentication
        </h1>
        <p className="text-xl text-[var(--ink-600)] mb-12">
          Learn how to authenticate your requests to the Seizn API.
        </p>

        {/* Bearer Token (Canonical) */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            Bearer Token Authentication
          </h2>
          <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
            <p className="text-[var(--ink-900)] mb-4">
              All API requests require authentication using a Bearer token in the <code className="px-2 py-1 bg-[var(--ink-50)] rounded text-[var(--ink-900)]">Authorization</code> header.
            </p>
            <CodeBlock
              language="bash"
              code={`curl -H "Authorization: Bearer szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <div className="mt-6 p-4 bg-[var(--ink-900)]/10 border border-[var(--ink-900)]/20 rounded-lg">
              <p className="text-[var(--ink-900)] text-sm">
                <strong>Recommended:</strong> Use the <code className="bg-[var(--ink-900)]/20 px-1 rounded">Authorization: Bearer</code> header for all new integrations.
              </p>
            </div>
          </div>
        </section>

        {/* API Key Format */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            API Key Format
          </h2>
          <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
            <p className="text-[var(--ink-900)] mb-4">
              Seizn API keys follow this format:
            </p>
            <CodeBlock
              language="text"
              code={`szn_<random_string>

Example: szn_abc123def456ghi789jkl012mno345pqr`}
            />
            <ul className="mt-4 space-y-2 text-[var(--ink-600)]">
              <li className="flex items-start gap-2">
                <span className="text-[var(--ink-900)]">•</span>
                <span>Prefix <code className="bg-[var(--ink-50)] px-1 rounded">szn_</code> identifies Seizn keys</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--ink-900)]">•</span>
                <span>36 character random string follows the prefix</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--ink-900)]">•</span>
                <span>Keys are case-sensitive</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Legacy x-api-key (Deprecated) */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            Legacy: x-api-key Header
            <span className="ml-3 px-2 py-1 text-xs bg-[var(--signal-pending)]/20 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] rounded">Deprecated</span>
          </h2>
          <div className="bg-[var(--signal-pending)]/5 border border-[var(--signal-pending)]/20 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-[var(--signal-pending-ink)] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] font-medium mb-2">
                  Deprecation Notice
                </p>
                <p className="text-[var(--ink-900)] text-sm">
                  The <code className="bg-[var(--ink-50)] px-1 rounded">x-api-key</code> header is deprecated and will be removed on <strong>May 1, 2026</strong>. Please migrate to <code className="bg-[var(--ink-50)] px-1 rounded">Authorization: Bearer</code>.
                </p>
              </div>
            </div>
            <CodeBlock
              language="bash"
              code={`# Deprecated - do not use for new integrations
curl -H "x-api-key: szn_your_api_key_here" \\
  https://seizn.com/api/memories?query=test`}
            />
            <p className="mt-4 text-[var(--ink-600)] text-sm">
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
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            Migration Guide
          </h2>
          <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
            <p className="text-[var(--ink-900)] mb-6">
              Follow these steps to migrate from <code className="bg-[var(--ink-50)] px-1 rounded">x-api-key</code> to <code className="bg-[var(--ink-50)] px-1 rounded">Authorization: Bearer</code>:
            </p>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[var(--ink-900)] text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h3 className="font-semibold text-[var(--ink-900)] mb-2">Update Header Name</h3>
                  <p className="text-[var(--ink-600)] text-sm mb-2">Change the header from <code className="bg-[var(--ink-50)] px-1 rounded">x-api-key</code> to <code className="bg-[var(--ink-50)] px-1 rounded">Authorization</code>.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[var(--ink-900)] text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h3 className="font-semibold text-[var(--ink-900)] mb-2">Add Bearer Prefix</h3>
                  <p className="text-[var(--ink-600)] text-sm mb-2">Prepend <code className="bg-[var(--ink-50)] px-1 rounded">Bearer </code> (with a space) to your API key.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[var(--ink-900)] text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h3 className="font-semibold text-[var(--ink-900)] mb-2">Test Your Integration</h3>
                  <p className="text-[var(--ink-600)] text-sm mb-2">Verify your requests work with the new header format.</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] mb-2">Before (Deprecated)</p>
                <CodeBlock
                  language="bash"
                  code={`curl -H "x-api-key: szn_xxx" ...`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--ink-900)] mb-2">After (Recommended)</p>
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
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            SDK Authentication
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
              <h3 className="font-semibold text-[var(--ink-900)] mb-4">Python</h3>
              <CodeBlock
                language="python"
                code={`from seizn import Seizn

# API key from environment variable (recommended)
client = Seizn()

# Or pass explicitly
client = Seizn(api_key="szn_xxx")`}
              />
            </div>
            <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
              <h3 className="font-semibold text-[var(--ink-900)] mb-4">JavaScript</h3>
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
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            Security Best Practices
          </h2>
          <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
            <ul className="space-y-4 text-[var(--ink-600)]">
              <li className="flex items-start gap-3">
                <span className="text-[var(--ink-900)] mt-0.5">✓</span>
                <div>
                  <strong className="text-[var(--ink-900)]">Never expose keys in client-side code</strong>
                  <p className="text-sm mt-1">API keys should only be used server-side. Use a backend proxy for browser applications.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--ink-900)] mt-0.5">✓</span>
                <div>
                  <strong className="text-[var(--ink-900)]">Use environment variables</strong>
                  <p className="text-sm mt-1">Store API keys in environment variables, not in source code.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--ink-900)] mt-0.5">✓</span>
                <div>
                  <strong className="text-[var(--ink-900)]">Rotate keys regularly</strong>
                  <p className="text-sm mt-1">Generate new keys periodically and revoke old ones from the dashboard.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--ink-900)] mt-0.5">✓</span>
                <div>
                  <strong className="text-[var(--ink-900)]">Set key expiration</strong>
                  <p className="text-sm mt-1">Configure auto-expiration for keys ({recommendedKeyExpiryWindow} recommended).</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Error Responses */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--ink-900)] mb-4">
            Authentication Errors
          </h2>
          <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--ink-50)]">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-900)]">Error Code</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-900)]">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[var(--ink-900)]">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink-200)]">
                <tr>
                  <td className="px-6 py-4"><code className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">AUTH_MISSING_KEY</code></td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">401</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">No API key provided</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">AUTH_INVALID_KEY</code></td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">401</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">Invalid or inactive API key</td>
                </tr>
                <tr>
                  <td className="px-6 py-4"><code className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">AUTH_EXPIRED_KEY</code></td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">401</td>
                  <td className="px-6 py-4 text-[var(--ink-600)]">API key has expired</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-[var(--ink-200)]">
          <Link href={`/${locale}/docs`} className="text-[var(--ink-900)] hover:underline flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Docs
          </Link>
          <Link href={`/${locale}/docs/security`} className="text-[var(--ink-900)] hover:underline flex items-center gap-2">
            Security & Governance
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--ink-200)] py-8 mt-12">
        <div className="max-w-6xl mx-auto px-6 text-center text-[var(--ink-500)] text-sm">
          &copy; {currentYear} Seizn. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
