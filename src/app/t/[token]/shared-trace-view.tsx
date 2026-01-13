"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { PublicTraceView, RedactionProfile } from "@/lib/sharing/types";

interface SharedTraceViewProps {
  token: string;
}

interface TraceEvent {
  name: string;
  stage: "embed" | "search" | "rerank" | "generate" | "validate";
  start_ms: number;
  end_ms: number;
  model?: string;
  input?: string | number;
  output?: string | number;
  cached?: boolean;
  cost?: number;
  details?: Record<string, unknown>;
}

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  embed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  search: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  rerank: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  generate: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  validate: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

export function SharedTraceView({ token }: SharedTraceViewProps) {
  const [trace, setTrace] = useState<PublicTraceView | null>(null);
  const [redactionProfile, setRedactionProfile] = useState<RedactionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  useEffect(() => {
    async function fetchTrace() {
      try {
        const response = await fetch(`/api/t/${token}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load trace");
        }

        setTrace(data.trace);
        setRedactionProfile(data.redactionApplied);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading shared trace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <svg
            className="w-16 h-16 text-red-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {error === "This shared trace has expired"
              ? "Trace Expired"
              : "Trace Not Found"}
          </h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors"
          >
            Go to Seizn
          </Link>
        </div>
      </div>
    );
  }

  if (!trace) {
    return null;
  }

  const events = (trace.trace?.events as TraceEvent[]) || [];
  const totalLatency = Object.values(trace.timings_ms || {}).reduce(
    (a, b) => a + (typeof b === "number" ? b : 0),
    0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-emerald-600">Seizn</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">Shared Trace</span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{trace.view_count} views</span>
            <span>Shared {new Date(trace.shared_at).toLocaleDateString()}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Redaction Notice */}
        {redactionProfile && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-amber-800">
                  Privacy Protection Applied
                </h3>
                <p className="text-sm text-amber-700 mt-1">
                  This trace has been redacted for privacy.
                  {redactionProfile.pii && " Personal information has been masked."}
                  {redactionProfile.secrets && " API keys and secrets have been hidden."}
                  {redactionProfile.raw_content && " Original content is not shown."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-semibold text-gray-900">
              Trace Overview
            </h1>
            {trace.error ? (
              <span className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                Error
              </span>
            ) : (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                Success
              </span>
            )}
          </div>

          {/* Query */}
          {trace.query_text && (
            <div className="mb-4 p-4 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">Query</div>
              <div className="text-gray-900 font-mono text-sm">
                {trace.query_text}
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">Total Latency</div>
              <div className="text-xl font-semibold text-gray-900">
                {totalLatency.toFixed(0)}ms
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">Results</div>
              <div className="text-xl font-semibold text-gray-900">
                {trace.results_count}
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">Plan</div>
              <div className="text-xl font-semibold text-gray-900 capitalize">
                {trace.plan}
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">Created</div>
              <div className="text-sm font-semibold text-gray-900">
                {new Date(trace.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {trace.error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="text-xs text-red-600 mb-1">Error</div>
              <div className="text-red-800 font-mono text-sm">
                {trace.error}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        {events.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pipeline Timeline
            </h2>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-3">
                {events.map((event, index) => {
                  const colors = STAGE_COLORS[event.stage] || STAGE_COLORS.validate;
                  const duration = event.end_ms - event.start_ms;
                  const isExpanded = expandedStep === index;

                  return (
                    <div key={index} className="relative pl-10">
                      {/* Timeline Dot */}
                      <div
                        className={`absolute left-2 top-4 w-4 h-4 rounded-full border-2 ${colors.border} ${colors.bg}`}
                      />

                      {/* Step Card */}
                      <button
                        onClick={() =>
                          setExpandedStep(isExpanded ? null : index)
                        }
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          isExpanded
                            ? `${colors.bg} ${colors.border}`
                            : "bg-white border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                            >
                              {event.stage}
                            </span>
                            <span className="font-medium text-gray-900 text-sm">
                              {event.name}
                            </span>
                            {event.cached && (
                              <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                                cached
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 font-medium">
                              {duration.toFixed(0)}ms
                            </span>
                            {event.cost !== undefined && (
                              <span className="text-xs text-gray-400">
                                ${event.cost.toFixed(5)}
                              </span>
                            )}
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        </div>

                        {/* Meta Info */}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {event.model && <span>Model: {event.model}</span>}
                          {event.input !== undefined && (
                            <span>Input: {event.input}</span>
                          )}
                          {event.output !== undefined && (
                            <span>Output: {event.output}</span>
                          )}
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && event.details && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto max-h-40">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Config Section */}
        {trace.effective_config &&
          Object.keys(trace.effective_config).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6 mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Configuration
              </h2>
              <pre className="text-xs text-gray-600 bg-gray-50 p-4 rounded-xl overflow-auto max-h-60">
                {JSON.stringify(trace.effective_config, null, 2)}
              </pre>
            </div>
          )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center">
          <p className="text-sm text-gray-500">
            Powered by{" "}
            <Link href="/" className="text-emerald-600 hover:underline">
              Seizn
            </Link>{" "}
            - AI Memory Platform
          </p>
        </div>
      </footer>
    </div>
  );
}
