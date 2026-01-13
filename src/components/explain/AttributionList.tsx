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
  exact: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  stem: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  synonym: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  semantic: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

// ============================================
// Sub-Components
// ============================================

interface MatchedTermItemProps {
  term: MatchedTerm;
}

function MatchedTermItem({ term }: MatchedTermItemProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${MATCH_TYPE_STYLES[term.matchType]}`}>
        {term.matchType}
      </span>
      <span className="font-medium text-gray-900 dark:text-white">
        &quot;{term.term}&quot;
      </span>
      {term.queryTerm && term.queryTerm !== term.term && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          (from &quot;{term.queryTerm}&quot;)
        </span>
      )}
      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
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
    <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Query: &quot;{match.queryPhrase}&quot;
        </span>
        <span className="text-xs px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded">
          {(match.similarity * 100).toFixed(0)}% similar
        </span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 italic">
        &quot;{match.matchedPassage}&quot;
      </p>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
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
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          vs Result #{comparison.comparedToRank}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Summary */}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {comparison.summary}
          </p>

          {/* Factors */}
          <div className="space-y-2">
            {comparison.factors.map((factor, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-700"
              >
                {/* Impact indicator */}
                {factor.impact === "positive" && (
                  <ArrowUpIcon className="w-4 h-4 text-green-500" />
                )}
                {factor.impact === "negative" && (
                  <ArrowDownIcon className="w-4 h-4 text-red-500" />
                )}
                {factor.impact === "neutral" && (
                  <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}

                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {factor.factor}
                </span>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
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
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-start gap-3">
          <DocumentIcon className="w-5 h-5 text-gray-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">
              {attribution.documentTitle || "Untitled Document"}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              ID: {attribution.documentId.substring(0, 20)}...
            </p>
            {attribution.source && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 truncate">
                {attribution.source}
              </p>
            )}
            {attribution.page && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Page {attribution.page}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Confidence
            </div>
            <div
              className={`text-lg font-bold ${
                attribution.confidence >= 0.7
                  ? "text-green-600 dark:text-green-400"
                  : attribution.confidence >= 0.4
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
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
                <span className="text-xs text-gray-600 dark:text-gray-400">
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
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
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
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
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
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
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
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Document Metadata
          </h4>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(attribution.metadata)
                .filter(([key]) => !["title", "source", "page", "sections"].includes(key))
                .slice(0, 6)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-gray-500 dark:text-gray-400">{key}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white truncate">
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
