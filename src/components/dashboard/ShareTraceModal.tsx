"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import type { ExpiresIn, RedactionProfile } from "@/lib/sharing/types";
import { formatDate } from "@/lib/format-date";
import { getErrorMessage } from "@/lib/ui-error";

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
  const requestGuardRef = useRef(createLatestRequestGuard());
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
    const request = requestGuardRef.current.begin();

    try {
      const response = await csrfFetch(`/api/retrieval/traces/${traceId}/share`, {
        signal: request.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(data?.error, "Failed to fetch existing shares"));
      }
      if (requestGuardRef.current.isCurrent(request.id) && data.success && data.shares) {
        setExistingShares(data.shares);
      }
    } catch (err) {
      if (isAbortError(err) || !requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      setError(getErrorMessage(err, "Failed to fetch existing shares"));
    } finally {
      requestGuardRef.current.finish(request.id);
    }
  }, [traceId]);

  // Initial fetch
  useEffect(() => {
    void fetchExistingShares();
  }, [fetchExistingShares]);

  useEffect(() => () => requestGuardRef.current.cancel(), []);

  const handleCreateShare = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await csrfFetch(`/api/retrieval/traces/${traceId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      void fetchExistingShares();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create share link"));
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
      const response = await csrfFetch(
        `/api/retrieval/traces/${traceId}/share?shareId=${encodeURIComponent(shareId)}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(getErrorMessage(data?.error, "Failed to delete share"));
      }
      void fetchExistingShares();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete share"));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="dashboard-share-trace-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-[var(--ink-0)] rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--ink-200)]">
          <h2 id="dashboard-share-trace-title" className="text-xl font-semibold text-[var(--ink-900)]">Share Trace</h2>
          <button
            onClick={onClose}
            className="text-[var(--ink-500)] hover:text-[var(--ink-600)]"
            aria-label="Close"
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
            <div className="bg-[var(--signal-canon-soft)] border border-[var(--signal-canon)] rounded-xl p-4">
              <div className="flex items-center gap-2 text-[var(--signal-canon-ink)] mb-2">
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
                <input aria-label="Share URL"
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-lg text-sm font-mono"
                />
                <button
                  onClick={() => handleCopy(shareUrl)}
                  className="px-4 py-2 bg-[var(--signal-canon)] text-white rounded-lg hover:bg-[var(--signal-canon)] text-sm font-medium"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-xl p-4 text-[var(--signal-conflict-ink)]">
              {error}
            </div>
          )}

          {/* Options */}
          {!shareUrl && (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--ink-900)] mb-2">
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
                <label className="block text-sm font-medium text-[var(--ink-900)] mb-3">
                  Privacy Settings
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input aria-label="Mask Pii"
                      type="checkbox"
                      checked={maskPii}
                      onChange={(e) => setMaskPii(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--ink-200)] text-[var(--ink-900)] focus:ring-[var(--ink-900)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--ink-900)]">
                        Mask PII (emails, phones, etc.)
                      </span>
                      <p className="text-xs text-[var(--ink-600)]">
                        Automatically redact personal information
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input aria-label="Mask Secrets"
                      type="checkbox"
                      checked={maskSecrets}
                      onChange={(e) => setMaskSecrets(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--ink-200)] text-[var(--ink-900)] focus:ring-[var(--ink-900)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--ink-900)]">
                        Mask API Keys & Secrets
                      </span>
                      <p className="text-xs text-[var(--ink-600)]">
                        Hide API keys, tokens, and passwords
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input aria-label="Hide Raw Content"
                      type="checkbox"
                      checked={hideRawContent}
                      onChange={(e) => setHideRawContent(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--ink-200)] text-[var(--ink-900)] focus:ring-[var(--ink-900)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--ink-900)]">
                        Hide Raw Content
                      </span>
                      <p className="text-xs text-[var(--ink-600)]">
                        Don&apos;t show original chunk text
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <button
                onClick={handleCreateShare}
                disabled={loading}
                className="w-full py-3 bg-[var(--ink-900)] text-white rounded-xl hover:bg-[var(--ink-900)]/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
              <h3 className="text-sm font-medium text-[var(--ink-900)] mb-3">
                Existing Share Links
              </h3>
              <div className="space-y-2">
                {existingShares.map((share) => (
                  <div
                    key={share.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      share.isExpired
                        ? "bg-[var(--ink-50)] border-[var(--ink-200)]"
                        : "bg-[var(--ink-0)] border-[var(--ink-200)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-[var(--ink-600)] truncate">
                          {share.shareUrl}
                        </span>
                        {share.isExpired && (
                          <span className="px-2 py-0.5 text-xs bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] rounded">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-600)]">
                        <span>{share.viewCount} views</span>
                        <span>
                          Created{" "}
                          {formatDate(share.createdAt)}
                        </span>
                        {share.expiresAt && (
                          <span>
                            Expires{" "}
                            {formatDate(share.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {!share.isExpired && (
                        <button
                          onClick={() => handleCopy(share.shareUrl)}
                          className="p-2 text-[var(--ink-500)] hover:text-[var(--ink-600)]"
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
                        className="p-2 text-[var(--signal-conflict-soft)] hover:text-[var(--signal-conflict-ink)]"
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
        <div className="p-6 border-t border-[var(--ink-200)] bg-[var(--ink-50)] rounded-b-2xl">
          <p className="text-xs text-[var(--ink-600)] text-center">
            Shared traces are automatically redacted to protect sensitive
            information. Anyone with the link can view the trace.
          </p>
        </div>
      </div>
    </div>
  );
}
