"use client";

/**
 * RTBFModal - Right to Be Forgotten Request Modal
 *
 * GDPR Article 17 compliant data deletion request modal.
 * Shows impact analysis, confirmation step, progress indicator,
 * and certificate download upon completion.
 */

import { useState, useEffect, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

type RTBFStep = "analysis" | "confirm" | "executing" | "complete" | "error";
type ErasureScope = "user" | "memory" | "namespace" | "date_range";

interface ImpactAnalysis {
  request_id: string;
  affected_tables: AffectedTable[];
  total_records: number;
  total_size_bytes: number;
  has_dependencies: boolean;
  warnings: string[];
  estimated_duration_seconds: number;
}

interface AffectedTable {
  table_name: string;
  record_count: number;
  estimated_size_bytes: number;
  has_cascade: boolean;
}

interface RTBFStatus {
  request_id: string;
  status: string;
  phase: string;
  progress_percent: number;
  audit?: {
    affected_tables: string[];
    affected_count: number;
    verification_hash?: string;
  };
}

interface ExecutionResult {
  success: boolean;
  request_id: string;
  phase: string;
  total_deleted: number;
  duration_ms: number;
  verification?: {
    verified: boolean;
    verification_hash?: string;
  };
  certificate?: {
    certificate_id: string;
    issued_at: string;
  };
  error?: string;
}

interface RTBFModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: ExecutionResult) => void;
  scope?: ErasureScope;
  scopeParams?: Record<string, unknown>;
}

// =============================================================================
// Component
// =============================================================================

export function RTBFModal({
  isOpen,
  onClose,
  onComplete,
  scope = "user",
  scopeParams,
}: RTBFModalProps) {
  const [step, setStep] = useState<RTBFStep>("analysis");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(null);
  const [status, setStatus] = useState<RTBFStatus | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("analysis");
      setRequestId(null);
      setImpactAnalysis(null);
      setStatus(null);
      setResult(null);
      setError(null);
      setConfirmed(false);
      setLoading(false);
      setReason("");
    }
  }, [isOpen]);

  // Create RTBF request and get impact analysis
  const createRequest = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/winter/rtbf/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scope,
          scope_params: scopeParams,
          reason: reason || "User requested data deletion",
          include_analysis: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to create RTBF request");
      }

      setRequestId(data.request_id);
      setImpactAnalysis(data.impact_analysis);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }, [scope, scopeParams, reason]);

  // Poll for status updates
  const pollStatus = useCallback(async (reqId: string) => {
    try {
      const response = await fetch(`/api/winter/rtbf/${reqId}`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to get status");
      }

      setStatus(data);

      // Check if complete
      if (data.status === "completed") {
        return true;
      } else if (data.status === "failed") {
        throw new Error("Deletion failed");
      }

      return false;
    } catch (err) {
      throw err;
    }
  }, []);

  // Execute deletion
  const executeRequest = useCallback(async () => {
    if (!requestId) return;

    setStep("executing");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/winter/rtbf/${requestId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          include_certificate: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to execute deletion");
      }

      setResult(data);

      // Poll for completion if not immediately done
      if (data.phase !== "completed" && data.phase !== "failed") {
        let completed = false;
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max

        while (!completed && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          completed = await pollStatus(requestId);
          attempts++;
        }

        if (!completed) {
          throw new Error("Deletion timed out. Please check status in the dashboard.");
        }
      }

      setStep("complete");
      onComplete?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }, [requestId, pollStatus, onComplete]);

  // Download certificate
  const downloadCertificate = useCallback(async () => {
    if (!requestId) return;

    try {
      const response = await fetch(`/api/winter/rtbf/${requestId}/certificate`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to download certificate");
      }

      // Download as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deletion-certificate-${requestId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Certificate download failed:", err);
    }
  }, [requestId]);

  // Format bytes for display
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format duration for display
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
    return `${Math.ceil(seconds / 3600)} hours`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={step !== "executing" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-szn-card rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto border border-szn-border">
        {/* Header */}
        <div className="px-6 py-4 border-b border-szn-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-szn-text-1">
                  Delete Your Data
                </h2>
                <p className="text-sm text-szn-text-2">
                  GDPR Right to Be Forgotten
                </p>
              </div>
            </div>
            {step !== "executing" && (
              <button
                onClick={onClose}
                className="text-szn-text-3 hover:text-szn-text-2"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step: Analysis */}
          {step === "analysis" && (
            <div className="space-y-6">
              <p className="text-szn-text-2">
                This will permanently delete all your data from our systems. This action
                cannot be undone.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-szn-text-2 mb-2">
                    Reason for deletion (optional)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you requesting data deletion?"
                    className="w-full px-4 py-3 rounded-xl border border-szn-border bg-szn-card text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={3}
                  />
                </div>

                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <WarningIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Important Notice
                      </p>
                      <ul className="text-sm text-amber-700 dark:text-amber-400 mt-1 space-y-1">
                        <li>All memories and associated data will be permanently deleted</li>
                        <li>This includes traces, analytics, and embeddings</li>
                        <li>A deletion certificate will be provided for your records</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={createRequest}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium hover:from-red-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner className="w-5 h-5" />
                    Analyzing Impact...
                  </span>
                ) : (
                  "Analyze Impact"
                )}
              </button>
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && impactAnalysis && (
            <div className="space-y-6">
              {/* Impact Summary */}
              <div className="p-4 rounded-xl bg-szn-surface border border-szn-border">
                <h3 className="font-medium text-szn-text-1 mb-3">
                  Impact Analysis
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-szn-text-2">Total Records</p>
                    <p className="text-2xl font-bold text-szn-text-1">
                      {impactAnalysis.total_records.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-szn-text-2">Data Size</p>
                    <p className="text-2xl font-bold text-szn-text-1">
                      {formatBytes(impactAnalysis.total_size_bytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-szn-text-2">Affected Tables</p>
                    <p className="text-2xl font-bold text-szn-text-1">
                      {impactAnalysis.affected_tables.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-szn-text-2">Est. Duration</p>
                    <p className="text-2xl font-bold text-szn-text-1">
                      {formatDuration(impactAnalysis.estimated_duration_seconds)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Affected Tables */}
              <div>
                <h4 className="text-sm font-medium text-szn-text-2 mb-2">
                  Data to be deleted
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {impactAnalysis.affected_tables.map((table) => (
                    <div
                      key={table.table_name}
                      className="flex items-center justify-between p-3 rounded-lg bg-szn-surface border border-szn-border"
                    >
                      <span className="text-sm text-szn-text-2 capitalize">
                        {table.table_name.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-medium text-szn-text-1">
                        {table.record_count.toLocaleString()} records
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warnings */}
              {impactAnalysis.warnings.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                    Warnings
                  </p>
                  <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                    {impactAnalysis.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-szn-border text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="text-sm font-medium text-red-800 dark:text-red-300">
                    I understand this action is permanent
                  </span>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    All my data will be permanently deleted and cannot be recovered.
                  </p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("analysis")}
                  className="flex-1 py-3 rounded-xl border border-szn-border text-szn-text-2 font-medium hover:bg-szn-surface-1 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={executeRequest}
                  disabled={!confirmed || loading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium hover:from-red-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Delete My Data
                </button>
              </div>
            </div>
          )}

          {/* Step: Executing */}
          {step === "executing" && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
                <Spinner className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-szn-text-1 mb-2">
                  Deleting Your Data
                </h3>
                <p className="text-szn-text-2">
                  Please wait while we securely delete your data...
                </p>
              </div>

              {/* Progress Bar */}
              {status && (
                <div className="space-y-2">
                  <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all duration-500"
                      style={{ width: `${status.progress_percent}%` }}
                    />
                  </div>
                  <p className="text-sm text-szn-text-2 capitalize">
                    {status.phase.replace(/_/g, " ")} - {status.progress_percent}%
                  </p>
                </div>
              )}

              <p className="text-xs text-szn-text-3">
                This may take a few minutes depending on the amount of data
              </p>
            </div>
          )}

          {/* Step: Complete */}
          {step === "complete" && result && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-szn-text-1 mb-2">
                  Data Deleted Successfully
                </h3>
                <p className="text-szn-text-2">
                  Your data has been permanently removed from our systems.
                </p>
              </div>

              {/* Summary */}
              <div className="p-4 rounded-xl bg-szn-surface border border-szn-border text-left">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-szn-text-2">Records Deleted</p>
                    <p className="font-medium text-szn-text-1">
                      {result.total_deleted.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-szn-text-2">Duration</p>
                    <p className="font-medium text-szn-text-1">
                      {(result.duration_ms / 1000).toFixed(1)}s
                    </p>
                  </div>
                  {result.verification?.verified && (
                    <div className="col-span-2">
                      <p className="text-szn-text-2">Verification Status</p>
                      <p className="font-medium text-green-600 dark:text-green-400">
                        Verified
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Certificate Download */}
              {result.certificate && (
                <button
                  onClick={downloadCertificate}
                  className="w-full py-3 rounded-xl border-2 border-szn-success/30 bg-szn-success/10 text-szn-success font-medium hover:bg-szn-success/20 transition-colors flex items-center justify-center gap-2"
                >
                  <DownloadIcon className="w-5 h-5" />
                  Download Deletion Certificate
                </button>
              )}

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
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
                <ErrorIcon className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-szn-text-1 mb-2">
                  Something Went Wrong
                </h3>
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("analysis")}
                  className="flex-1 py-3 rounded-xl border border-szn-border text-szn-text-2 font-medium hover:bg-szn-surface-1 transition-colors"
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
        <div className="px-6 py-4 border-t border-szn-border bg-szn-surface/50 rounded-b-2xl">
          <p className="text-xs text-szn-text-2 text-center">
            Under GDPR Article 17, you have the right to request erasure of your personal data.
            We process deletion requests within 30 days.
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

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
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

export default RTBFModal;
