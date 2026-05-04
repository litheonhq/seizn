"use client";

import { useState } from "react";
import type {
  SuggestedSource,
  ActionType,
} from "@/lib/knowledge-gap/types";

// =============================================================================
// Types
// =============================================================================

interface FillActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  gapId: string;
  suggestedSource?: SuggestedSource;
  onExecute?: (result: ActionExecuteResult) => void;
}

interface ActionExecuteResult {
  success: boolean;
  action?: {
    id: string;
    actionType: ActionType;
    status: string;
  };
  result?: {
    resolved: boolean;
    documentsIndexed?: number;
    notes?: string;
  };
  error?: string;
}

// =============================================================================
// Component
// =============================================================================

export function FillActionModal({
  isOpen,
  onClose,
  gapId,
  suggestedSource,
  onExecute,
}: FillActionModalProps) {
  const [actionType, setActionType] = useState<ActionType>(
    suggestedSource?.sourceType === "web_url" ? "ingest_url" : "ingest_file"
  );
  const [url, setUrl] = useState(
    suggestedSource?.identifier.startsWith("http")
      ? suggestedSource.identifier
      : ""
  );
  const [fileName, setFileName] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState("http");
  const [documentIds, setDocumentIds] = useState("");
  const [reason, setReason] = useState("");
  const [executeImmediately, setExecuteImmediately] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let actionParams: Record<string, unknown> = {};

      switch (actionType) {
        case "ingest_url":
          if (!url) throw new Error("URL is required");
          actionParams = { url };
          break;
        case "ingest_file":
          if (!fileName) throw new Error("File name is required");
          actionParams = { fileName };
          break;
        case "connect_source":
          if (!sourceName) throw new Error("Source name is required");
          actionParams = { name: sourceName, sourceType, config: {} };
          break;
        case "request_access":
          if (!documentIds) throw new Error("Document IDs are required");
          actionParams = {
            documentIds: documentIds.split(",").map((id) => id.trim()),
            requestReason: reason || "Requested via gap filler",
          };
          break;
        case "ignore":
          if (!reason) throw new Error("Reason is required");
          actionParams = { reason };
          break;
      }

      const response = await fetch(`/api/knowledge-gaps/${gapId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: actionType,
          action_params: actionParams,
          execute: executeImmediately,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to create action");
      }

      onExecute?.({
        success: true,
        action: data.action,
        result: data.result,
      });

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      onExecute?.({ success: false, error: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Fill Knowledge Gap
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Choose an action to fill this knowledge gap
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {/* Action Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Action Type
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ingest_url">Ingest URL</option>
                <option value="ingest_file">Upload File</option>
                <option value="connect_source">Connect Source</option>
                <option value="request_access">Request Access</option>
                <option value="ignore">Ignore / Dismiss</option>
              </select>
            </div>

            {/* Dynamic Fields */}
            {actionType === "ingest_url" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL to Ingest
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/docs"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The URL will be crawled and its content indexed
                </p>
              </div>
            )}

            {actionType === "ingest_file" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File Name
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="document.pdf"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You will be prompted to upload the file
                </p>
              </div>
            )}

            {actionType === "connect_source" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Name
                  </label>
                  <input
                    type="text"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="My API Source"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Type
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="http">HTTP API</option>
                    <option value="agent">Agent</option>
                    <option value="database">Database</option>
                  </select>
                </div>
              </>
            )}

            {actionType === "request_access" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document IDs (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={documentIds}
                    onChange={(e) => setDocumentIds(e.target.value)}
                    placeholder="doc-123, doc-456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Access
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why you need access..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                  />
                </div>
              </>
            )}

            {actionType === "ignore" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Ignoring
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this gap should be ignored..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                />
              </div>
            )}

            {/* Execute Immediately */}
            {actionType !== "ignore" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={executeImmediately}
                  onChange={(e) => setExecuteImmediately(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Execute immediately
                </span>
              </label>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-lg text-[var(--signal-conflict-ink)] text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Execute Action"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FillActionModal;
