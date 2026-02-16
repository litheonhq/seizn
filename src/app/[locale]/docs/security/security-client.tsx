"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

export function SecurityClient({ locale }: Props) {
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
          <span className="text-zinc-900 dark:text-white">Security & Governance</span>
        </nav>

        {/* Title */}
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-white mb-4">
          Security & Governance
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-12">
          Learn about Seizn&apos;s security practices, data protection, and compliance features.
        </p>

        {/* Recent Hardening */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Recent Hardening (2026 Q1)
          </h2>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-5">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Tenant Policy Safety Rails</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Policy fallback handling was hardened to avoid unsafe pass-through behavior during partial failures.
                Tenant-level ingest caps are now consistently enforced in production paths.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-5">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Autopilot Webhook Idempotency</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Webhook processing now uses lock/claim/finalize semantics to handle retries and duplicate deliveries
                without writing duplicate operational records.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-5">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">E2E Encryption Verification</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Database migration flow includes automatic verification for encrypted-memory search RPC overloads.
                This helps prevent accidental regressions before deployment.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-5">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">FNA Operations Readiness</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                FNA (Failure Notification &amp; Analysis) runbook coverage was expanded for security events,
                webhook retries, and migration-time validation failures.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
              Recommended migration workflow:
            </p>
            <pre className="text-xs overflow-x-auto bg-zinc-950 text-zinc-100 rounded-lg p-4">
{`node scripts/run-migration-file.mjs <sql-file>
npm run verify:e2e-encryption-db`}
            </pre>
            <p className="text-xs mt-3 text-zinc-600 dark:text-zinc-400">
              `run-migration-file.mjs` triggers `verify:e2e-encryption-db` by default and fails fast on overload/RPC regressions.
              Use `SKIP_E2E_VERIFY=1` only for emergency bypass scenarios.
            </p>
          </div>
        </section>

        {/* Data Security */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Data Security
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Encryption at Rest</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">All data is encrypted using AES-256 encryption. Memory content, embeddings, and metadata are protected at all times.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Encryption in Transit</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">All API connections use TLS 1.3. We enforce HTTPS for all endpoints with no fallback to unencrypted connections.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Tenant Isolation</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">Complete data separation between accounts. Row-level security (RLS) ensures no cross-tenant data access.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* API Key Management */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            API Key Management
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Secure Key Storage</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">API keys are stored as SHA-256 hashes. The original key is shown only once at creation time.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Key Rotation</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">Create multiple active keys and rotate them without downtime. Old keys can be revoked instantly.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Automatic Expiration</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">Configure keys to auto-expire after 30, 60, 90 days, or custom periods. Expired keys are automatically rejected.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Usage Tracking</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">Monitor per-key usage in real-time. See request counts, last used time, and associated activity.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Data Retention & Deletion */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Data Retention & Deletion
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Data Export</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">Export all your data anytime via API or dashboard. Full data portability with no lock-in.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Hard Deletion</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">When you delete memories, they are permanently removed. No retention beyond 30-day backup window.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-500 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Right to be Forgotten (RTBF)</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">Full GDPR/CCPA support. Request deletion of all user data with auditable confirmation.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Compliance */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Compliance
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-blue-500 font-bold">GDPR</span>
              </div>
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">GDPR Compliant</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">Full compliance with EU General Data Protection Regulation. Data subject rights supported including access, rectification, and erasure.</p>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-purple-500 font-bold">CCPA</span>
              </div>
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">CCPA Compliant</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">California Consumer Privacy Act compliance. Know what data is collected and request deletion at any time.</p>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-amber-500 font-bold">SOC 2</span>
              </div>
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">SOC 2 Type II</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">Enterprise-grade security controls audited annually. Security, availability, and confidentiality principles.</p>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-emerald-500 font-bold">ISO</span>
              </div>
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">ISO 27001</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">Information security management system certification. Systematic approach to managing sensitive data.</p>
            </div>
          </div>
        </section>

        {/* Governance Features */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Governance Features
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Seizn provides comprehensive governance features for enterprise deployments:
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Audit Logs</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">Complete audit trail of all API operations. Who accessed what, when, and from where.</p>
              </div>

              <div className="p-4 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Policy Engine</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">Define policies for data handling: allow, deny, mask, or encrypt based on content type, tags, or patterns.</p>
              </div>

              <div className="p-4 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">PII Detection</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">Automatic detection and handling of personally identifiable information. Configure masking or blocking rules.</p>
              </div>

              <div className="p-4 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Evidence Pack Export</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">Generate comprehensive audit bundles for compliance reviews. Includes policy configs, PII events, and deletion reports.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Rate Limits & Quotas */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Rate Limits & Quotas
          </h2>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Seizn uses monthly quotas for billing and per-minute rate limits for burst protection:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Monthly Quotas</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">API calls and memory storage are billed monthly. Quotas reset at UTC midnight on the 1st of each month.</p>
              </div>

              <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Rate Limits</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">Per-minute request limits protect against burst traffic. Limits vary by plan (60-3000 RPM).</p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-emerald-600 dark:text-emerald-400 text-sm">
                <strong>RFC-Compliant Headers:</strong> All responses include <code className="bg-emerald-500/20 px-1 rounded">RateLimit-*</code> and <code className="bg-emerald-500/20 px-1 rounded">X-Quota-*</code> headers for programmatic limit tracking.
              </p>
            </div>
          </div>
        </section>

        {/* Contact Security Team */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Security Contact
          </h2>
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-6">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              For security concerns, vulnerability reports, or compliance inquiries:
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="mailto:security@seizn.com"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                security@seizn.com
              </a>
              <a
                href="https://seizn.com/.well-known/security.txt"
                className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                security.txt
              </a>
            </div>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <Link href={`/${locale}/docs/auth`} className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Authentication
          </Link>
          <Link href={`/${locale}/docs/limits`} className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-2">
            Limits & Quotas
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
