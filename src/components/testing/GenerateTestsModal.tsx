'use client';

/**
 * Generate Tests Modal Component
 *
 * Modal for auto-generating test cases from documents
 */

import { useState, useEffect } from 'react';

interface Document {
  id: string;
  title?: string;
  content_preview?: string;
}

interface GenerateTestsModalProps {
  apiKey: string;
  suiteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

export function GenerateTestsModal({
  apiKey,
  suiteId,
  isOpen,
  onClose,
  onSuccess,
}: GenerateTestsModalProps) {
  const [step, setStep] = useState<'config' | 'generating' | 'done'>('config');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Generation options
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState({
    positive: true,
    negative: true,
    edge_case: false,
  });
  const [model, setModel] = useState<'haiku' | 'sonnet'>('haiku');

  // Results
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    generated: number;
    saved: number;
    invalid: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('config');
      setResult(null);
      // Reset selections when modal opens
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setStep('generating');
    setGenerating(true);

    try {
      const selectedTypes = Object.entries(types)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await fetch(`/api/testing/suites/${suiteId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          doc_ids: selectedDocs.length > 0 ? selectedDocs : undefined,
          count,
          types: selectedTypes,
          model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          generated: 0,
          saved: 0,
          invalid: 0,
          error: data.error?.message || 'Generation failed',
        });
      } else {
        setResult({
          generated: data.data.generated,
          saved: data.data.saved,
          invalid: data.data.invalid,
        });
      }

      setStep('done');
    } catch (err) {
      setResult({
        generated: 0,
        saved: 0,
        invalid: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      setStep('done');
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    if (result?.saved && result.saved > 0) {
      onSuccess?.(result.saved);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={step !== 'generating' ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Generate Test Cases</h2>
          <p className="text-sm text-gray-500 mt-1">
            Auto-generate retrieval test cases using AI
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {step === 'config' && (
            <div className="space-y-6">
              {/* Number of Tests */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Tests
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={count}
                    onChange={(e) => setCount(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-medium">{count}</span>
                </div>
              </div>

              {/* Test Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Types
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={types.positive}
                      onChange={(e) => setTypes({ ...types, positive: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Positive (should find answer)</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={types.negative}
                      onChange={(e) => setTypes({ ...types, negative: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Negative (should not find answer)</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={types.edge_case}
                      onChange={(e) => setTypes({ ...types, edge_case: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Edge Cases (tricky scenarios)</span>
                  </label>
                </div>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI Model
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="model"
                      value="haiku"
                      checked={model === 'haiku'}
                      onChange={() => setModel('haiku')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Haiku (faster)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="model"
                      value="sonnet"
                      checked={model === 'sonnet'}
                      onChange={() => setModel('sonnet')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Sonnet (higher quality)</span>
                  </label>
                </div>
              </div>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Test cases will be generated from documents in this suite&apos;s collection.
                  The AI will create realistic user queries based on document content.
                </p>
              </div>
            </div>
          )}

          {step === 'generating' && (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
              <p className="mt-4 text-gray-600">Generating test cases...</p>
              <p className="text-sm text-gray-400 mt-1">This may take a minute</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="py-8 text-center">
              {result.error ? (
                <>
                  <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">Generation Failed</h3>
                  <p className="mt-2 text-sm text-red-600">{result.error}</p>
                </>
              ) : (
                <>
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">Tests Generated!</h3>
                  <div className="mt-4 space-y-1 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">{result.saved}</span> test cases saved
                    </p>
                    {result.invalid > 0 && (
                      <p className="text-yellow-600">
                        {result.invalid} invalid tests were skipped
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {step === 'config' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!Object.values(types).some((v) => v)}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-md"
              >
                Generate Tests
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GenerateTestsModal;
