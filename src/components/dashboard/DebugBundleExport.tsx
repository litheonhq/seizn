"use client";

import { useState, useCallback } from "react";
import type { ExpiresIn } from "@/lib/sharing/types";

// ============================================
// Types
// ============================================

interface DebugBundleExportProps {
  traceId: string;
  onExported?: () => void;
}

type ExportFormat = "json" | "markdown";

// ============================================
// Icons
// ============================================

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const ShareIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
  </svg>
);

const DocumentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const CodeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ClipboardIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
  </svg>
);

const LinkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ============================================
// Component
// ============================================

export function DebugBundleExport({ traceId, onExported }: DebugBundleExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"download" | "share">("download");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Download options
  const [format, setFormat] = useState<ExportFormat>("json");
  const [maskPii, setMaskPii] = useState(true);
  const [maskSecrets, setMaskSecrets] = useState(true);
  const [hideRawContent, setHideRawContent] = useState(false);

  // Share options
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("24h");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getApiKey = useCallback(() => {
    return localStorage.getItem("seizn_api_key") || "";
  }, []);

  // Download bundle
  const handleDownload = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/traces/${traceId}/export-bundle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getApiKey(),
        },
        body: JSON.stringify({
          format,
          redactionProfile: {
            pii: maskPii,
            secrets: maskSecrets,
            raw_content: hideRawContent,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to export bundle");
      }

      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "")
        || `seizn-debug-${traceId.substring(0, 8)}.${format === "markdown" ? "md" : "json"}`;

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onExported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Create share link
  const handleShare = async () => {
    setLoading(true);
    setError(null);
    setShareUrl(null);

    try {
      const response = await fetch(`/api/traces/${traceId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getApiKey(),
        },
        body: JSON.stringify({
          expiresIn,
          redactionProfile: {
            pii: maskPii,
            secrets: maskSecrets,
            raw_content: hideRawContent,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create share link");
      }

      setShareUrl(data.shareUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Copy share URL
  const handleCopy = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        title="Export Debug Bundle"
      >
        <DownloadIcon className="w-4 h-4" />
        <span className="text-sm">Debug Bundle</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto border border-gray-800">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-xl font-semibold text-white">Export Debug Bundle</h2>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShareUrl(null);
                  setError(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => {
                  setActiveTab("download");
                  setShareUrl(null);
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "download"
                    ? "border-b-2 border-blue-500 text-blue-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <DownloadIcon className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={() => {
                  setActiveTab("share");
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "share"
                    ? "border-b-2 border-blue-500 text-blue-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <ShareIcon className="w-4 h-4" />
                Share Link
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Error display */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Share URL Success */}
              {shareUrl && activeTab === "share" && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-green-400 mb-3">
                    <CheckIcon className="w-5 h-5" />
                    <span className="font-medium">Share link created!</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono text-gray-300"
                    />
                    <button
                      onClick={handleCopy}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <ClipboardIcon className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    {expiresIn === "never"
                      ? "This link never expires."
                      : `This link expires in ${expiresIn === "1h" ? "1 hour" : expiresIn === "24h" ? "24 hours" : "7 days"}.`}
                  </p>
                </div>
              )}

              {/* Bundle Contents */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3">Bundle Contents</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <DocumentIcon className="w-5 h-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-white">Trace Snapshot</div>
                      <div className="text-xs text-gray-500">Redacted JSON</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <CodeIcon className="w-5 h-5 text-purple-400" />
                    <div>
                      <div className="text-sm text-white">Replay Commands</div>
                      <div className="text-xs text-gray-500">curl/JS/Python</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <div className="text-sm text-white">Environment</div>
                      <div className="text-xs text-gray-500">Versions & config</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <div className="text-sm text-white">Error Logs</div>
                      <div className="text-xs text-gray-500">PII removed</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Format (Download tab only) */}
              {activeTab === "download" && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Export Format</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFormat("json")}
                      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
                        format === "json"
                          ? "bg-blue-600/20 border-blue-500 text-blue-400"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => setFormat("markdown")}
                      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
                        format === "markdown"
                          ? "bg-blue-600/20 border-blue-500 text-blue-400"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      Markdown
                    </button>
                  </div>
                </div>
              )}

              {/* Expiration (Share tab only) */}
              {activeTab === "share" && !shareUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Link Expiration</label>
                  <div className="flex gap-2">
                    {[
                      { value: "1h", label: "1H" },
                      { value: "24h", label: "24H" },
                      { value: "7d", label: "7D" },
                      { value: "never", label: "Never" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setExpiresIn(option.value as ExpiresIn)}
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                          expiresIn === option.value
                            ? "bg-blue-600/20 border-blue-500 text-blue-400"
                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Privacy Options */}
              {(activeTab === "download" || (activeTab === "share" && !shareUrl)) && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Privacy Options</label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={maskPii}
                        onChange={(e) => setMaskPii(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                      />
                      <div>
                        <span className="text-sm text-white">Mask PII</span>
                        <p className="text-xs text-gray-500">Redact emails, phone numbers, IPs</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={maskSecrets}
                        onChange={(e) => setMaskSecrets(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                      />
                      <div>
                        <span className="text-sm text-white">Mask Secrets</span>
                        <p className="text-xs text-gray-500">Hide API keys, tokens, passwords</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideRawContent}
                        onChange={(e) => setHideRawContent(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                      />
                      <div>
                        <span className="text-sm text-white">Hide Raw Content</span>
                        <p className="text-xs text-gray-500">Don&apos;t include chunk text</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Action Button */}
              {(activeTab === "download" || !shareUrl) && (
                <button
                  onClick={activeTab === "download" ? handleDownload : handleShare}
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? (
                    <>
                      <SpinnerIcon className="w-4 h-4 animate-spin" />
                      {activeTab === "download" ? "Generating..." : "Creating..."}
                    </>
                  ) : activeTab === "download" ? (
                    <>
                      <DownloadIcon className="w-4 h-4" />
                      Download Bundle
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4" />
                      Create Share Link
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/50">
              <p className="text-xs text-gray-500 text-center">
                Debug bundles contain trace data with sensitive information automatically redacted.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DebugBundleExport;
