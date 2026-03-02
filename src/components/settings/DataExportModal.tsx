"use client";

/**
 * DataExportModal - Data Export Request Modal
 *
 * GDPR Article 20 compliant data portability modal.
 * Allows users to export their data in JSON or CSV format.
 */

import { useState, useEffect, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

type ExportStep = "options" | "exporting" | "complete" | "error";
type ExportFormat = "json" | "csv";

interface ExportResult {
  success: boolean;
  export_id?: string;
  download_url?: string;
  file_name?: string;
  file_size?: number;
  records_exported?: number;
  format?: ExportFormat;
  expires_at?: string;
  error?: string;
}

interface DataExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: ExportResult) => void;
}

// =============================================================================
// Component
// =============================================================================

export function DataExportModal({
  isOpen,
  onClose,
  onComplete,
}: DataExportModalProps) {
  const [step, setStep] = useState<ExportStep>("options");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [includeMemories, setIncludeMemories] = useState(true);
  const [includeTraces, setIncludeTraces] = useState(true);
  const [includeAnalytics, setIncludeAnalytics] = useState(false);
  const [includeProfile, setIncludeProfile] = useState(true);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("options");
      setFormat("json");
      setIncludeMemories(true);
      setIncludeTraces(true);
      setIncludeAnalytics(false);
      setIncludeProfile(true);
      setResult(null);
      setError(null);
      setLoading(false);
      setProgress(0);
    }
  }, [isOpen]);

  // Start export
  const startExport = useCallback(async () => {
    setStep("exporting");
    setLoading(true);
    setError(null);
    setProgress(0);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 500);

    try {
      const includes: string[] = [];
      if (includeMemories) includes.push("memories");
      if (includeTraces) includes.push("traces");
      if (includeAnalytics) includes.push("analytics");
      if (includeProfile) includes.push("profile");

      const response = await fetch("/api/export/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          format,
          includes,
        }),
      });

      const data = await response.json();

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to export data");
      }

      setProgress(100);
      setResult(data);
      setStep("complete");
      onComplete?.(data);
    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }, [format, includeMemories, includeTraces, includeAnalytics, includeProfile, onComplete]);

  // Download the exported file
  const downloadExport = useCallback(() => {
    if (!result?.download_url) return;

    const a = document.createElement("a");
    a.href = result.download_url;
    a.download = result.file_name || `data-export.${format}`;
    a.click();
  }, [result, format]);

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if any data category is selected
  const hasSelection = includeMemories || includeTraces || includeAnalytics || includeProfile;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={step !== "exporting" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-szn-card rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto border border-szn-border">
        {/* Header */}
        <div className="px-6 py-4 border-b border-szn-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <DownloadIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-szn-text-1">
                  Export Your Data
                </h2>
                <p className="text-sm text-szn-text-2">
                  GDPR Data Portability
                </p>
              </div>
            </div>
            {step !== "exporting" && (
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
          {/* Step: Options */}
          {step === "options" && (
            <div className="space-y-6">
              <p className="text-szn-text-2">
                Download a copy of all your data stored in our systems. Choose your preferred format and data categories.
              </p>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-szn-text-2 mb-3">
                  Export Format
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormat("json")}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      format === "json"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-szn-border hover:border-szn-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        format === "json"
                          ? "bg-blue-100 dark:bg-blue-900/50"
                          : "bg-szn-surface"
                      }`}>
                        <JSONIcon className={`w-5 h-5 ${
                          format === "json"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-szn-text-2"
                        }`} />
                      </div>
                      <div className="text-left">
                        <p className={`font-medium ${
                          format === "json"
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-szn-text-2"
                        }`}>
                          JSON
                        </p>
                        <p className="text-xs text-szn-text-2">
                          Structured data format
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setFormat("csv")}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      format === "csv"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-szn-border hover:border-szn-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        format === "csv"
                          ? "bg-blue-100 dark:bg-blue-900/50"
                          : "bg-szn-surface"
                      }`}>
                        <CSVIcon className={`w-5 h-5 ${
                          format === "csv"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-szn-text-2"
                        }`} />
                      </div>
                      <div className="text-left">
                        <p className={`font-medium ${
                          format === "csv"
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-szn-text-2"
                        }`}>
                          CSV
                        </p>
                        <p className="text-xs text-szn-text-2">
                          Spreadsheet compatible
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Data Categories */}
              <div>
                <label className="block text-sm font-medium text-szn-text-2 mb-3">
                  Include Data
                </label>
                <div className="space-y-3">
                  <DataCategoryToggle
                    label="Memories"
                    description="All stored memories and embeddings"
                    checked={includeMemories}
                    onChange={setIncludeMemories}
                  />
                  <DataCategoryToggle
                    label="Retrieval Traces"
                    description="Query history and retrieval logs"
                    checked={includeTraces}
                    onChange={setIncludeTraces}
                  />
                  <DataCategoryToggle
                    label="Analytics Data"
                    description="Usage statistics and metrics"
                    checked={includeAnalytics}
                    onChange={setIncludeAnalytics}
                  />
                  <DataCategoryToggle
                    label="Profile Information"
                    description="Account settings and preferences"
                    checked={includeProfile}
                    onChange={setIncludeProfile}
                  />
                </div>
              </div>

              {/* Info Box */}
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">What&apos;s included</p>
                    <p>
                      Your export will contain all selected data in a portable format
                      that you can use with other services.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={startExport}
                disabled={!hasSelection || loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Start Export
              </button>
            </div>
          )}

          {/* Step: Exporting */}
          {step === "exporting" && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Spinner className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-szn-text-1 mb-2">
                  Preparing Your Export
                </h3>
                <p className="text-szn-text-2">
                  Please wait while we compile your data...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-szn-text-2">
                  {progress}% complete
                </p>
              </div>

              <p className="text-xs text-szn-text-3">
                This may take a few moments depending on the amount of data
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
                  Export Ready
                </h3>
                <p className="text-szn-text-2">
                  Your data export has been prepared and is ready to download.
                </p>
              </div>

              {/* Export Summary */}
              <div className="p-4 rounded-xl bg-szn-surface border border-szn-border text-left">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-szn-text-2">Format</p>
                    <p className="font-medium text-szn-text-1 uppercase">
                      {result.format || format}
                    </p>
                  </div>
                  {result.file_size && (
                    <div>
                      <p className="text-szn-text-2">File Size</p>
                      <p className="font-medium text-szn-text-1">
                        {formatFileSize(result.file_size)}
                      </p>
                    </div>
                  )}
                  {result.records_exported && (
                    <div>
                      <p className="text-szn-text-2">Records</p>
                      <p className="font-medium text-szn-text-1">
                        {result.records_exported.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {result.expires_at && (
                    <div>
                      <p className="text-szn-text-2">Expires</p>
                      <p className="font-medium text-szn-text-1">
                        {new Date(result.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Button */}
              <button
                onClick={downloadExport}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-szn-success to-szn-accent text-white font-medium hover:from-szn-success hover:to-szn-accent transition-all flex items-center justify-center gap-2"
              >
                <DownloadIcon className="w-5 h-5" />
                Download {format.toUpperCase()} File
              </button>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl border border-szn-border text-szn-text-2 font-medium hover:bg-szn-surface-1 transition-colors"
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
                  Export Failed
                </h3>
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("options")}
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
            Under GDPR Article 20, you have the right to receive your personal data in a structured,
            commonly used, and machine-readable format.
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-Components
// =============================================================================

function DataCategoryToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-szn-surface border border-szn-border">
      <div>
        <p className="text-sm font-medium text-szn-text-1">{label}</p>
        <p className="text-xs text-szn-text-2">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
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

function JSONIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function CSVIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125m1.125-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
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

export default DataExportModal;
