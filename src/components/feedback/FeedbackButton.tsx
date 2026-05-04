"use client";

import { useState } from "react";

// ============================================
// Types
// ============================================

export interface FeedbackButtonProps {
  resourceType: "trace" | "search" | "answer" | "document";
  resourceId: string;
  className?: string;
  onFeedback?: (rating: "positive" | "negative", reason?: string) => void;
}

interface FeedbackReason {
  id: string;
  label: string;
}

const NEGATIVE_REASONS: Record<string, FeedbackReason[]> = {
  trace: [
    { id: "slow", label: "Too slow" },
    { id: "expensive", label: "Too expensive" },
    { id: "wrong_results", label: "Wrong results" },
    { id: "other", label: "Other" },
  ],
  search: [
    { id: "irrelevant", label: "Irrelevant results" },
    { id: "missing", label: "Missing expected results" },
    { id: "wrong_order", label: "Wrong ranking order" },
    { id: "other", label: "Other" },
  ],
  answer: [
    { id: "incorrect", label: "Incorrect answer" },
    { id: "incomplete", label: "Incomplete answer" },
    { id: "no_citations", label: "Missing citations" },
    { id: "hallucination", label: "Contains hallucinations" },
    { id: "other", label: "Other" },
  ],
  document: [
    { id: "wrong_chunks", label: "Bad chunking" },
    { id: "missing_content", label: "Missing content" },
    { id: "metadata_wrong", label: "Wrong metadata" },
    { id: "other", label: "Other" },
  ],
};

// ============================================
// Icons
// ============================================

const ThumbsUpIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
  </svg>
);

const ThumbsDownIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
  </svg>
);

// ============================================
// Component
// ============================================

export function FeedbackButton({
  resourceType,
  resourceId,
  className = "",
  onFeedback,
}: FeedbackButtonProps) {
  const [rating, setRating] = useState<"positive" | "negative" | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handlePositive = async () => {
    setRating("positive");
    setSubmitting(true);

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          rating: "positive",
        }),
      });
      onFeedback?.("positive");
      setSubmitted(true);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNegative = () => {
    setRating("negative");
    setShowReasons(true);
  };

  const handleSubmitNegative = async (reason: string) => {
    setSelectedReason(reason);
    setSubmitting(true);

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          rating: "negative",
          reason,
        }),
      });
      onFeedback?.("negative", reason);
      setSubmitted(true);
      setShowReasons(false);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={`inline-flex items-center gap-2 text-sm ${className}`}>
        <span className="text-[var(--ink-900)] font-medium">Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Thumbs buttons */}
      <div className="inline-flex items-center gap-1 bg-[var(--ink-50)] rounded-lg p-1">
        <span className="text-xs text-[var(--ink-600)] px-2">Helpful?</span>
        <button
          onClick={handlePositive}
          disabled={submitting || rating !== null}
          className={`p-1.5 rounded-md transition-colors ${
            rating === "positive"
              ? "bg-[var(--ink-900)]/10 text-[var(--ink-900)]"
              : "hover:bg-[var(--ink-50)] text-[var(--ink-600)] hover:text-[var(--ink-900)]"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Yes, helpful"
        >
          <ThumbsUpIcon className="w-4 h-4" filled={rating === "positive"} />
        </button>
        <button
          onClick={handleNegative}
          disabled={submitting || rating !== null}
          className={`p-1.5 rounded-md transition-colors ${
            rating === "negative"
              ? "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]"
              : "hover:bg-[var(--ink-50)] text-[var(--ink-600)] hover:text-[var(--signal-conflict-ink)]"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="No, not helpful"
        >
          <ThumbsDownIcon className="w-4 h-4" filled={rating === "negative"} />
        </button>
      </div>

      {/* Reason dropdown for negative feedback */}
      {showReasons && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[var(--ink-200)] p-3 z-10">
          <p className="text-sm font-medium text-[var(--ink-900)] mb-2">What was the issue?</p>
          <div className="space-y-1">
            {NEGATIVE_REASONS[resourceType].map((reason) => (
              <button
                key={reason.id}
                onClick={() => handleSubmitNegative(reason.id)}
                disabled={submitting}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  selectedReason === reason.id
                    ? "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]"
                    : "hover:bg-[var(--ink-50)] text-[var(--ink-900)]"
                } disabled:opacity-50`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowReasons(false);
              setRating(null);
            }}
            className="mt-2 text-xs text-[var(--ink-600)] hover:text-[var(--ink-900)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default FeedbackButton;
