"use client";

import { useState, useCallback } from "react";
import type { ExpiresIn, RedactionProfile } from "@/lib/sharing/types";

interface ShareTraceModalProps {
  traceId: string;
  onClose: () => void;
  onShareCreated?: (shareUrl: string) => void;
}

interface ExistingShare {
  id: string;
  shareUrl: string;
  token: string;
  shortId: string;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
  isExpired: boolean;
  redactionProfile: RedactionProfile;
}

export function ShareTraceModal({
  traceId,
  onClose,
  onShareCreated,
}: ShareTraceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [existingShares, setExistingShares] = useState<ExistingShare[]>([]);
  const [copied, setCopied] = useState(false);

  // Options
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("24h");
  const [maskPii, setMaskPii] = useState(true);
  const [maskSecrets, setMaskSecrets] = useState(true);
  const [hideRawContent, setHideRawContent] = useState(false);

  // Fetch existing shares on mount
  const fetchExistingShares = useCallback(async () => {
    try {
      const response = await fetch(`/api/retrieval/traces/${traceId}/share`, {
        headers: {
          "x-api-key": localStorage.getItem("seizn_api_key") || "",
        },
      });
      const data = await response.json();
      if (data.success && data.shares) {
        setExistingShares(data.shares);
      }
    } catch (err) {
      console.error("Failed to fetch existing shares:", err);
    }
  }, [traceId]);

  // Initial fetch
  useState(() => {
    fetchExistingShares();
  });

  const handleCreateShare = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/retrieval/traces/${traceId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": localStorage.getItem("seizn_api_key") || "",
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
      onShareCreated?.(data.shareUrl);
      fetchExistingShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteShare = async (shareId: string) => {
    try {
      await fetch(
        `/api/retrieval/traces/${traceId}/share?shareId=${shareId}`,
        {
          method: "DELETE",
          headers: {
            "x-api-key": localStorage.getItem("seizn_api_key") || "",
          },
        }
      );
      fetchExistingShares();
    } catch (err) {
      console.error("Failed to delete share:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-szn-card rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-szn-border">
          <h2 className="text-xl font-semibold text-szn-text-1">Share Trace</h2>
          <button
            onClick={onClose}
            className="text-szn-text-3 hover:text-szn-text-2"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success State */}
          {shareUrl && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium">Share link created!</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-szn-card border border-szn-border rounded-lg text-sm font-mono"
                />
                <button
                  onClick={() => handleCopy(shareUrl)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
              {error}
            </div>
          )}

          {/* Options */}
          {!shareUrl && (
            <>
              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-2">
                  Expiration
                </label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value as ExpiresIn)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="never">Never expires</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-szn-text-1 mb-3">
                  Privacy Settings
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskPii}
                      onChange={(e) => setMaskPii(e.target.checked)}
                      className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                    />
                    <div>
                      <span className="text-sm text-szn-text-1">
                        Mask PII (emails, phones, etc.)
                      </span>
                      <p className="text-xs text-szn-text-2">
                        Automatically redact personal information
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskSecrets}
                      onChange={(e) => setMaskSecrets(e.target.checked)}
                      className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                    />
                    <div>
                      <span className="text-sm text-szn-text-1">
                        Mask API Keys & Secrets
                      </span>
                      <p className="text-xs text-szn-text-2">
                        Hide API keys, tokens, and passwords
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideRawContent}
                      onChange={(e) => setHideRawContent(e.target.checked)}
                      className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                    />
                    <div>
                      <span className="text-sm text-szn-text-1">
                        Hide Raw Content
                      </span>
                      <p className="text-xs text-szn-text-2">
                        Don&apos;t show original chunk text
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <button
                onClick={handleCreateShare}
                disabled={loading}
                className="w-full py-3 bg-szn-accent text-white rounded-xl hover:bg-szn-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  "Create Share Link"
                )}
              </button>
            </>
          )}

          {/* Existing Shares */}
          {existingShares.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-szn-text-1 mb-3">
                Existing Share Links
              </h3>
              <div className="space-y-2">
                {existingShares.map((share) => (
                  <div
                    key={share.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      share.isExpired
                        ? "bg-szn-bg border-szn-border"
                        : "bg-szn-card border-szn-border"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-szn-text-2 truncate">
                          {share.shareUrl}
                        </span>
                        {share.isExpired && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-szn-text-2">
                        <span>{share.viewCount} views</span>
                        <span>
                          Created{" "}
                          {new Date(share.createdAt).toLocaleDateString()}
                        </span>
                        {share.expiresAt && (
                          <span>
                            Expires{" "}
                            {new Date(share.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {!share.isExpired && (
                        <button
                          onClick={() => handleCopy(share.shareUrl)}
                          className="p-2 text-szn-text-3 hover:text-szn-text-2"
                          title="Copy link"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteShare(share.id)}
                        className="p-2 text-red-400 hover:text-red-600"
                        title="Delete share"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-szn-border bg-szn-bg rounded-b-2xl">
          <p className="text-xs text-szn-text-2 text-center">
            Shared traces are automatically redacted to protect sensitive
            information. Anyone with the link can view the trace.
          </p>
        </div>
      </div>
    </div>
  );
}
