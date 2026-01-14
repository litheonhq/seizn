"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  SEIZN_ERROR_CODES,
  AUTH_CODES,
  VALIDATION_CODES,
  RESOURCE_CODES,
  EXTERNAL_CODES,
  INTERNAL_CODES,
  getHttpStatus,
} from "@/lib/errors/codes";
import { ERROR_HINTS } from "@/lib/errors/hints";

// ============================================
// Types
// ============================================

interface ErrorInfo {
  code: string;
  name: string;
  httpStatus: number;
  hint: string;
  category: string;
}

type CategoryKey = "auth" | "validation" | "resource" | "external" | "internal";

// ============================================
// Data
// ============================================

const CATEGORIES: Record<CategoryKey, { title: string; description: string; color: string }> = {
  auth: {
    title: "Authentication & Authorization (SEIZN_1xx)",
    description: "Errors related to API keys, permissions, and rate limits",
    color: "red",
  },
  validation: {
    title: "Request Validation (SEIZN_2xx)",
    description: "Errors related to invalid request format or missing fields",
    color: "yellow",
  },
  resource: {
    title: "Resource Errors (SEIZN_3xx)",
    description: "Errors related to resources not found or conflicts",
    color: "blue",
  },
  external: {
    title: "External Service Errors (SEIZN_4xx)",
    description: "Errors from third-party services (AI providers, databases)",
    color: "purple",
  },
  internal: {
    title: "Internal Server Errors (SEIZN_5xx)",
    description: "Unexpected server errors and service unavailability",
    color: "gray",
  },
};

// Build error info from codes
function buildErrorList(): ErrorInfo[] {
  const errors: ErrorInfo[] = [];

  // Auth errors
  Object.entries(AUTH_CODES).forEach(([name, code]) => {
    errors.push({
      code,
      name,
      httpStatus: getHttpStatus(code as typeof SEIZN_ERROR_CODES[keyof typeof SEIZN_ERROR_CODES]),
      hint: ERROR_HINTS[code as keyof typeof ERROR_HINTS] || "",
      category: "auth",
    });
  });

  // Validation errors
  Object.entries(VALIDATION_CODES).forEach(([name, code]) => {
    errors.push({
      code,
      name,
      httpStatus: getHttpStatus(code as typeof SEIZN_ERROR_CODES[keyof typeof SEIZN_ERROR_CODES]),
      hint: ERROR_HINTS[code as keyof typeof ERROR_HINTS] || "",
      category: "validation",
    });
  });

  // Resource errors
  Object.entries(RESOURCE_CODES).forEach(([name, code]) => {
    errors.push({
      code,
      name,
      httpStatus: getHttpStatus(code as typeof SEIZN_ERROR_CODES[keyof typeof SEIZN_ERROR_CODES]),
      hint: ERROR_HINTS[code as keyof typeof ERROR_HINTS] || "",
      category: "resource",
    });
  });

  // External errors
  Object.entries(EXTERNAL_CODES).forEach(([name, code]) => {
    errors.push({
      code,
      name,
      httpStatus: getHttpStatus(code as typeof SEIZN_ERROR_CODES[keyof typeof SEIZN_ERROR_CODES]),
      hint: ERROR_HINTS[code as keyof typeof ERROR_HINTS] || "",
      category: "external",
    });
  });

  // Internal errors
  Object.entries(INTERNAL_CODES).forEach(([name, code]) => {
    errors.push({
      code,
      name,
      httpStatus: getHttpStatus(code as typeof SEIZN_ERROR_CODES[keyof typeof SEIZN_ERROR_CODES]),
      hint: ERROR_HINTS[code as keyof typeof ERROR_HINTS] || "",
      category: "internal",
    });
  });

  return errors;
}

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
// Component
// ============================================

export function ErrorDocsClient() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | "all">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const allErrors = useMemo(() => buildErrorList(), []);

  const filteredErrors = useMemo(() => {
    return allErrors.filter((error) => {
      const matchesSearch =
        search === "" ||
        error.code.toLowerCase().includes(search.toLowerCase()) ||
        error.name.toLowerCase().includes(search.toLowerCase()) ||
        error.hint.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        selectedCategory === "all" || error.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [allErrors, search, selectedCategory]);

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
    if (status === 400) return "bg-yellow-100 text-yellow-800";
    if (status === 401) return "bg-red-100 text-red-800";
    if (status === 404) return "bg-blue-100 text-blue-800";
    if (status === 409) return "bg-orange-100 text-orange-800";
    if (status === 429) return "bg-purple-100 text-purple-800";
    if (status === 500) return "bg-gray-100 text-gray-800";
    if (status === 502) return "bg-pink-100 text-pink-800";
    if (status === 503) return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Docs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Error Reference</h1>
          <p className="text-gray-600 mt-2">
            Complete reference for all Seizn API error codes with resolution guides
          </p>

          {/* Search and Filter */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search error codes, names, or hints..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as CategoryKey | "all")}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Categories</option>
              <option value="auth">Authentication (1xx)</option>
              <option value="validation">Validation (2xx)</option>
              <option value="resource">Resource (3xx)</option>
              <option value="external">External (4xx)</option>
              <option value="internal">Internal (5xx)</option>
            </select>
          </div>

          {/* Stats */}
          <p className="text-sm text-gray-500 mt-4">
            Showing {filteredErrors.length} of {allErrors.length} error codes
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Error Response Format */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Error Response Format</h2>
          <p className="text-gray-600 mb-4">
            All Seizn API errors follow a consistent format with helpful debugging information:
          </p>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "success": false,
  "error": {
    "error_code": "SEIZN_101",
    "message": "Invalid API key",
    "hint": "Verify your API key is correct and active...",
    "docs_url": "https://seizn.com/docs/api/authentication",
    "trace_id": "req_abc123xyz"
  }
}`}
          </pre>
          <p className="text-sm text-gray-500 mt-4">
            Always include the <code className="bg-gray-100 px-1 rounded">trace_id</code> when
            contacting support for faster resolution.
          </p>
        </div>

        {/* Error Categories */}
        {(Object.keys(CATEGORIES) as CategoryKey[]).map((categoryKey) => {
          const category = CATEGORIES[categoryKey];
          const categoryErrors = errorsByCategory[categoryKey];

          if (!categoryErrors || categoryErrors.length === 0) return null;

          return (
            <div key={categoryKey} className="mb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{category.title}</h2>
              <p className="text-gray-600 mb-4">{category.description}</p>

              <div className="space-y-4">
                {categoryErrors.map((error) => (
                  <div
                    key={error.code}
                    id={error.code}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <code className="text-lg font-mono font-bold text-gray-900">
                            {error.code}
                          </code>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getHttpStatusColor(error.httpStatus)}`}>
                            HTTP {error.httpStatus}
                          </span>
                          <button
                            onClick={() => handleCopy(error.code)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            title="Copy error code"
                          >
                            <ClipboardIcon className="w-4 h-4" />
                          </button>
                          {copiedCode === error.code && (
                            <span className="text-xs text-emerald-600">Copied!</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          {error.name.replace(/_/g, " ")}
                        </p>
                        <p className="text-sm text-gray-600">{error.hint}</p>
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
            <p className="text-gray-500">No error codes match your search.</p>
            <button
              onClick={() => {
                setSearch("");
                setSelectedCategory("all");
              }}
              className="mt-4 text-emerald-600 hover:text-emerald-700"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Getting Help */}
        <div className="mt-12 bg-emerald-50 border border-emerald-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-emerald-900 mb-2">Need More Help?</h2>
          <ul className="text-emerald-800 space-y-2">
            <li>
              <strong>Include the trace_id</strong> in all support requests for faster debugging
            </li>
            <li>
              <strong>Check status.seizn.com</strong> for service status and planned maintenance
            </li>
            <li>
              <strong>Retry with exponential backoff</strong> for rate limit and external service errors
            </li>
            <li>
              <strong>Contact support</strong> at support@seizn.com for persistent issues
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
