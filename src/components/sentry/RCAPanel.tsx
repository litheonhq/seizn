"use client";

import type { RCACandidate, ErrorType } from "@/lib/sentry/types";

// ============================================
// Types
// ============================================

export interface RCAPanelProps {
  candidates: RCACandidate[];
  errorType?: ErrorType;
  loading?: boolean;
  onApplyFix?: (fixSuggestion: string) => void;
}

// ============================================
// Constants
// ============================================

const CATEGORY_CONFIG: Record<
  RCACandidate["category"],
  { icon: React.ReactNode; label: string; bgColor: string; textColor: string }
> = {
  retrieval: {
    icon: <SearchIcon className="w-4 h-4" />,
    label: "Retrieval",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
  },
  generation: {
    icon: <SparklesIcon className="w-4 h-4" />,
    label: "Generation",
    bgColor: "bg-[var(--ink-50)]",
    textColor: "text-[var(--ink-900)] underline",
  },
  configuration: {
    icon: <CogIcon className="w-4 h-4" />,
    label: "Configuration",
    bgColor: "bg-gray-50",
    textColor: "text-gray-700",
  },
  data: {
    icon: <DatabaseIcon className="w-4 h-4" />,
    label: "Data",
    bgColor: "bg-[var(--signal-canon-soft)]",
    textColor: "text-[var(--signal-canon-ink)]",
  },
  infrastructure: {
    icon: <ServerIcon className="w-4 h-4" />,
    label: "Infrastructure",
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
  },
};

const ERROR_TYPE_DESCRIPTIONS: Record<ErrorType, string> = {
  missing_context: "The retrieved documents do not contain information relevant to the query.",
  low_faithfulness: "The generated answer includes claims not supported by the retrieved context.",
  timeout: "The request took longer than the allowed latency threshold.",
  policy_blocked: "The request was blocked by a governance or safety policy.",
  embedding_mismatch: "There may be issues with embedding quality or model compatibility.",
  rerank_failure: "The reranking step failed or produced degraded results.",
  hallucination: "The LLM generated content that is not grounded in the provided context.",
  stale_context: "The retrieved documents may contain outdated information.",
  query_mismatch: "The system may have misunderstood the intent of the query.",
  empty_results: "No documents matched the query in the collection.",
  unknown: "The root cause could not be automatically determined.",
};

// ============================================
// Component
// ============================================

export function RCAPanel({
  candidates,
  errorType,
  loading,
  onApplyFix,
}: RCAPanelProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Root Cause Analysis
            </h3>
          </div>
          {errorType && (
            <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg">
              {errorType.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Error Type Description */}
        {errorType && ERROR_TYPE_DESCRIPTIONS[errorType] && (
          <p className="mt-2 text-sm text-gray-500">
            {ERROR_TYPE_DESCRIPTIONS[errorType]}
          </p>
        )}
      </div>

      {/* Candidates List */}
      <div className="divide-y divide-gray-100">
        {candidates.length === 0 ? (
          <div className="p-8 text-center">
            <QuestionIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No root cause candidates identified</p>
            <p className="text-xs text-gray-400 mt-1">
              Manual investigation may be required
            </p>
          </div>
        ) : (
          candidates.map((candidate, index) => (
            <RCACandidateCard
              key={index}
              candidate={candidate}
              rank={index + 1}
              onApplyFix={onApplyFix}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// RCA Candidate Card
// ============================================

function RCACandidateCard({
  candidate,
  rank,
  onApplyFix,
}: {
  candidate: RCACandidate;
  rank: number;
  onApplyFix?: (fixSuggestion: string) => void;
}) {
  const categoryConfig = CATEGORY_CONFIG[candidate.category];
  const confidencePercent = Math.round(candidate.confidence * 100);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-indigo-600 rounded-full">
            {rank}
          </span>
          <span
            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${categoryConfig.bgColor} ${categoryConfig.textColor}`}
          >
            {categoryConfig.icon}
            {categoryConfig.label}
          </span>
        </div>

        {/* Confidence Bar */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                confidencePercent >= 70
                  ? "bg-[var(--signal-canon)]"
                  : confidencePercent >= 40
                  ? "bg-yellow-500"
                  : "bg-gray-400"
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">
            {confidencePercent}%
          </span>
        </div>
      </div>

      {/* Cause */}
      <p className="text-sm font-medium text-gray-900 mb-2">{candidate.cause}</p>

      {/* Evidence */}
      {candidate.evidence.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Evidence:</p>
          <ul className="space-y-1">
            {candidate.evidence.map((e, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-gray-600"
              >
                <span className="text-gray-400 mt-0.5">-</span>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fix Suggestion */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-start gap-2">
          <LightbulbIcon className="w-4 h-4 text-[var(--signal-pending-ink)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700 mb-1">
              Suggested Fix
            </p>
            <p className="text-xs text-gray-600">{candidate.fixSuggestion}</p>
          </div>
          {onApplyFix && (
            <button
              onClick={() => onApplyFix(candidate.fixSuggestion)}
              className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.417.07a9.05 9.05 0 01-7.436-2.362L12 18m0 0l-.218-.218a9.05 9.05 0 00-7.436-2.362l-.417.07c-1.717.293-2.299 2.38-1.067 3.611L5 20.8" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  );
}

export default RCAPanel;
