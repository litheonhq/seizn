"use client";

import { useState, useEffect, useCallback } from "react";
import type { TranslationModel, TrainingMetrics } from "@/lib/ecl/types";

// ============================================
// Types
// ============================================

export interface TrainingProgressProps {
  modelId: string;
  apiKey?: string;
  onComplete?: (model: TranslationModel, metrics: TrainingMetrics) => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
  pollingInterval?: number;
}

interface TrainingState {
  status: "idle" | "adding_pairs" | "training" | "completed" | "failed";
  progress: number;
  message: string;
  metrics?: TrainingMetrics;
  error?: string;
}

// ============================================
// Icons
// ============================================

function CheckIcon() {
  return (
    <svg
      className="w-5 h-5 text-green-500"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-5 h-5 animate-spin text-blue-500" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ============================================
// Progress Bar
// ============================================

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

// ============================================
// Metrics Display
// ============================================

function MetricsDisplay({ metrics }: { metrics: TrainingMetrics }) {
  const formatValue = (value: number, decimals: number = 4) => {
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-2 gap-3 mt-4 p-3 bg-gray-50 rounded-lg">
      <div>
        <p className="text-xs text-gray-500">RMSE</p>
        <p className="text-sm font-medium text-gray-900">
          {formatValue(metrics.rmse)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">R-squared</p>
        <p className="text-sm font-medium text-gray-900">
          {metrics.r2 !== undefined ? formatValue(metrics.r2, 3) : "N/A"}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Cosine Similarity</p>
        <p className="text-sm font-medium text-gray-900">
          {formatPercent(metrics.cosineSimilarityMean)} (SD:{" "}
          {formatValue(metrics.cosineSimilarityStd, 3)})
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Training Time</p>
        <p className="text-sm font-medium text-gray-900">
          {metrics.trainingTimeMs < 1000
            ? `${metrics.trainingTimeMs}ms`
            : `${(metrics.trainingTimeMs / 1000).toFixed(1)}s`}
        </p>
      </div>
      <div className="col-span-2">
        <p className="text-xs text-gray-500">Data Split</p>
        <p className="text-sm font-medium text-gray-900">
          {metrics.trainingPairs.toLocaleString()} training /{" "}
          {metrics.validationPairs.toLocaleString()} validation
        </p>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function TrainingProgress({
  modelId,
  apiKey,
  onComplete,
  onError,
  autoStart = false,
  pollingInterval = 2000,
}: TrainingProgressProps) {
  const [state, setState] = useState<TrainingState>({
    status: "idle",
    progress: 0,
    message: "Ready to start training",
  });

  const [modelStatus, setModelStatus] = useState<string>("pending");
  const [pairCount, setPairCount] = useState<number>(0);

  const headers = useCallback(() => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      h["x-api-key"] = apiKey;
    }
    return h;
  }, [apiKey]);

  // Fetch model status and pair count
  const fetchStatus = useCallback(async () => {
    try {
      // Get model info
      const modelRes = await fetch(`/api/ecl/models?id=${modelId}`, {
        headers: headers(),
      });

      if (modelRes.ok) {
        const { models } = await modelRes.json();
        if (models && models.length > 0) {
          setModelStatus(models[0].status);

          // If training completed or failed, update state
          if (models[0].status === "ready" && state.status === "training") {
            setState({
              status: "completed",
              progress: 100,
              message: "Training completed successfully!",
              metrics: models[0].metrics,
            });
            onComplete?.(models[0], models[0].metrics);
          } else if (
            models[0].status === "failed" &&
            state.status === "training"
          ) {
            setState({
              status: "failed",
              progress: 0,
              message: "Training failed",
              error: models[0].errorMessage || "Unknown error",
            });
            onError?.(models[0].errorMessage || "Training failed");
          }
        }
      }

      // Get pair count
      const pairRes = await fetch(`/api/ecl/train?model_id=${modelId}`, {
        headers: headers(),
      });

      if (pairRes.ok) {
        const { stats } = await pairRes.json();
        setPairCount(stats?.total_pairs || 0);
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, [modelId, headers, state.status, onComplete, onError]);

  // Poll for status during training
  useEffect(() => {
    if (state.status === "training") {
      const interval = setInterval(fetchStatus, pollingInterval);
      return () => clearInterval(interval);
    }
  }, [state.status, fetchStatus, pollingInterval]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && pairCount >= 10 && modelStatus === "pending") {
      startTraining();
    }
  }, [autoStart, pairCount, modelStatus]);

  const startTraining = async () => {
    if (pairCount < 10) {
      setState({
        status: "failed",
        progress: 0,
        message: "Insufficient training pairs",
        error: `Need at least 10 pairs, have ${pairCount}`,
      });
      return;
    }

    setState({
      status: "training",
      progress: 10,
      message: "Starting training...",
    });

    try {
      const response = await fetch("/api/ecl/train?action=start", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ modelId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setState({
          status: "failed",
          progress: 0,
          message: data.error?.message || "Training failed to start",
          error: data.error?.hint,
        });
        onError?.(data.error?.message || "Training failed");
        return;
      }

      setState({
        status: "completed",
        progress: 100,
        message: "Training completed successfully!",
        metrics: data.metrics,
      });

      // Fetch updated model
      await fetchStatus();
    } catch (err) {
      setState({
        status: "failed",
        progress: 0,
        message: "Training request failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      onError?.(err instanceof Error ? err.message : "Training failed");
    }
  };

  // Status indicator
  const StatusIcon = () => {
    switch (state.status) {
      case "completed":
        return <CheckIcon />;
      case "failed":
        return <XCircleIcon />;
      case "training":
        return <SpinnerIcon />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Training Status</h3>
        <div className="flex items-center gap-2">
          <StatusIcon />
          <span
            className={`text-sm font-medium ${
              state.status === "completed"
                ? "text-green-600"
                : state.status === "failed"
                  ? "text-red-600"
                  : state.status === "training"
                    ? "text-blue-600"
                    : "text-gray-600"
            }`}
          >
            {state.status.charAt(0).toUpperCase() + state.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Progress */}
      {state.status === "training" && (
        <div className="space-y-2">
          <ProgressBar progress={state.progress} />
          <p className="text-xs text-gray-500 text-center">{state.message}</p>
        </div>
      )}

      {/* Pair Count */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs text-gray-500">Training Pairs</p>
          <p className="text-lg font-semibold text-gray-900">
            {pairCount.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Minimum Required</p>
          <p
            className={`text-lg font-semibold ${
              pairCount >= 10 ? "text-green-600" : "text-red-600"
            }`}
          >
            10
          </p>
        </div>
      </div>

      {/* Start Button */}
      {state.status === "idle" && modelStatus !== "training" && (
        <button
          onClick={startTraining}
          disabled={pairCount < 10}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            pairCount >= 10
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          <PlayIcon />
          Start Training
        </button>
      )}

      {/* Error Message */}
      {state.error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{state.message}</p>
          {state.error && (
            <p className="text-xs text-red-500 mt-1">{state.error}</p>
          )}
        </div>
      )}

      {/* Success Message */}
      {state.status === "completed" && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700">{state.message}</p>
        </div>
      )}

      {/* Metrics */}
      {state.metrics && <MetricsDisplay metrics={state.metrics} />}

      {/* Help Text */}
      {state.status === "idle" && pairCount < 10 && (
        <p className="text-xs text-gray-500 text-center">
          Add more training pairs to enable training. Each pair should include
          the same text embedded with both source and target models.
        </p>
      )}
    </div>
  );
}

export default TrainingProgress;
