"use client";

import { useState } from "react";
import type {
  AttributionInfo,
  RankingComparison,
  MatchedTerm,
  SemanticMatch,
} from "@/lib/summer/explain/types";

// ============================================
// Types
// ============================================

interface AttributionListProps {
  attribution: AttributionInfo;
  comparisons?: RankingComparison[];
  className?: string;
}

// ============================================
// Icons
// ============================================

const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  </svg>
);

const TagIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
    />
  </svg>
);

const ArrowUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
    />
  </svg>
);

const ArrowDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
    />
  </svg>
);

// ============================================
// Match Type Badge Colors
// ============================================

const MATCH_TYPE_STYLES: Record<MatchedTerm["matchType"], string> = {
  exact: "bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] dark:bg-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]",
  stem: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  synonym: "bg-[var(--ink-100)] text-[var(--ink-900)] dark:bg-[var(--ink-900)] dark:text-[var(--ink-300)]",
  semantic: "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] dark:bg-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]",
};

// ============================================
// Sub-Components
// ============================================

interface MatchedTermItemProps {
  term: MatchedTerm;
}

function MatchedTermItem({ term }: MatchedTermItemProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-[var(--ink-50)] rounded-lg">
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${MATCH_TYPE_STYLES[term.matchType]}`}>
        {term.matchType}
      </span>
      <span className="font-medium text-[var(--ink-900)]">
        &quot;{term.term}&quot;
      </span>
      {term.queryTerm && term.queryTerm !== term.term && (
        <span className="text-xs text-[var(--ink-600)]">
          (from &quot;{term.queryTerm}&quot;)
        </span>
      )}
      <span className="ml-auto text-xs text-[var(--ink-600)]">
        {term.positions.length}x
      </span>
    </div>
  );
}

interface SemanticMatchItemProps {
  match: SemanticMatch;
}

function SemanticMatchItem({ match }: SemanticMatchItemProps) {
  return (
    <div className="p-3 bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending)]/30 rounded-lg border border-[var(--signal-pending)] dark:border-[var(--signal-pending)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">
          Query: &quot;{match.queryPhrase}&quot;
        </span>
        <span className="text-xs px-2 py-0.5 bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending-ink)] text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] rounded">
          {(match.similarity * 100).toFixed(0)}% similar
        </span>
      </div>
      <p className="text-sm text-[var(--ink-600)] italic">
        &quot;{match.matchedPassage}&quot;
      </p>
      <p className="mt-2 text-xs text-[var(--ink-600)]">
        {match.reason}
      </p>
    </div>
  );
}

interface ComparisonItemProps {
  comparison: RankingComparison;
}

function ComparisonItem({ comparison }: ComparisonItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[var(--ink-200)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between bg-[var(--ink-50)] hover:bg-[var(--ink-50)] transition-colors"
      >
        <span className="text-sm font-medium text-[var(--ink-600)]">
          vs Result #{comparison.comparedToRank}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Summary */}
          <p className="text-sm text-[var(--ink-600)]">
            {comparison.summary}
          </p>

          {/* Factors */}
          <div className="space-y-2">
            {comparison.factors.map((factor, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-[var(--ink-50)] rounded border border-[var(--ink-200)]"
              >
                {/* Impact indicator */}
                {factor.impact === "positive" && (
                  <ArrowUpIcon className="w-4 h-4 text-[var(--signal-canon-ink)]" />
                )}
                {factor.impact === "negative" && (
                  <ArrowDownIcon className="w-4 h-4 text-[var(--signal-conflict-ink)]" />
                )}
                {factor.impact === "neutral" && (
                  <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}

                <span className="text-sm font-medium text-[var(--ink-600)]">
                  {factor.factor}
                </span>
                <span className="ml-auto text-xs text-[var(--ink-600)]">
                  {typeof factor.thisValue === "number"
                    ? factor.thisValue.toFixed(2)
                    : factor.thisValue}{" "}
                  vs{" "}
                  {typeof factor.otherValue === "number"
                    ? factor.otherValue.toFixed(2)
                    : factor.otherValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function AttributionList({
  attribution,
  comparisons,
  className = "",
}: AttributionListProps) {
  const [showAllTerms, setShowAllTerms] = useState(false);

  const displayedTerms = showAllTerms
    ? attribution.matchedTerms
    : attribution.matchedTerms.slice(0, 5);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Source Information */}
      <div className="p-4 bg-[var(--ink-50)] rounded-lg">
        <div className="flex items-start gap-3">
          <DocumentIcon className="w-5 h-5 text-gray-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-[var(--ink-900)] truncate">
              {attribution.documentTitle || "Untitled Document"}
            </h4>
            <p className="text-sm text-[var(--ink-600)] mt-1">
              ID: {attribution.documentId.substring(0, 20)}...
            </p>
            {attribution.source && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 truncate">
                {attribution.source}
              </p>
            )}
            {attribution.page && (
              <p className="text-sm text-[var(--ink-600)]">
                Page {attribution.page}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--ink-600)]">
              Confidence
            </div>
            <div
              className={`text-lg font-bold ${
                attribution.confidence >= 0.7
                  ? "text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]"
                  : attribution.confidence >= 0.4
                    ? "text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]"
                    : "text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]"
              }`}
            >
              {(attribution.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Section Path */}
        {attribution.sections && attribution.sections.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <TagIcon className="w-4 h-4 text-gray-400" />
            {attribution.sections.map((section, index) => (
              <span key={index}>
                <span className="text-xs text-[var(--ink-600)]">
                  {section}
                </span>
                {index < attribution.sections!.length - 1 && (
                  <span className="text-gray-400 mx-1">/</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Relevance Reason */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
          Why This Result Matched
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          {attribution.relevanceReason}
        </p>
      </div>

      {/* Matched Terms */}
      {attribution.matchedTerms.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--ink-900)] mb-3">
            Matched Terms ({attribution.matchedTerms.length})
          </h4>
          <div className="space-y-2">
            {displayedTerms.map((term, index) => (
              <MatchedTermItem key={`${term.term}-${index}`} term={term} />
            ))}
          </div>
          {attribution.matchedTerms.length > 5 && (
            <button
              onClick={() => setShowAllTerms(!showAllTerms)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAllTerms
                ? "Show less"
                : `Show ${attribution.matchedTerms.length - 5} more`}
            </button>
          )}
        </div>
      )}

      {/* Semantic Matches */}
      {attribution.semanticMatches.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--ink-900)] mb-3">
            Semantic Matches ({attribution.semanticMatches.length})
          </h4>
          <div className="space-y-3">
            {attribution.semanticMatches.map((match, index) => (
              <SemanticMatchItem key={index} match={match} />
            ))}
          </div>
        </div>
      )}

      {/* Comparisons */}
      {comparisons && comparisons.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--ink-900)] mb-3">
            Ranking Comparisons
          </h4>
          <div className="space-y-2">
            {comparisons.map((comparison, index) => (
              <ComparisonItem key={index} comparison={comparison} />
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      {attribution.metadata && Object.keys(attribution.metadata).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--ink-900)] mb-3">
            Document Metadata
          </h4>
          <div className="p-3 bg-[var(--ink-50)] rounded-lg">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(attribution.metadata)
                .filter(([key]) => !["title", "source", "page", "sections"].includes(key))
                .slice(0, 6)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-[var(--ink-600)]">{key}</dt>
                    <dd className="font-medium text-[var(--ink-900)] truncate">
                      {String(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttributionList;
