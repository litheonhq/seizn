"use client";

import { useState, useEffect, useCallback } from "react";
import { ReceiptDetail } from "@/components/receipt/ReceiptDetail";
import { ReceiptDownload } from "@/components/receipt/ReceiptDownload";
import type { QueryReceipt } from "@/lib/retrieval/receipt";

// ============================================
// Types
// ============================================

export interface ReceiptTabProps {
  traceId: string;
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * ReceiptTab - DevTools tab component for viewing and downloading query receipts
 */
export function ReceiptTab({ traceId, className = "" }: ReceiptTabProps) {
  const [receipt, setReceipt] = useState<QueryReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"detail" | "raw">("detail");

  // Fetch receipt
  const fetchReceipt = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/retrieval/traces/${traceId}/receipt`);
      const data = await response.json();

      if (data.success) {
        setReceipt(data.receipt);
      } else {
        setError(data.error || "Failed to fetch receipt");
      }
    } catch (err) {
      console.error("Failed to fetch receipt:", err);
      setError("Failed to fetch receipt");
    } finally {
      setLoading(false);
    }
  }, [traceId]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  const handleDownload = useCallback(
    async (format: "json" | "pdf") => {
      try {
        const response = await fetch(
          `/api/retrieval/traces/${traceId}/receipt/download?format=${format}`
        );

        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = `receipt-${traceId}.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="([^"]+)"/);
          if (match) {
            filename = match[1];
          }
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Download failed:", err);
      }
    },
    [traceId]
  );

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-12 ${className}`}>
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-400">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-red-400">{error}</span>
          </div>
          <button
            onClick={fetchReceipt}
            className="mt-3 text-sm text-red-400 hover:text-red-300 underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-gray-800/50 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 text-gray-600 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
            />
          </svg>
          <p className="text-gray-400">No receipt available for this trace</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("detail")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              viewMode === "detail"
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Detailed View
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              viewMode === "raw"
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Raw JSON
          </button>
        </div>
        <ReceiptDownload traceId={traceId} receiptId={receipt.receipt_id} />
      </div>

      {/* Receipt Content */}
      {viewMode === "detail" ? (
        <div className="px-4 pb-4">
          <ReceiptDetail receipt={receipt} onDownload={handleDownload} />
        </div>
      ) : (
        <div className="px-4 pb-4">
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-400">Raw Receipt JSON</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
                }}
                className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </button>
            </div>
            <pre className="p-4 text-sm text-gray-300 overflow-x-auto max-h-[600px] overflow-y-auto">
              <code>{JSON.stringify(receipt, null, 2)}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReceiptTab;
