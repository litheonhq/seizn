"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { ErrorCodeV2 } from "@/lib/api-error-codes-v2";

// ============================================
// Types
// ============================================

interface ErrorInfo {
  code: string;
  name: string;
  httpStatus: number;
  suggestedFix: string;
  docsUrl: string;
  category: string;
}

type CategoryKey = "auth" | "rate_limit" | "validation" | "resource" | "server";

interface Props {
  locale: Locale;
  dictionary: Record<string, unknown>;
}

// ============================================
// Error Data
// ============================================

const ERROR_DATA: ErrorInfo[] = [
  // Authentication Errors
  {
    code: ErrorCodeV2.AUTH_MISSING_KEY,
    name: "Missing API Key",
    httpStatus: 401,
    suggestedFix: "Add x-api-key header with your API key",
    docsUrl: "/docs/api/authentication",
    category: "auth",
  },
  {
    code: ErrorCodeV2.AUTH_INVALID_KEY,
    name: "Invalid API Key",
    httpStatus: 401,
    suggestedFix: "Check your API key in Dashboard → API Keys",
    docsUrl: "/docs/api/authentication",
    category: "auth",
  },
  {
    code: ErrorCodeV2.AUTH_EXPIRED_KEY,
    name: "Expired API Key",
    httpStatus: 401,
    suggestedFix: "Generate a new API key from the dashboard",
    docsUrl: "/docs/api/authentication",
    category: "auth",
  },
  // Rate Limit Errors
  {
    code: ErrorCodeV2.RATE_LIMITED,
    name: "Rate Limited",
    httpStatus: 429,
    suggestedFix: "Implement exponential backoff (1s → 2s → 4s)",
    docsUrl: "/docs/api/rate-limits",
    category: "rate_limit",
  },
  {
    code: ErrorCodeV2.QUOTA_EXCEEDED,
    name: "Quota Exceeded",
    httpStatus: 429,
    suggestedFix: "Upgrade your plan or wait for quota reset",
    docsUrl: "/docs/api/rate-limits",
    category: "rate_limit",
  },
  // Validation Errors
  {
    code: ErrorCodeV2.INVALID_INPUT,
    name: "Invalid Input",
    httpStatus: 400,
    suggestedFix: "Check request body against API documentation",
    docsUrl: "/docs/api/errors",
    category: "validation",
  },
  // Resource Errors
  {
    code: ErrorCodeV2.NOT_FOUND,
    name: "Not Found",
    httpStatus: 404,
    suggestedFix: "Verify the resource ID exists and is accessible",
    docsUrl: "/docs/api/endpoints",
    category: "resource",
  },
  // Server Errors
  {
    code: ErrorCodeV2.INTERNAL_ERROR,
    name: "Internal Error",
    httpStatus: 500,
    suggestedFix: "Retry the request; contact support if it persists",
    docsUrl: "/docs/api/errors",
    category: "server",
  },
];

const CATEGORIES: Record<CategoryKey, { title: string; titleKo: string; description: string; descriptionKo: string; color: string }> = {
  auth: {
    title: "Authentication Errors",
    titleKo: "인증 오류",
    description: "Errors related to API keys and authentication",
    descriptionKo: "API 키 및 인증 관련 오류",
    color: "red",
  },
  rate_limit: {
    title: "Rate Limit Errors",
    titleKo: "속도 제한 오류",
    description: "Errors related to rate limiting and quotas",
    descriptionKo: "속도 제한 및 할당량 관련 오류",
    color: "yellow",
  },
  validation: {
    title: "Validation Errors",
    titleKo: "유효성 검사 오류",
    description: "Errors related to invalid request format or data",
    descriptionKo: "잘못된 요청 형식 또는 데이터 관련 오류",
    color: "orange",
  },
  resource: {
    title: "Resource Errors",
    titleKo: "리소스 오류",
    description: "Errors related to resources not found",
    descriptionKo: "리소스를 찾을 수 없는 오류",
    color: "blue",
  },
  server: {
    title: "Server Errors",
    titleKo: "서버 오류",
    description: "Unexpected server errors",
    descriptionKo: "예기치 않은 서버 오류",
    color: "gray",
  },
};

// ============================================
// Icons
// ============================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const ClipboardIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

// ============================================
// Translations
// ============================================

const translations = {
  en: {
    title: "Error Reference",
    subtitle: "Complete reference for all Seizn API error codes with resolution guides",
    backToDocs: "Back to Docs",
    searchPlaceholder: "Search error codes, names, or hints...",
    allCategories: "All Categories",
    showing: "Showing",
    of: "of",
    errorCodes: "error codes",
    errorFormat: "Error Response Format",
    errorFormatDesc: "All Seizn API errors follow a consistent format with helpful debugging information:",
    traceIdNote: "Always include the trace_id when contacting support for faster resolution.",
    suggestedFix: "Suggested Fix",
    noResults: "No error codes match your search.",
    clearFilters: "Clear filters",
    needHelp: "Need More Help?",
    helpItems: [
      "Include the trace_id in all support requests for faster debugging",
      "Check status.seizn.com for service status and planned maintenance",
      "Retry with exponential backoff for rate limit and external service errors",
      "Contact support at support@seizn.com for persistent issues",
    ],
  },
  ko: {
    title: "오류 레퍼런스",
    subtitle: "모든 Seizn API 오류 코드와 해결 가이드에 대한 전체 레퍼런스",
    backToDocs: "문서로 돌아가기",
    searchPlaceholder: "오류 코드, 이름 또는 힌트 검색...",
    allCategories: "모든 카테고리",
    showing: "표시 중",
    of: "/",
    errorCodes: "오류 코드",
    errorFormat: "오류 응답 형식",
    errorFormatDesc: "모든 Seizn API 오류는 디버깅에 유용한 정보가 포함된 일관된 형식을 따릅니다:",
    traceIdNote: "더 빠른 해결을 위해 지원팀에 문의할 때 항상 trace_id를 포함하세요.",
    suggestedFix: "권장 해결 방법",
    noResults: "검색과 일치하는 오류 코드가 없습니다.",
    clearFilters: "필터 지우기",
    needHelp: "추가 도움이 필요하신가요?",
    helpItems: [
      "더 빠른 디버깅을 위해 모든 지원 요청에 trace_id를 포함하세요",
      "서비스 상태 및 예정된 유지보수는 status.seizn.com을 확인하세요",
      "속도 제한 및 외부 서비스 오류에 대해 지수 백오프로 재시도하세요",
      "지속적인 문제는 support@seizn.com으로 문의하세요",
    ],
  },
};

// ============================================
// Component
// ============================================

export function ErrorDocsClient({ locale }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | "all">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const t = translations[locale as keyof typeof translations] || translations.en;
  const isKo = locale === "ko";

  const filteredErrors = useMemo(() => {
    return ERROR_DATA.filter((error) => {
      const matchesSearch =
        search === "" ||
        error.code.toLowerCase().includes(search.toLowerCase()) ||
        error.name.toLowerCase().includes(search.toLowerCase()) ||
        error.suggestedFix.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        selectedCategory === "all" || error.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [search, selectedCategory]);

  const errorsByCategory = useMemo(() => {
    const grouped: Record<string, ErrorInfo[]> = {};
    filteredErrors.forEach((error) => {
      if (!grouped[error.category]) {
        grouped[error.category] = [];
      }
      grouped[error.category].push(error);
    });
    return grouped;
  }, [filteredErrors]);

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getHttpStatusColor = (status: number) => {
    if (status === 400) return "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] dark:bg-yellow-900/30 dark:text-yellow-400";
    if (status === 401) return "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] dark:bg-[var(--signal-conflict)]/30 dark:text-[var(--signal-conflict-soft)]";
    if (status === 404) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    if (status === 429) return "bg-[var(--ink-100)] text-[var(--ink-900)] dark:bg-[var(--ink-900)]/30 dark:text-[var(--ink-700)]";
    if (status === 500) return "bg-gray-100 text-gray-800 dark:bg-[var(--ink-900)]/30 dark:text-gray-400";
    return "bg-gray-100 text-gray-800 dark:bg-[var(--ink-900)]/30 dark:text-gray-400";
  };

  return (
    <div className="min-h-screen bg-[var(--ink-50)]">
      {/* Header */}
      <div className="bg-[var(--ink-0)] border-b border-[var(--ink-200)]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link
            href={`/${locale}/docs`}
            className="inline-flex items-center gap-2 text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {t.backToDocs}
          </Link>
          <h1 className="text-3xl font-bold text-[var(--ink-900)]">{t.title}</h1>
          <p className="text-[var(--ink-600)] mt-2">{t.subtitle}</p>

          {/* Search and Filter */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ink-500)]" />
              <input aria-label="Search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-[var(--ink-200)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)] bg-[var(--ink-50)] text-[var(--ink-900)]"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as CategoryKey | "all")}
              className="px-4 py-2 border border-[var(--ink-200)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)] bg-[var(--ink-50)] text-[var(--ink-900)]"
            >
              <option value="all">{t.allCategories}</option>
              {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => (
                <option key={key} value={key}>
                  {isKo ? CATEGORIES[key].titleKo : CATEGORIES[key].title}
                </option>
              ))}
            </select>
          </div>

          {/* Stats */}
          <p className="text-sm text-[var(--ink-600)] mt-4">
            {t.showing} {filteredErrors.length} {t.of} {ERROR_DATA.length} {t.errorCodes}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Error Response Format */}
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6 mb-8">
          <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-4">{t.errorFormat}</h2>
          <p className="text-[var(--ink-600)] mb-4">{t.errorFormatDesc}</p>
          <pre className="bg-[var(--ink-900)] text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "error": {
    "code": "AUTH_INVALID_KEY",
    "message": "Invalid API key",
    "trace_id": "trc_abc123xyz",
    "request_id": "req_456def",
    "suggested_fix": "Check your API key in Dashboard...",
    "docs_url": "https://seizn.com/docs/api/authentication"
  }
}`}
          </pre>
          <p className="text-sm text-[var(--ink-600)] mt-4">
            {t.traceIdNote}
          </p>
        </div>

        {/* Error Categories */}
        {(Object.keys(CATEGORIES) as CategoryKey[]).map((categoryKey) => {
          const category = CATEGORIES[categoryKey];
          const categoryErrors = errorsByCategory[categoryKey];

          if (!categoryErrors || categoryErrors.length === 0) return null;

          return (
            <div key={categoryKey} className="mb-10">
              <h2 className="text-xl font-semibold text-[var(--ink-900)] mb-2">
                {isKo ? category.titleKo : category.title}
              </h2>
              <p className="text-[var(--ink-600)] mb-4">
                {isKo ? category.descriptionKo : category.description}
              </p>

              <div className="space-y-4">
                {categoryErrors.map((error) => (
                  <div
                    key={error.code}
                    id={error.code}
                    className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-5 hover:border-[var(--ink-200)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <code className="text-lg font-mono font-bold text-[var(--ink-900)]">
                            {error.code}
                          </code>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getHttpStatusColor(error.httpStatus)}`}>
                            HTTP {error.httpStatus}
                          </span>
                          <button
                            onClick={() => handleCopy(error.code)}
                            className="p-1 text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                            title="Copy error code"
                          >
                            <ClipboardIcon className="w-4 h-4" />
                          </button>
                          {copiedCode === error.code && (
                            <span className="text-xs text-[var(--ink-900)]">Copied!</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-[var(--ink-900)] mb-2">
                          {error.name}
                        </p>
                        <p className="text-sm text-[var(--ink-600)]">
                          <span className="font-medium">{t.suggestedFix}:</span> {error.suggestedFix}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* No Results */}
        {filteredErrors.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[var(--ink-600)]">{t.noResults}</p>
            <button
              onClick={() => {
                setSearch("");
                setSelectedCategory("all");
              }}
              className="mt-4 text-[var(--ink-900)] hover:text-[var(--ink-900)]/80"
            >
              {t.clearFilters}
            </button>
          </div>
        )}

        {/* Getting Help */}
        <div className="mt-12 bg-[var(--signal-canon)]/10 border border-[var(--ink-900)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-2">{t.needHelp}</h2>
          <ul className="text-[var(--ink-600)] space-y-2">
            {t.helpItems.map((item: string, index: number) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
