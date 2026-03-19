"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { formatRelativeTime } from "@/lib/format-date";
import {
  CheckCircle,
  XCircle,
  Edit3,
  Clock,
  AlertTriangle,
  Sparkles,
  Tag,
  ChevronRight,
  RefreshCw,
  Inbox,
  Lightbulb,
  Heart,
  FileText,
  Calendar,
  GitBranch,
  Users,
  Shield,
} from "lucide-react";
import type { NoteType, PrivacyClass } from "@/lib/spring/memory-v3/types";

// =============================================================================
// Types
// =============================================================================

interface CandidateNote {
  id: string;
  content: string;
  type: NoteType;
  status: string;
  scope: string;
  privacyClass: PrivacyClass;
  tags: string[];
  createdAt: string;
}

interface SimilarNote {
  noteId: string;
  content: string;
  similarity: number;
}

interface Candidate {
  id: string;
  note: CandidateNote;
  candidateReason: string;
  extractionConfidence: number;
  similarNotes?: SimilarNote[];
  suggestedActions?: string[];
  createdAt: string;
  autoActionAt?: string;
  autoAction?: string;
}

interface CandidatesResponse {
  success: boolean;
  candidates: Candidate[];
  total: number;
  hasMore: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const NOTE_TYPE_CONFIG: Record<
  NoteType,
  { icon: React.ElementType; color: string; label: string }
> = {
  fact: { icon: Lightbulb, color: "text-blue-500", label: "Fact" },
  preference: { icon: Heart, color: "text-rose-500", label: "Preference" },
  instruction: { icon: FileText, color: "text-orange-500", label: "Instruction" },
  episode: { icon: Calendar, color: "text-purple-500", label: "Episode" },
  procedure: { icon: GitBranch, color: "text-green-500", label: "Procedure" },
  relationship: { icon: Users, color: "text-szn-accent", label: "Relationship" },
};

const PRIVACY_ICONS: Record<PrivacyClass, { icon: React.ElementType; color: string }> = {
  public: { icon: Shield, color: "text-green-500" },
  internal: { icon: Shield, color: "text-blue-500" },
  confidential: { icon: Shield, color: "text-orange-500" },
  restricted: { icon: Shield, color: "text-red-500" },
};

// formatRelativeTime imported from @/lib/format-date (replaces local formatTimeAgo)

// =============================================================================
// Components
// =============================================================================

interface CandidateCardProps {
  candidate: Candidate;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onEdit: (id: string, edits: Record<string, unknown>) => Promise<void>;
  isProcessing: boolean;
}

function CandidateCard({
  candidate,
  onApprove,
  onReject,
  onEdit,
  isProcessing,
}: CandidateCardProps) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editContent, setEditContent] = useState(candidate.note.content);
  const [editType, setEditType] = useState<NoteType>(candidate.note.type);
  const [editTags, setEditTags] = useState(candidate.note.tags.join(", "));
  const [expanded, setExpanded] = useState(false);

  const { note, candidateReason, extractionConfidence, similarNotes } = candidate;
  const typeConfig = NOTE_TYPE_CONFIG[note.type];
  const TypeIcon = typeConfig.icon;
  const privacyConfig = PRIVACY_ICONS[note.privacyClass];
  const PrivacyIcon = privacyConfig.icon;

  const handleApprove = async () => {
    await onApprove(candidate.id);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    await onReject(candidate.id, rejectReason);
    setShowRejectModal(false);
    setRejectReason("");
  };

  const handleEdit = async () => {
    const edits: Record<string, unknown> = {};
    if (editContent !== note.content) edits.content = editContent;
    if (editType !== note.type) edits.type = editType;
    const newTags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (JSON.stringify(newTags) !== JSON.stringify(note.tags)) edits.tags = newTags;
    if (Object.keys(edits).length > 0) {
      await onEdit(candidate.id, edits);
    }
    setShowEditModal(false);
  };

  return (
    <>
      <div className="bg-szn-card rounded-xl border border-szn-border p-4 space-y-3 hover:border-szn-accent/50 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg bg-szn-surface ${typeConfig.color}`}>
              <TypeIcon className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-szn-text-2">
              {typeConfig.label}
            </span>
            <div className={`${privacyConfig.color}`}>
              <PrivacyIcon className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-szn-text-2">
            <Clock className="w-3.5 h-3.5" />
            {formatRelativeTime(candidate.createdAt)}
          </div>
        </div>

        {/* Content */}
        <div
          className={`text-szn-text-1 text-sm leading-relaxed ${
            !expanded && note.content.length > 200 ? "line-clamp-3" : ""
          }`}
        >
          {note.content}
        </div>
        {note.content.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-szn-accent hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-szn-surface text-szn-text-2 rounded-full text-xs"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Extraction Info */}
        <div className="flex items-center gap-4 text-xs text-szn-text-2 pt-1 border-t border-szn-border">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {Math.round(extractionConfidence * 100)}% confidence
            </span>
          </div>
          {candidateReason && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="truncate max-w-[200px]">{candidateReason}</span>
            </div>
          )}
        </div>

        {/* Similar Notes */}
        {similarNotes && similarNotes.length > 0 && (
          <div className="pt-2 border-t border-szn-border">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-szn-text-2 hover:text-szn-text-1"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
              {similarNotes.length} similar note{similarNotes.length > 1 ? "s" : ""} found
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                {similarNotes.map((similar) => (
                  <div
                    key={similar.noteId}
                    className="pl-4 border-l-2 border-szn-border text-xs text-szn-text-2"
                  >
                    <div className="line-clamp-2">{similar.content}</div>
                    <div className="text-szn-text-3 mt-0.5">
                      {Math.round(similar.similarity * 100)}% match
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-szn-accent hover:bg-szn-accent/90 disabled:bg-szn-accent/50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-szn-surface hover:bg-szn-surface-1 disabled:opacity-50 text-szn-text-1 rounded-lg text-sm font-medium transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            disabled={isProcessing}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-szn-surface hover:bg-szn-surface-1 disabled:opacity-50 text-szn-text-1 rounded-lg text-sm font-medium transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-szn-card rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-szn-text-1">
              Reject Memory Candidate
            </h3>
            <p className="text-sm text-szn-text-2">
              Please provide a reason for rejecting this candidate. This helps improve future extractions.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Incorrect information, duplicate, not relevant..."
              aria-label="Rejection reason"
              className="w-full px-3 py-2 border border-szn-border rounded-lg bg-szn-card text-szn-text-1 text-sm resize-none focus:ring-2 focus:ring-szn-accent focus:border-transparent"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                className="px-4 py-2 text-sm text-szn-text-2 hover:text-szn-text-1"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || isProcessing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg text-sm font-medium"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-szn-card rounded-lg max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-szn-text-1">
              Edit Memory Candidate
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1">
                  Content
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  aria-label="Memory content"
                  className="w-full px-3 py-2 border border-szn-border rounded-lg bg-szn-card text-szn-text-1 text-sm resize-none focus:ring-2 focus:ring-szn-accent focus:border-transparent"
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1">
                  Type
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as NoteType)}
                  aria-label="Memory type"
                  className="w-full px-3 py-2 border border-szn-border rounded-lg bg-szn-card text-szn-text-1 text-sm focus:ring-2 focus:ring-szn-accent focus:border-transparent"
                >
                  {Object.entries(NOTE_TYPE_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="e.g., work, preferences, coding"
                  className="w-full px-3 py-2 border border-szn-border rounded-lg bg-szn-card text-szn-text-1 text-sm focus:ring-2 focus:ring-szn-accent focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm text-szn-text-2 hover:text-szn-text-1"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={isProcessing}
                className="px-4 py-2 bg-szn-accent hover:bg-szn-accent/90 disabled:bg-szn-accent/50 text-white rounded-lg text-sm font-medium"
              >
                Save & Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function CandidatesClient() {
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 50;
  const currentCandidatesKey = `/api/spring/memory/candidates?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;

  const { data, error, isLoading } = useSWR<CandidatesResponse>(
    currentCandidatesKey,
    fetcher,
    { refreshInterval: 30000, onSuccess: (newData) => {
      if (page === 0) {
        setAllCandidates(newData.candidates);
      }
    }}
  );

  const handleApprove = useCallback(async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/spring/memory/candidates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        mutate(currentCandidatesKey);
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [currentCandidatesKey]);

  const handleReject = useCallback(async (id: string, reason: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/spring/memory/candidates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      if (res.ok) {
        mutate(currentCandidatesKey);
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [currentCandidatesKey]);

  const handleEdit = useCallback(async (id: string, edits: Record<string, unknown>) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      // First edit, then approve
      const editRes = await fetch(`/api/spring/memory/candidates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", edits }),
      });
      if (editRes.ok) {
        // Now approve
        await fetch(`/api/spring/memory/candidates/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
        mutate(currentCandidatesKey);
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [currentCandidatesKey]);

  const handleRefresh = useCallback(() => {
    setPage(0);
    setAllCandidates([]);
    mutate(`/api/spring/memory/candidates?limit=${PAGE_SIZE}&offset=0`);
  }, []);

  const handleLoadMore = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/spring/memory/candidates?limit=${PAGE_SIZE}&offset=${nextPage * PAGE_SIZE}`);
      const newData: CandidatesResponse = await res.json();
      if (newData.success && newData.candidates.length > 0) {
        setAllCandidates(prev => [...prev, ...newData.candidates]);
        setPage(nextPage);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [page]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-szn-surface rounded animate-pulse w-1/3" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-32 bg-szn-bg rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold text-szn-text-1 mb-2">
          Failed to load candidates
        </h2>
        <p className="text-sm text-szn-text-2 mb-4">
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-szn-accent hover:bg-szn-accent/90 text-white rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }

  const candidates = allCandidates.length > 0 ? allCandidates : (data?.candidates || []);

  // Empty state
  if (candidates.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-szn-text-1">
            Memory Candidates
          </h1>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-szn-text-2 hover:text-szn-text-1"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-szn-bg rounded-full flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-szn-text-3" />
          </div>
          <h2 className="text-lg font-semibold text-szn-text-1 mb-2">
            All caught up!
          </h2>
          <p className="text-sm text-szn-text-2 max-w-md">
            No pending memory candidates to review. New memories extracted from your conversations will appear here for approval.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-szn-text-1">
            Memory Candidates
          </h1>
          <p className="text-sm text-szn-text-2 mt-1">
            {data?.total || candidates.length} pending{" "}
            {(data?.total || candidates.length) === 1 ? "memory" : "memories"} to review
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-szn-text-2 hover:text-szn-text-1"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Candidates List */}
      <div className="grid gap-4">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
            isProcessing={processingIds.has(candidate.id)}
          />
        ))}
      </div>

      {/* Load More */}
      {data?.hasMore && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 text-sm text-szn-accent hover:underline disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isLoadingMore ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more candidates"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
