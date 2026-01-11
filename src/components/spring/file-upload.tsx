"use client";

import { useState, useRef, useCallback } from "react";

interface FileUploadProps {
  onClose: () => void;
  onFileAnalyzed?: (file: UploadedFile & { analysis?: AnalysisResult }) => void;
  conversationId?: string;
}

interface UploadedFile {
  id: string;
  filename: string;
  url: string;
  size_bytes: number;
  mime_type: string;
  status: string;
}

interface AnalysisResult {
  summary?: string;
  key_points?: string[];
  entities?: string[];
  sentiment?: string;
  extracted_text_preview?: string;
  metadata?: Record<string, unknown>;
}

const SUPPORTED_TYPES = [
  { extension: ".pdf", name: "PDF Documents" },
  { extension: ".docx", name: "Word Documents" },
  { extension: ".txt", name: "Text Files" },
  { extension: ".md", name: "Markdown" },
  { extension: ".png,.jpg,.jpeg,.gif,.webp", name: "Images" },
  { extension: ".csv", name: "CSV Files" },
];

export function FileUploadModal({ onClose, onFileAnalyzed, conversationId }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<{
    file: UploadedFile;
    analysis?: AnalysisResult;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    if (conversationId) {
      formData.append("conversation_id", conversationId);
    }
    formData.append("extract_entities", "true");
    formData.append("analyze_sentiment", "true");

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const res = await fetch("/api/spring/files", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setResult({
        file: data.file,
        analysis: data.analysis,
      });

      if (onFileAnalyzed) {
        onFileAnalyzed({
          ...data.file,
          analysis: data.analysis,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Upload & Analyze File</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {!result ? (
            <>
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${isDragging
                    ? "border-pink-500 bg-pink-50"
                    : file
                    ? "border-green-500 bg-green-50"
                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                  }
                `}
              >
                <input
                  ref={inputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.csv"
                  className="hidden"
                />

                {file ? (
                  <div className="space-y-2">
                    <FileIcon className="w-12 h-12 mx-auto text-green-500" />
                    <div className="font-medium text-gray-900">{file.name}</div>
                    <div className="text-sm text-gray-500">{formatFileSize(file.size)}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <UploadIcon className="w-12 h-12 mx-auto text-gray-400" />
                    <div className="font-medium text-gray-700">
                      Drop file here or click to browse
                    </div>
                    <div className="text-sm text-gray-500">
                      PDF, DOCX, TXT, Images, CSV (max 50MB)
                    </div>
                  </div>
                )}
              </div>

              {/* Supported Types */}
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_TYPES.map((type) => (
                  <span
                    key={type.extension}
                    className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600"
                  >
                    {type.name}
                  </span>
                ))}
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Analyzing...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          ) : (
            /* Analysis Results */
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckIcon className="w-5 h-5 text-green-500" />
                <div>
                  <div className="font-medium text-gray-900">{result.file.filename}</div>
                  <div className="text-sm text-gray-500">
                    Analysis completed successfully
                  </div>
                </div>
              </div>

              {/* Summary */}
              {result.analysis?.summary && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    {String(result.analysis.summary)}
                  </p>
                </div>
              )}

              {/* Key Points */}
              {result.analysis?.key_points && Array.isArray(result.analysis.key_points) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Key Points</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {result.analysis.key_points.map((point: string, i: number) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Entities */}
              {result.analysis?.entities && Array.isArray(result.analysis.entities) && result.analysis.entities.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Detected Entities</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.analysis.entities.map((entity: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
                      >
                        {entity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Text Preview */}
              {result.analysis?.extracted_text_preview && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Extracted Text Preview</h3>
                  <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap">
                    {String(result.analysis.extracted_text_preview)}...
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                file && !isUploading
                  ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isUploading ? "Analyzing..." : "Upload & Analyze"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
