"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { getErrorMessage } from "@/lib/ui-error";

// Icons
const ShareIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

const CopyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export interface ShareTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  traceId: string;
}

type ExpiresInOption = "1h" | "24h" | "7d" | "never";

export function ShareTraceModal({ isOpen, onClose, traceId }: ShareTraceModalProps) {
  const [expiresIn, setExpiresIn] = useState<ExpiresInOption>("7d");
  const [redactPii, setRedactPii] = useState(true);
  const [redactSecrets, setRedactSecrets] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createShareLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/traces/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: traceId,
          expires_in: expiresIn,
          redaction: {
            pii: redactPii,
            secrets: redactSecrets,
            raw_content: false,
          },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setShareUrl(data.share_url);
      } else {
        setError(getErrorMessage(data.error, "Failed to create share link"));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create share link"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (shareUrl) {
      const result = await copyToClipboard(shareUrl);
      if (result.success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleClose = () => {
    setShareUrl(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-gray-900 rounded-xl border border-szn-border shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Share Trace</h2>
          <button onClick={handleClose} className="text-szn-text-3 hover:text-white">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {shareUrl ? (
          <div className="space-y-4">
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-xs text-szn-text-2 mb-1">Share URL</div>
              <div className="flex items-center gap-2">
                <code className="text-sm text-szn-accent flex-1 truncate">
                  {shareUrl}
                </code>
                <button
                  onClick={handleCopyToClipboard}
                  className="p-1.5 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                >
                  {copied ? (
                    <CheckIcon className="w-4 h-4 text-green-400" />
                  ) : (
                    <CopyIcon className="w-4 h-4 text-szn-text-2" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-szn-text-2">
              {expiresIn === "never"
                ? "This link never expires."
                : `This link expires in ${expiresIn}.`}
            </p>
            <button
              onClick={handleClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Expiration */}
            <div>
              <label className="block text-sm text-szn-text-3 mb-2">
                Link Expiration
              </label>
              <div className="flex gap-2">
                {(["1h", "24h", "7d", "never"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setExpiresIn(option)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      expiresIn === option
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-szn-text-3 hover:text-white"
                    }`}
                  >
                    {option === "never" ? "Never" : option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Redaction Options */}
            <div>
              <label className="block text-sm text-szn-text-3 mb-2">
                Privacy Options
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={redactPii}
                    onChange={(e) => setRedactPii(e.target.checked)}
                    className="w-4 h-4 rounded border-szn-border bg-gray-800 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-szn-text-2">
                    Mask PII (emails, phones, IPs)
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={redactSecrets}
                    onChange={(e) => setRedactSecrets(e.target.checked)}
                    className="w-4 h-4 rounded border-szn-border bg-gray-800 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-szn-text-2">
                    Mask API keys and secrets
                  </span>
                </label>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              onClick={createShareLink}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                <>
                  <ShareIcon className="w-4 h-4" />
                  Create Share Link
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export ShareIcon for use in other components
export { ShareIcon };
