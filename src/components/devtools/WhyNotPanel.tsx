"use client";

import { useState } from "react";

import { getErrorMessage } from "@/lib/ui-error";

// ============================================
// Types
// ============================================

export type WhyNotStage = 'index' | 'permission' | 'embedding' | 'topk' | 'rerank' | 'policy';

export interface WhyNotBlocker {
  stage: WhyNotStage;
  reason: string;
  details: Record<string, unknown>;
}

export interface WhyNotStages {
  indexed: boolean;
  permission_allowed: boolean;
  embedding_similar: boolean;
  made_top_k: boolean;
  survived_rerank: boolean;
  passed_policy: boolean;
}

export interface WhyNotResult {
  document_id: string;
  found: boolean;
  blockers: WhyNotBlocker[];
  stages: WhyNotStages;
  similarity_score?: number;
  initial_rank?: number;
  rerank_rank?: number;
  suggestions: string[];
}

export interface WhyNotPanelProps {
  traceId: string;
  className?: string;
}

// ============================================
// Icons
// ============================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

const MinusIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
  </svg>
);

const LightBulbIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const ExclamationIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const DocumentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// ============================================
// Stage Configuration
// ============================================

const STAGE_CONFIG: Record<WhyNotStage, { label: string; description: string; order: number }> = {
  index: {
    label: "Indexed",
    description: "Document exists in vector store",
    order: 1,
  },
  permission: {
    label: "Permission",
    description: "User has access to document",
    order: 2,
  },
  embedding: {
    label: "Embedding",
    description: "Meets similarity threshold",
    order: 3,
  },
  topk: {
    label: "Top-K",
    description: "Ranked in initial candidates",
    order: 4,
  },
  rerank: {
    label: "Rerank",
    description: "Survived reranking",
    order: 5,
  },
  policy: {
    label: "Policy",
    description: "Passed PII/TTL checks",
    order: 6,
  },
};

// ============================================
// Component
// ============================================

export function WhyNotPanel({ traceId, className = "" }: WhyNotPanelProps) {
  const [documentId, setDocumentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<WhyNotResult[] | null>(null);

  // Handle analysis
  const handleAnalyze = async () => {
    if (!documentId.trim()) {
      setError("Please enter a document or chunk ID");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResults(null);

      // Support comma-separated IDs
      const ids = documentId.split(",").map((id) => id.trim()).filter(Boolean);

      const response = await fetch(`/api/retrieval/traces/${traceId}/why-not`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_ids: ids,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results);
      } else {
        setError(getErrorMessage(data.error, "Analysis failed"));
      }
    } catch (err) {
      console.error("Why-not analysis error:", err);
      setError(getErrorMessage(err, "Failed to analyze document"));
    } finally {
      setLoading(false);
    }
  };

  // Clear results
  const handleClear = () => {
    setDocumentId("");
    setResults(null);
    setError(null);
  };

  // Get stage status icon
  const getStageIcon = (passed: boolean | undefined) => {
    if (passed === undefined) {
      return <MinusIcon className="w-4 h-4 text-gray-500" />;
    }
    return passed ? (
      <CheckIcon className="w-4 h-4 text-green-400" />
    ) : (
      <XIcon className="w-4 h-4 text-red-400" />
    );
  };

  // Get stage status color
  const getStageStatusClass = (passed: boolean | undefined) => {
    if (passed === undefined) return "text-gray-500";
    return passed ? "text-green-400" : "text-red-400";
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <SearchIcon className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Why Not?</h3>
        </div>
        <p className="text-sm text-gray-400">
          Enter a document ID to find out why it wasn&apos;t returned in this query.
        </p>
      </div>

      {/* Input Section */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <DocumentIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="Enter document or chunk ID..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || !documentId.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Analyzing...
              </>
            ) : (
              <>
                <SearchIcon className="w-4 h-4" />
                Analyze
              </>
            )}
          </button>
          {results && (
            <button
              onClick={handleClear}
              className="px-3 py-2 bg-gray-800 text-gray-400 rounded-lg hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tip: You can enter multiple IDs separated by commas
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 border-b border-gray-800">
          <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-2">
            <ExclamationIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="divide-y divide-gray-800">
          {results.map((result) => (
            <div key={result.document_id} className="p-4">
              {/* Document Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-blue-400 bg-gray-800 px-2 py-1 rounded">
                      {result.document_id.slice(0, 16)}...
                    </code>
                    {result.found ? (
                      <span className="flex items-center gap-1 px-2 py-1 text-xs bg-green-900/30 text-green-400 rounded">
                        <CheckIcon className="w-3 h-3" />
                        Found in results
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-900/30 text-red-400 rounded">
                        <XIcon className="w-3 h-3" />
                        Not in results
                      </span>
                    )}
                  </div>
                  {result.similarity_score !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Similarity: {(result.similarity_score * 100).toFixed(1)}%
                      {result.initial_rank !== undefined && ` | Initial Rank: #${result.initial_rank}`}
                      {result.rerank_rank !== undefined && ` | After Rerank: #${result.rerank_rank}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Stage Checklist */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Pipeline Stages
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(Object.entries(STAGE_CONFIG) as [WhyNotStage, typeof STAGE_CONFIG[WhyNotStage]][])
                    .sort(([, a], [, b]) => a.order - b.order)
                    .map(([stage, config]) => {
                      const stageKey = stage === 'index' ? 'indexed' :
                                       stage === 'permission' ? 'permission_allowed' :
                                       stage === 'embedding' ? 'embedding_similar' :
                                       stage === 'topk' ? 'made_top_k' :
                                       stage === 'rerank' ? 'survived_rerank' :
                                       'passed_policy';
                      const passed = result.stages[stageKey as keyof WhyNotStages];

                      return (
                        <div
                          key={stage}
                          className={`flex items-center gap-2 p-2 rounded-lg ${
                            passed === false ? "bg-red-900/20" : "bg-gray-800/50"
                          }`}
                        >
                          {getStageIcon(passed)}
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${getStageStatusClass(passed)}`}>
                              {config.label}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {config.description}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Blockers */}
              {result.blockers.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Blockers
                  </h4>
                  <div className="space-y-2">
                    {result.blockers.map((blocker, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg"
                      >
                        <div className="flex items-start gap-2">
                          <ExclamationIcon className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-red-300 uppercase">
                                {STAGE_CONFIG[blocker.stage]?.label || blocker.stage}
                              </span>
                            </div>
                            <p className="text-sm text-red-400 mt-1">{blocker.reason}</p>
                            {Object.keys(blocker.details).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                                  Show details
                                </summary>
                                <pre className="mt-1 text-xs text-gray-400 bg-gray-800/50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(blocker.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <LightBulbIcon className="w-4 h-4 text-yellow-400" />
                    Suggestions
                  </h4>
                  <ul className="space-y-1">
                    {result.suggestions.map((suggestion, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-yellow-400/80 flex items-start gap-2"
                      >
                        <span className="text-yellow-400">-</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No Results Yet */}
      {!loading && !error && !results && (
        <div className="p-8 text-center text-gray-500">
          <DocumentIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Enter a document ID above to analyze why it wasn&apos;t returned.</p>
        </div>
      )}
    </div>
  );
}

export default WhyNotPanel;
