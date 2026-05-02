"use client";

import { useState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface TrustClientProps {
  dict: Dictionary;
  locale: Locale;
}

// ============================================
// Icons
// ============================================

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const DatabaseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const DocumentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ServerIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ============================================
// Section Components
// ============================================

type SectionId = "dataFlow" | "encryption" | "tenantIsolation" | "retention" | "auditLogs" | "subprocessors" | "disclosure";

interface SectionProps {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function Section({ title, icon, children, isActive, onClick }: SectionProps) {
  return (
    <div
      className={`border rounded-xl transition-all cursor-pointer ${
        isActive
          ? "border-blue-500 bg-gray-900/80"
          : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${isActive ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 text-gray-400"}`}>
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <svg
          className={`w-5 h-5 ml-auto text-gray-400 transition-transform ${isActive ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isActive && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-800">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function TrustClient({ dict, locale }: TrustClientProps) {
  const [activeSection, setActiveSection] = useState<SectionId | null>("dataFlow");

  // Get translations with fallback
  const t = dict.trustPage || {
    title: "Trust Center",
    subtitle: "Security and data practices at Seizn",
    heroDescription: "We build with privacy and security at the core. This page documents exactly what we do with your data.",
    lastUpdated: "Last updated",
    sections: {
      dataFlow: {
        title: "Data Flow",
        description: "What we store and what we don't",
        stored: {
          title: "What We Store",
          items: [
            "Memory content and embeddings",
            "Query logs (hashed, not plaintext)",
            "API usage metrics per key",
            "Trace data for debugging (configurable retention)"
          ]
        },
        notStored: {
          title: "What We DON'T Store",
          items: [
            "Raw API keys (only hashed)",
            "User passwords (OAuth only)",
            "Query results beyond cache TTL",
            "Third-party LLM request/response logs"
          ]
        }
      },
      encryption: {
        title: "Encryption",
        description: "Data protection in transit and at rest",
        transit: {
          title: "In Transit",
          items: [
            "TLS 1.3 enforced for all connections",
            "HSTS enabled with 1-year max-age",
            "Certificate transparency logging"
          ]
        },
        atRest: {
          title: "At Rest",
          items: [
            "AES-256 encryption for all stored data",
            "Database-level encryption (Supabase)",
            "Encrypted backups with separate keys"
          ]
        },
        keyManagement: {
          title: "Key Management",
          items: [
            "API keys hashed with SHA-256 + salt",
            "Automatic key rotation reminders (90 days)",
            "Instant key revocation capability"
          ]
        }
      },
      tenantIsolation: {
        title: "Tenant Isolation",
        description: "How we keep your data separate",
        items: [
          "Row-Level Security (RLS) enforced at database level",
          "All queries filtered by user_id/org_id automatically",
          "No shared indexes across tenants",
          "Namespace separation for memory collections"
        ],
        rbac: {
          title: "Access Control",
          items: [
            "Role-based access (Owner, Admin, Member)",
            "Per-organization API key scoping",
            "Audit logs for all permission changes"
          ]
        }
      },
      retention: {
        title: "Retention & Deletion",
        description: "How long we keep data and how to delete it",
        periods: [
          { type: "Memories", period: "Until deleted by user" },
          { type: "API Logs", period: "90 days rolling" },
          { type: "Traces", period: "30 days (configurable)" },
          { type: "Audit Logs", period: "1 year" },
          { type: "Backups", period: "30 days encrypted" }
        ],
        deletion: {
          title: "Deletion Process",
          items: [
            "DELETE /api/memories removes immediately",
            "Account deletion: 30-day grace period",
            "Hard delete from backups within 30 days",
            "GDPR/CCPA data export available on request"
          ]
        }
      },
      auditLogs: {
        title: "Audit Logs & Access Controls",
        description: "Tracking who does what",
        logged: {
          title: "Events We Log",
          items: [
            "API key creation, rotation, revocation",
            "Permission changes (RBAC)",
            "Data export requests",
            "Failed authentication attempts",
            "Admin actions on organization"
          ]
        },
        access: {
          title: "Log Access",
          items: [
            "Available to organization admins",
            "Exportable via API (Pro+ plans)",
            "Searchable by user, action, timestamp"
          ]
        }
      },
      subprocessors: {
        title: "Subprocessors",
        description: "Third parties that process your data",
        processors: [
          { name: "Supabase", purpose: "Database & Auth", location: "US (AWS)" },
          { name: "Vercel", purpose: "Hosting & CDN", location: "Global Edge" },
          { name: "Paddle", purpose: "Payments", location: "UK/US" },
          { name: "PostHog", purpose: "Product Analytics", location: "EU" },
          { name: "Sentry", purpose: "Error Monitoring", location: "US" },
          { name: "Cohere", purpose: "Reranking (optional)", location: "US/Canada" }
        ],
        note: "We only share the minimum data required for each service to function."
      },
      disclosure: {
        title: "What We Don't Do Yet",
        description: "Honest gaps in our security posture",
        items: [
          "SOC 2 Type II certification (in progress, ETA Q2 2026)",
          "HIPAA compliance (planned for Enterprise)",
          "On-premise deployment option (evaluating)",
          "Hardware security modules (HSM) for key storage",
          "Bug bounty program (planned Q3 2026)"
        ],
        cta: "Have security questions? Contact us at security@seizn.com"
      }
    },
    contact: {
      title: "Questions?",
      description: "Our team is happy to answer security questions.",
      email: "security@seizn.com"
    }
  };
  const lastUpdatedDate = locale === "ko" ? "2026년 2월 16일" : "February 16, 2026";
  const roadmapTitle = locale === "ko" ? "Trust & Compliance 로드맵" : "Trust & Compliance Roadmap";
  const roadmapItems =
    locale === "ko"
      ? [
          { milestone: "SOC 2 Type II", target: "2026년 Q2", status: "진행 중" },
          { milestone: "HIPAA (Enterprise)", target: "2026년 Q3", status: "범위 확정 중" },
          { milestone: "On-prem 배포", target: "2026년 Q4", status: "설계 검토 중" },
          { milestone: "Bug Bounty Program", target: "2026년 Q3", status: "프로그램 준비 중" },
        ]
      : [
          { milestone: "SOC 2 Type II", target: "Q2 2026", status: "In progress" },
          { milestone: "HIPAA (Enterprise scope)", target: "Q3 2026", status: "Scope definition" },
          { milestone: "On-prem deployment option", target: "Q4 2026", status: "Architecture review" },
          { milestone: "Bug bounty program", target: "Q3 2026", status: "Program design" },
        ];

  const handleSectionClick = (id: SectionId) => {
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-white">
            Seizn
          </Link>
          <nav className="flex items-center gap-6">
            <Link href={`/${locale}/docs`} className="text-sm text-gray-400 hover:text-white">
              {dict.nav?.docs || "Docs"}
            </Link>
            <Link href={`/${locale}/pricing`} className="text-sm text-gray-400 hover:text-white">
              {dict.nav?.pricing || "Pricing"}
            </Link>
            <Link href={`/${locale}/comparison`} className="text-sm text-gray-400 hover:text-white">
              {dict.extremeHome?.nav?.compare || "Compare"}
            </Link>
            <Link
              href="/dashboard"
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {dict.nav?.getStarted || "Get Started"}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm mb-6">
            <ShieldIcon className="w-4 h-4" />
            Trust Center
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t.title}
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            {t.heroDescription}
          </p>
          <p className="text-sm text-gray-500">
            {t.lastUpdated}: {lastUpdatedDate}
          </p>
        </div>
      </section>

      {/* Roadmap Section */}
      <section className="px-4 pb-10">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h2 className="text-lg font-semibold text-white mb-4">{roadmapTitle}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {roadmapItems.map((item) => (
                <div key={item.milestone} className="rounded-lg border border-gray-800 bg-gray-950/60 p-4">
                  <div className="text-sm font-semibold text-white">{item.milestone}</div>
                  <div className="text-xs text-gray-400 mt-2">{item.target}</div>
                  <div className="mt-2 inline-flex rounded-full bg-blue-500/20 text-blue-300 px-2.5 py-1 text-xs">
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Data Flow */}
          <Section
            id="dataFlow"
            title={t.sections.dataFlow.title}
            icon={<DatabaseIcon className="w-5 h-5" />}
            isActive={activeSection === "dataFlow"}
            onClick={() => handleSectionClick("dataFlow")}
          >
            <p className="text-gray-400 mb-6">{t.sections.dataFlow.description}</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                  <CheckIcon className="w-4 h-4" />
                  {t.sections.dataFlow.stored.title}
                </h4>
                <ul className="space-y-2">
                  {t.sections.dataFlow.stored.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-green-400 mt-1">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <XIcon className="w-4 h-4" />
                  {t.sections.dataFlow.notStored.title}
                </h4>
                <ul className="space-y-2">
                  {t.sections.dataFlow.notStored.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-red-400 mt-1">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* Encryption */}
          <Section
            id="encryption"
            title={t.sections.encryption.title}
            icon={<LockIcon className="w-5 h-5" />}
            isActive={activeSection === "encryption"}
            onClick={() => handleSectionClick("encryption")}
          >
            <p className="text-gray-400 mb-6">{t.sections.encryption.description}</p>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-3">{t.sections.encryption.transit.title}</h4>
                <ul className="space-y-2">
                  {t.sections.encryption.transit.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-purple-400 mb-3">{t.sections.encryption.atRest.title}</h4>
                <ul className="space-y-2">
                  {t.sections.encryption.atRest.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-orange-400 mb-3">{t.sections.encryption.keyManagement.title}</h4>
                <ul className="space-y-2">
                  {t.sections.encryption.keyManagement.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* Tenant Isolation */}
          <Section
            id="tenantIsolation"
            title={t.sections.tenantIsolation.title}
            icon={<UsersIcon className="w-5 h-5" />}
            isActive={activeSection === "tenantIsolation"}
            onClick={() => handleSectionClick("tenantIsolation")}
          >
            <p className="text-gray-400 mb-6">{t.sections.tenantIsolation.description}</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-3">Row-Level Security</h4>
                <ul className="space-y-2">
                  {t.sections.tenantIsolation.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-3">{t.sections.tenantIsolation.rbac.title}</h4>
                <ul className="space-y-2">
                  {t.sections.tenantIsolation.rbac.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* Retention & Deletion */}
          <Section
            id="retention"
            title={t.sections.retention.title}
            icon={<ClockIcon className="w-5 h-5" />}
            isActive={activeSection === "retention"}
            onClick={() => handleSectionClick("retention")}
          >
            <p className="text-gray-400 mb-6">{t.sections.retention.description}</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-3">Retention Periods</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2">Data Type</th>
                      <th className="text-left py-2">Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.sections.retention.periods.map((item, i) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="py-2 text-gray-300">{item.type}</td>
                        <td className="py-2 text-gray-400">{item.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-red-400 mb-3">{t.sections.retention.deletion.title}</h4>
                <ul className="space-y-2">
                  {t.sections.retention.deletion.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-red-400 mt-1">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* Audit Logs */}
          <Section
            id="auditLogs"
            title={t.sections.auditLogs.title}
            icon={<DocumentIcon className="w-5 h-5" />}
            isActive={activeSection === "auditLogs"}
            onClick={() => handleSectionClick("auditLogs")}
          >
            <p className="text-gray-400 mb-6">{t.sections.auditLogs.description}</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-3">{t.sections.auditLogs.logged.title}</h4>
                <ul className="space-y-2">
                  {t.sections.auditLogs.logged.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-3">{t.sections.auditLogs.access.title}</h4>
                <ul className="space-y-2">
                  {t.sections.auditLogs.access.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* Subprocessors */}
          <Section
            id="subprocessors"
            title={t.sections.subprocessors.title}
            icon={<ServerIcon className="w-5 h-5" />}
            isActive={activeSection === "subprocessors"}
            onClick={() => handleSectionClick("subprocessors")}
          >
            <p className="text-gray-400 mb-6">{t.sections.subprocessors.description}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2">Provider</th>
                    <th className="text-left py-2">Purpose</th>
                    <th className="text-left py-2">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {t.sections.subprocessors.processors.map((item, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-3 text-white font-medium">{item.name}</td>
                      <td className="py-3 text-gray-300">{item.purpose}</td>
                      <td className="py-3 text-gray-400">{item.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-500 mt-4 italic">{t.sections.subprocessors.note}</p>
          </Section>

          {/* Disclosure */}
          <Section
            id="disclosure"
            title={t.sections.disclosure.title}
            icon={<ShieldIcon className="w-5 h-5" />}
            isActive={activeSection === "disclosure"}
            onClick={() => handleSectionClick("disclosure")}
          >
            <p className="text-gray-400 mb-6">{t.sections.disclosure.description}</p>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-semibold text-yellow-400 mb-3">Gaps We&apos;re Working On</h4>
              <ul className="space-y-2">
                {t.sections.disclosure.items.map((item, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-yellow-400 mt-1">!</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-gray-400">{t.sections.disclosure.cta}</p>
          </Section>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 px-4 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">{t.contact.title}</h2>
          <p className="text-gray-400 mb-6">{t.contact.description}</p>
          <a
            href={`mailto:${t.contact.email}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {t.contact.email}
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            {dict.footer?.copyright?.replace("{year}", "2026") || "2026 Seizn. All rights reserved."}
          </p>
          <div className="flex items-center gap-6">
            <Link href={`/${locale}/legal/privacy`} className="text-sm text-gray-400 hover:text-white">
              {dict.footer?.privacy || "Privacy"}
            </Link>
            <Link href={`/${locale}/legal/terms`} className="text-sm text-gray-400 hover:text-white">
              {dict.footer?.terms || "Terms"}
            </Link>
            <Link href={`/${locale}/legal/beta-disclosure`} className="text-sm text-gray-400 hover:text-white">
              Beta Disclosure
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-sm text-gray-400 hover:text-white">
              Enterprise
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default TrustClient;
