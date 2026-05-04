"use client";

import { useState } from "react";
import type { ContractVerdict as VerdictType, VerificationResult } from "@/lib/answer-contract/types";

/**
 * Props for ContractVerdict component
 */
interface ContractVerdictProps {
  verdict: VerdictType;
  result: VerificationResult;
  adjustedAnswer?: string;
  contractId?: string;
  compact?: boolean;
  showDetails?: boolean;
  onViewDetails?: () => void;
}

/**
 * Verdict configuration
 */
const verdictConfig: Record<
  VerdictType,
  { label: string; description: string; bgColor: string; textColor: string; badge: string; icon: string }
> = {
  pass: {
    label: "Grounded",
    description: "Answer is well-supported by evidence",
    bgColor: "bg-[var(--signal-canon-soft)]",
    textColor: "text-[var(--signal-canon-ink)]",
    badge: "szn-badge szn-badge-success",
    icon: "check-circle",
  },
  partial: {
    label: "Partially Grounded",
    description: "Some claims lack sufficient evidence",
    bgColor: "bg-[var(--signal-pending-soft)]",
    textColor: "text-[var(--signal-pending-ink)]",
    badge: "szn-badge szn-badge-warning",
    icon: "alert-circle",
  },
  fail: {
    label: "Not Grounded",
    description: "Answer is not sufficiently supported",
    bgColor: "bg-[var(--signal-conflict-soft)]",
    textColor: "text-[var(--signal-conflict-ink)]",
    badge: "szn-badge szn-badge-error",
    icon: "x-circle",
  },
  abstain: {
    label: "Abstained",
    description: "Insufficient evidence to answer",
    bgColor: "bg-gray-100",
    textColor: "text-gray-800",
    badge: "szn-badge szn-badge-muted",
    icon: "minus-circle",
  },
};

/**
 * Score bar component
 */
function ScoreBar({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number;
  threshold?: number;
}) {
  const percentage = Math.round(value * 100);
  const isAboveThreshold = threshold === undefined || value >= threshold;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className={isAboveThreshold ? "text-gray-900" : "text-[var(--signal-conflict-ink)]"}>
          {percentage}%
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isAboveThreshold ? "bg-[var(--signal-canon)]" : "bg-[var(--signal-conflict)]"
          }`}
          style={{ width: `${percentage}%` }}
        />
        {threshold !== undefined && (
          <div
            className="relative h-0"
            style={{ marginLeft: `${threshold * 100}%`, marginTop: "-8px" }}
          >
            <div className="w-0.5 h-2 bg-gray-700" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Icon component
 */
function VerdictIcon({ type, className = "" }: { type: string; className?: string }) {
  switch (type) {
    case "check-circle":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "alert-circle":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case "x-circle":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "minus-circle":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * ContractVerdict component
 *
 * Displays the verdict of an answer contract evaluation with
 * scores and optional details.
 */
export default function ContractVerdict({
  verdict,
  result,
  adjustedAnswer,
  contractId,
  compact = false,
  showDetails = true,
  onViewDetails,
}: ContractVerdictProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = verdictConfig[verdict];

  // Compact mode - just the badge
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${config.badge}`}
      >
        <VerdictIcon type={config.icon} className="w-3 h-3" />
        {config.label}
      </span>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 ${config.bgColor} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <VerdictIcon type={config.icon} className={`w-5 h-5 ${config.textColor}`} />
          <div>
            <h3 className={`font-semibold ${config.textColor}`}>{config.label}</h3>
            <p className={`text-xs ${config.textColor} opacity-80`}>{config.description}</p>
          </div>
        </div>
        {contractId && (
          <span className="text-xs text-gray-500 font-mono">{contractId.slice(0, 12)}...</span>
        )}
      </div>

      {/* Scores */}
      <div className="px-4 py-3 bg-white space-y-3">
        <ScoreBar label="Grounding" value={result.groundingScore} threshold={0.7} />
        <ScoreBar label="Faithfulness" value={result.faithfulnessScore} threshold={0.8} />
        <ScoreBar label="Coverage" value={result.coverageScore} threshold={0.5} />
      </div>

      {/* Claims summary */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Claims Analysis</span>
          <div className="flex items-center gap-3">
            <span className="text-[var(--signal-canon-ink)]">
              {result.claims.filter((c) => c.supported).length} supported
            </span>
            <span className="text-[var(--signal-conflict-ink)]">{result.unsupportedClaims.length} unsupported</span>
            {result.contradictions.length > 0 && (
              <span className="text-orange-600">{result.contradictions.length} contradictions</span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable details */}
      {showDetails && (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 border-t border-gray-200 flex items-center justify-center gap-1"
          >
            {isExpanded ? "Hide Details" : "Show Details"}
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isExpanded && (
            <div className="px-4 py-3 bg-white border-t border-gray-200 space-y-3">
              {/* Metadata */}
              <div className="text-xs text-gray-500 grid grid-cols-2 gap-2">
                <div>Total claims: {result.metadata.totalClaims}</div>
                <div>Evidence chunks: {result.metadata.evidenceChunksUsed}</div>
                <div>Processing time: {result.metadata.processingTimeMs}ms</div>
                {result.metadata.modelUsed && <div>Model: {result.metadata.modelUsed}</div>}
              </div>

              {/* Adjusted answer preview */}
              {adjustedAnswer && verdict !== "pass" && (
                <div className="mt-3 p-3 bg-[var(--signal-pending-soft)] rounded-lg border border-[var(--signal-pending)]">
                  <h4 className="text-xs font-medium text-[var(--signal-pending-ink)] mb-1">Adjusted Response</h4>
                  <p className="text-sm text-[var(--signal-pending-ink)]">{adjustedAnswer.slice(0, 200)}...</p>
                </div>
              )}

              {/* View full details button */}
              {onViewDetails && (
                <button
                  onClick={onViewDetails}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View Full Analysis
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Export compact badge version
 */
export function VerdictBadge({ verdict }: { verdict: VerdictType }) {
  const config = verdictConfig[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1 ${config.badge}`}
    >
      <VerdictIcon type={config.icon} className="w-3 h-3" />
      {config.label}
    </span>
  );
}
