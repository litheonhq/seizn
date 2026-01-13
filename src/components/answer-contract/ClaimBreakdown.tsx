"use client";

import { useState, useMemo } from "react";
import type {
  Claim,
  ClaimVerification,
  Contradiction,
  EvidenceRef,
} from "@/lib/answer-contract/types";

/**
 * Props for ClaimBreakdown component
 */
interface ClaimBreakdownProps {
  claims: ClaimVerification[];
  unsupportedClaims: Claim[];
  contradictions: Contradiction[];
  answerText?: string;
  showHighlights?: boolean;
}

/**
 * Claim type configuration
 */
const claimTypeConfig = {
  factual: { label: "Factual", color: "blue" },
  opinion: { label: "Opinion", color: "purple" },
  comparison: { label: "Comparison", color: "cyan" },
  temporal: { label: "Temporal", color: "amber" },
  quantitative: { label: "Quantitative", color: "emerald" },
};

/**
 * Support strength badge
 */
function SupportBadge({ supported, strength }: { supported: boolean; strength: string }) {
  if (!supported) {
    if (strength === "contradicted") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Contradicted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        Unsupported
      </span>
    );
  }

  if (strength === "strong") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Strong Support
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      Weak Support
    </span>
  );
}

/**
 * Evidence reference display
 */
function EvidenceRefDisplay({ evidenceRef }: { evidenceRef: EvidenceRef }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="ml-4 mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span className="font-mono">{evidenceRef.chunkId.slice(0, 12)}...</span>
            <span
              className={`px-1.5 py-0.5 rounded ${
                evidenceRef.supportType === "supports"
                  ? "bg-green-100 text-green-700"
                  : evidenceRef.supportType === "contradicts"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {evidenceRef.supportType}
            </span>
            <span className="text-gray-400">relevance: {(evidenceRef.relevance * 100).toFixed(0)}%</span>
          </div>
          <p className={`text-sm text-gray-700 ${!isExpanded && "line-clamp-2"}`}>
            &quot;{evidenceRef.excerpt}&quot;
          </p>
        </div>
        {evidenceRef.excerpt.length > 100 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-2 text-xs text-blue-600 hover:text-blue-700"
          >
            {isExpanded ? "Less" : "More"}
          </button>
        )}
      </div>
      {evidenceRef.highlights && evidenceRef.highlights.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {evidenceRef.highlights.slice(0, 5).map((highlight, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded"
            >
              {highlight}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single claim item display
 */
function ClaimItem({
  verification,
  index,
  isExpanded,
  onToggle,
}: {
  verification: ClaimVerification;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        verification.supported
          ? "border-green-200"
          : verification.supportStrength === "contradicted"
          ? "border-red-200"
          : "border-gray-200"
      }`}
    >
      <button
        onClick={onToggle}
        className={`w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-50 ${
          verification.supported ? "bg-green-50/50" : ""
        }`}
      >
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-medium">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-900 leading-relaxed">{verification.claim}</p>
            <SupportBadge supported={verification.supported} strength={verification.supportStrength} />
          </div>
          {verification.notes && (
            <p className="mt-1 text-xs text-gray-500">{verification.notes}</p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && verification.evidenceRefs.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-500 mt-2 mb-1">
            Supporting Evidence ({verification.evidenceRefs.length})
          </h4>
          {verification.evidenceRefs.map((ref, idx) => (
            <EvidenceRefDisplay key={idx} evidenceRef={ref} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Contradiction item display
 */
function ContradictionItem({ contradiction }: { contradiction: Contradiction }) {
  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-4">
      <div className="flex items-start gap-2">
        <svg
          className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Claim: &quot;{contradiction.claim.text}&quot;</p>
          <p className="mt-1 text-sm text-red-700">{contradiction.explanation}</p>
          <div className="mt-2 p-2 bg-white/50 rounded border border-red-100">
            <p className="text-xs text-gray-600">
              Contradicting evidence: &quot;{contradiction.evidence.excerpt.slice(0, 150)}...&quot;
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-red-600">Severity: {(contradiction.severity * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ClaimBreakdown component
 *
 * Shows detailed breakdown of claims with their evidence mapping.
 */
export default function ClaimBreakdown({
  claims,
  unsupportedClaims,
  contradictions,
  answerText,
  showHighlights = false,
}: ClaimBreakdownProps) {
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "supported" | "unsupported" | "contradicted">("all");
  const [sortBy, setSortBy] = useState<"order" | "confidence" | "support">("order");

  // Filter and sort claims
  const filteredClaims = useMemo(() => {
    let filtered = [...claims];

    // Apply filter
    switch (filter) {
      case "supported":
        filtered = filtered.filter((c) => c.supported);
        break;
      case "unsupported":
        filtered = filtered.filter((c) => !c.supported && c.supportStrength !== "contradicted");
        break;
      case "contradicted":
        filtered = filtered.filter((c) => c.supportStrength === "contradicted");
        break;
    }

    // Apply sort
    switch (sortBy) {
      case "confidence":
        filtered.sort((a, b) => b.confidence - a.confidence);
        break;
      case "support":
        filtered.sort((a, b) => {
          const strengthOrder = { strong: 4, weak: 3, none: 2, contradicted: 1 };
          return (
            (strengthOrder[b.supportStrength] || 0) - (strengthOrder[a.supportStrength] || 0)
          );
        });
        break;
    }

    return filtered;
  }, [claims, filter, sortBy]);

  const toggleClaim = (claimId: string) => {
    const newExpanded = new Set(expandedClaims);
    if (newExpanded.has(claimId)) {
      newExpanded.delete(claimId);
    } else {
      newExpanded.add(claimId);
    }
    setExpandedClaims(newExpanded);
  };

  const expandAll = () => {
    setExpandedClaims(new Set(filteredClaims.map((c) => c.claimId)));
  };

  const collapseAll = () => {
    setExpandedClaims(new Set());
  };

  // Statistics
  const stats = {
    total: claims.length,
    supported: claims.filter((c) => c.supported).length,
    unsupported: claims.filter((c) => !c.supported && c.supportStrength !== "contradicted").length,
    contradicted: claims.filter((c) => c.supportStrength === "contradicted").length,
  };

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Claim Analysis</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-600">{stats.supported} supported</span>
          <span className="text-gray-600">{stats.unsupported} unsupported</span>
          {stats.contradicted > 0 && (
            <span className="text-red-600">{stats.contradicted} contradicted</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Filter:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="all">All ({stats.total})</option>
            <option value="supported">Supported ({stats.supported})</option>
            <option value="unsupported">Unsupported ({stats.unsupported})</option>
            {stats.contradicted > 0 && (
              <option value="contradicted">Contradicted ({stats.contradicted})</option>
            )}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="order">Original Order</option>
            <option value="confidence">Confidence</option>
            <option value="support">Support Strength</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Expand All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Contradictions warning */}
      {contradictions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-700 flex items-center gap-1">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Contradictions Found
          </h4>
          {contradictions.map((contradiction, idx) => (
            <ContradictionItem key={idx} contradiction={contradiction} />
          ))}
        </div>
      )}

      {/* Claims list */}
      <div className="space-y-2">
        {filteredClaims.map((verification, idx) => (
          <ClaimItem
            key={verification.claimId}
            verification={verification}
            index={idx}
            isExpanded={expandedClaims.has(verification.claimId)}
            onToggle={() => toggleClaim(verification.claimId)}
          />
        ))}
      </div>

      {/* Empty state */}
      {filteredClaims.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No claims match the current filter.</p>
        </div>
      )}
    </div>
  );
}
