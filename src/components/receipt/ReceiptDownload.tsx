"use client";

import { useState, useCallback } from "react";

// ============================================
// Types
// ============================================

export interface ReceiptDownloadProps {
  traceId: string;
  receiptId?: string;
  className?: string;
  onDownloadStart?: () => void;
  onDownloadComplete?: (format: "json" | "pdf") => void;
  onError?: (error: Error) => void;
}

// ============================================
// Component
// ============================================

/**
 * ReceiptDownload - Download button component for query receipts
 * Supports JSON and PDF formats with loading states
 */
export function ReceiptDownload({
  traceId,
  receiptId,
  className = "",
  onDownloadStart,
  onDownloadComplete,
  onError,
}: ReceiptDownloadProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"json" | "pdf" | null>(null);

  const handleDownload = useCallback(
    async (format: "json" | "pdf") => {
      if (isDownloading) return;

      setIsDownloading(true);
      setDownloadFormat(format);
      onDownloadStart?.();

      try {
        const response = await fetch(
          `/api/retrieval/traces/${traceId}/receipt/download?format=${format}`,
          {
            method: "GET",
            headers: {
              Accept: format === "json" ? "application/json" : "application/pdf",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        // Get filename from Content-Disposition header or generate one
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = `receipt-${receiptId || traceId}.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="([^"]+)"/);
          if (match) {
            filename = match[1];
          }
        }

        // Create blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        onDownloadComplete?.(format);
      } catch (error) {
        console.error("Receipt download error:", error);
        onError?.(error instanceof Error ? error : new Error("Download failed"));
      } finally {
        setIsDownloading(false);
        setDownloadFormat(null);
      }
    },
    [traceId, receiptId, isDownloading, onDownloadStart, onDownloadComplete, onError]
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* JSON Download */}
      <button
        onClick={() => handleDownload("json")}
        disabled={isDownloading}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all
          flex items-center gap-2
          ${
            isDownloading && downloadFormat === "json"
              ? "bg-emerald-600 text-white cursor-wait"
              : "bg-gray-800 hover:bg-gray-700 text-gray-300"
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isDownloading && downloadFormat === "json" ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Downloading...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>JSON</span>
            <span className="text-xs text-gray-500">(.json)</span>
          </>
        )}
      </button>

      {/* PDF Download */}
      <button
        onClick={() => handleDownload("pdf")}
        disabled={isDownloading}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all
          flex items-center gap-2
          ${
            isDownloading && downloadFormat === "pdf"
              ? "bg-emerald-600 text-white cursor-wait"
              : "bg-gray-800 hover:bg-gray-700 text-gray-300"
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isDownloading && downloadFormat === "pdf" ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Downloading...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span>PDF</span>
            <span className="text-xs text-gray-500">(.pdf)</span>
          </>
        )}
      </button>
    </div>
  );
}

// ============================================
// Inline Download Button (Compact)
// ============================================

export interface InlineReceiptDownloadProps {
  traceId: string;
  format: "json" | "pdf";
  className?: string;
}

export function InlineReceiptDownload({
  traceId,
  format,
  className = "",
}: InlineReceiptDownloadProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);

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
    } catch (error) {
      console.error("Receipt download error:", error);
    } finally {
      setIsDownloading(false);
    }
  }, [traceId, format, isDownloading]);

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className={`
        p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      title={`Download as ${format.toUpperCase()}`}
    >
      {isDownloading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      )}
    </button>
  );
}

export default ReceiptDownload;
