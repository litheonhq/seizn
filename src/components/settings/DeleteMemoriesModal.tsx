"use client";

/**
 * DeleteMemoriesModal - Delete All Memories Modal
 *
 * Modal for deleting all memories from a specific namespace or all user memories.
 * Uses RTBF with scope='user' + namespace filter.
 */

import { useState, useEffect, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

type DeleteStep = "confirm" | "typing" | "deleting" | "complete" | "error";

interface MemoryStats {
  total_count: number;
  namespaces: NamespaceStats[];
}

interface NamespaceStats {
  namespace: string;
  count: number;
  size_bytes: number;
}

interface DeletionResult {
  success: boolean;
  deleted_count: number;
  duration_ms: number;
  error?: string;
}

interface DeleteMemoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: DeletionResult) => void;
  namespace?: string; // Optional: filter to specific namespace
}

// =============================================================================
// Component
// =============================================================================

export function DeleteMemoriesModal({
  isOpen,
  onClose,
  onComplete,
  namespace,
}: DeleteMemoriesModalProps) {
  const [step, setStep] = useState<DeleteStep>("confirm");
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<DeletionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const CONFIRM_PHRASE = "DELETE ALL";

  // Load memory statistics
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      // Build URL with optional namespace filter
      let url = "/api/memories/stats";
      if (namespace) {
        url += `?namespace=${encodeURIComponent(namespace)}`;
      }

      const response = await fetch(url, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        // If stats endpoint doesn't exist, use mock data
        setStats({
          total_count: 0,
          namespaces: [],
        });
      }
    } catch (err) {
      console.error("Failed to load memory stats:", err);
      // Use fallback mock data
      setStats({
        total_count: 0,
        namespaces: [],
      });
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("confirm");
      setStats(null);
      setConfirmText("");
      setResult(null);
      setError(null);
      setLoading(false);
      setProgress(0);
      void loadStats();
    }
  }, [isOpen, loadStats]);

  // Proceed to typing step
  const proceedToTyping = () => {
    setStep("typing");
  };

  // Execute deletion
  const executeDelete = useCallback(async () => {
    if (confirmText !== CONFIRM_PHRASE) return;

    setStep("deleting");
    setLoading(true);
    setError(null);
    setProgress(0);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 15, 85));
    }, 500);

    try {
      // Use RTBF API with user scope and optional namespace filter
      const scopeParams: Record<string, unknown> = {};
      if (namespace) {
        scopeParams.namespace = namespace;
      }

      const response = await fetch("/api/winter/rtbf/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scope: namespace ? "namespace" : "user",
          scope_params: namespace ? { namespace, user_id_for_namespace: undefined } : {},
          reason: namespace
            ? `User requested deletion of all memories in namespace: ${namespace}`
            : "User requested deletion of all memories",
          include_analysis: false,
        }),
      });

      const requestData = await response.json();

      if (!response.ok) {
        throw new Error(requestData.error?.message || "Failed to create deletion request");
      }

      // Execute the deletion
      const executeResponse = await fetch(`/api/winter/rtbf/${requestData.request_id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          include_certificate: false,
        }),
      });

      const executeData = await executeResponse.json();

      clearInterval(progressInterval);

      if (!executeResponse.ok) {
        throw new Error(executeData.error?.message || "Failed to execute deletion");
      }

      setProgress(100);
      setResult({
        success: true,
        deleted_count: executeData.total_deleted || 0,
        duration_ms: executeData.duration_ms || 0,
      });
      setStep("complete");
      onComplete?.({
        success: true,
        deleted_count: executeData.total_deleted || 0,
        duration_ms: executeData.duration_ms || 0,
      });
    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }, [confirmText, namespace, onComplete]);

  // Format file size for display
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isConfirmValid = confirmText === CONFIRM_PHRASE;
  const totalCount = stats?.total_count || 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={step !== "deleting" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-[var(--ink-0)] rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto border border-[var(--ink-200)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--ink-200)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/50 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                  Delete All Memories
                </h2>
                <p className="text-sm text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                  {namespace ? `Namespace: ${namespace}` : "All namespaces"}
                </p>
              </div>
            </div>
            {step !== "deleting" && (
              <button
                onClick={onClose}
                className="text-[var(--signal-conflict-soft)] hover:text-[var(--signal-conflict-ink)] dark:hover:text-[var(--signal-conflict-soft)]"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step: Confirm */}
          {step === "confirm" && (
            <div className="space-y-6">
              {/* Warning Banner */}
              <div className="p-4 rounded-xl bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20 border-2 border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)]">
                <div className="flex items-start gap-3">
                  <WarningIcon className="w-6 h-6 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                      This action cannot be undone
                    </p>
                    <p className="text-sm text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] mt-1">
                      All memories{namespace ? ` in namespace "${namespace}"` : ""} will be
                      permanently deleted. This includes all associated embeddings, metadata,
                      and traces.
                    </p>
                  </div>
                </div>
              </div>

              {/* Memory Stats */}
              {loading ? (
                <div className="py-8 text-center">
                  <Spinner className="w-8 h-8 text-gray-400 mx-auto" />
                  <p className="text-sm text-[var(--ink-600)] mt-2">
                    Loading memory statistics...
                  </p>
                </div>
              ) : stats ? (
                <div className="p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
                  <h3 className="font-medium text-[var(--ink-900)] mb-3">
                    Memories to be deleted
                  </h3>
                  <div className="text-center py-4">
                    <p className="text-4xl font-bold text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                      {totalCount.toLocaleString()}
                    </p>
                    <p className="text-sm text-[var(--ink-600)] mt-1">
                      total memories
                    </p>
                  </div>

                  {/* Namespace breakdown */}
                  {stats.namespaces.length > 0 && (
                    <div className="mt-4 space-y-2 max-h-32 overflow-y-auto">
                      {stats.namespaces.map((ns) => (
                        <div
                          key={ns.namespace}
                          className="flex items-center justify-between text-sm p-2 rounded-lg bg-[var(--ink-0)]"
                        >
                          <span className="text-[var(--ink-600)] font-mono">
                            {ns.namespace || "default"}
                          </span>
                          <span className="text-[var(--ink-600)]">
                            {ns.count.toLocaleString()} ({formatBytes(ns.size_bytes)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-[var(--ink-200)] text-[var(--ink-600)] font-medium hover:bg-[var(--ink-50)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={proceedToTyping}
                  disabled={totalCount === 0}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium hover:from-red-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Typing Confirmation */}
          {step === "typing" && (
            <div className="space-y-6">
              <p className="text-[var(--ink-600)]">
                To confirm deletion, please type{" "}
                <code className="px-2 py-1 bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/30 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] rounded font-mono font-bold">
                  {CONFIRM_PHRASE}
                </code>{" "}
                below.
              </p>

              <div>
                <input aria-label="Confirm Text"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder={`Type "${CONFIRM_PHRASE}" to confirm`}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-mono text-center text-lg tracking-wider transition-colors ${
                    confirmText === ""
                      ? "border-[var(--ink-200)]"
                      : isConfirmValid
                      ? "border-[var(--signal-canon)] bg-[var(--signal-canon-soft)] dark:bg-[var(--signal-canon-ink)]/20 text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]"
                      : "border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]"
                  } bg-[var(--ink-0)] focus:outline-none focus:ring-2 focus:ring-red-500`}
                  autoFocus
                />
                {confirmText !== "" && !isConfirmValid && (
                  <p className="text-sm text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] mt-2 text-center">
                    Please type exactly: {CONFIRM_PHRASE}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending-ink)]/20 border border-[var(--signal-pending)] dark:border-[var(--signal-pending)]">
                <p className="text-sm text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">
                  <strong>Final warning:</strong> This will permanently delete{" "}
                  <strong>{totalCount.toLocaleString()}</strong> memories. This action is
                  irreversible.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("confirm")}
                  className="flex-1 py-3 rounded-xl border border-[var(--ink-200)] text-[var(--ink-600)] font-medium hover:bg-[var(--ink-50)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={executeDelete}
                  disabled={!isConfirmValid || loading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium hover:from-red-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Delete All Memories
                </button>
              </div>
            </div>
          )}

          {/* Step: Deleting */}
          {step === "deleting" && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/30">
                <Spinner className="w-8 h-8 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--ink-900)] mb-2">
                  Deleting Memories
                </h3>
                <p className="text-[var(--ink-600)]">
                  Please wait while we delete your memories...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-[var(--ink-600)]">{progress}% complete</p>
              </div>

              <p className="text-xs text-[var(--ink-500)]">
                Do not close this window until the deletion is complete
              </p>
            </div>
          )}

          {/* Step: Complete */}
          {step === "complete" && result && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--signal-canon-soft)] dark:bg-[var(--signal-canon-ink)]/30">
                <CheckIcon className="w-8 h-8 text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--ink-900)] mb-2">
                  Memories Deleted
                </h3>
                <p className="text-[var(--ink-600)]">
                  All memories have been permanently removed.
                </p>
              </div>

              {/* Summary */}
              <div className="p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[var(--ink-600)]">Memories Deleted</p>
                    <p className="text-2xl font-bold text-[var(--ink-900)]">
                      {result.deleted_count.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--ink-600)]">Duration</p>
                    <p className="text-2xl font-bold text-[var(--ink-900)]">
                      {(result.duration_ms / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 text-white font-medium hover:from-gray-700 hover:to-gray-800 transition-all"
              >
                Done
              </button>
            </div>
          )}

          {/* Step: Error */}
          {step === "error" && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/30">
                <ErrorIcon className="w-8 h-8 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--ink-900)] mb-2">
                  Deletion Failed
                </h3>
                <p className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">{error}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setConfirmText("");
                    setStep("confirm");
                  }}
                  className="flex-1 py-3 rounded-xl border border-[var(--ink-200)] text-[var(--ink-600)] font-medium hover:bg-[var(--ink-50)] transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 text-white font-medium hover:from-gray-700 hover:to-gray-800 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--ink-200)] bg-[var(--ink-50)] rounded-b-2xl">
          <p className="text-xs text-[var(--ink-600)] text-center">
            Memory deletion is processed through our GDPR-compliant RTBF (Right to Be Forgotten)
            system.
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default DeleteMemoriesModal;
