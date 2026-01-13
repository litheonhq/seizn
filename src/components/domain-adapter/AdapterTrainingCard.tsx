"use client";

import { useState, useEffect } from "react";

// =============================================================================
// Types
// =============================================================================

interface TrainingRun {
  id: string;
  adapter_id: string;
  status: "pending" | "training" | "completed" | "failed" | "cancelled";
  config: {
    rank: number;
    scale: number;
    epochs: number;
    batch_size: number;
    learning_rate: number;
    loss_margin: number;
  };
  progress: {
    current_epoch: number;
    total_epochs: number;
    current_step: number;
    total_steps: number;
  };
  metrics: {
    train_loss: number[];
    validation_loss: number[];
    mrr: number[];
    ndcg: number[];
  };
  final_mrr?: number;
  final_ndcg?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface AdapterTrainingCardProps {
  adapterId: string;
  adapterName: string;
  currentMrr?: number;
  onTrainingComplete?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function AdapterTrainingCard({
  adapterId,
  adapterName,
  currentMrr,
  onTrainingComplete,
}: AdapterTrainingCardProps) {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);

  // Training config
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(32);
  const [learningRate, setLearningRate] = useState(0.001);

  const fetchRuns = async () => {
    try {
      const response = await fetch(`/api/adapters/${adapterId}/train?limit=5`);
      if (!response.ok) throw new Error("Failed to fetch training runs");

      const data = await response.json();
      setRuns(data.runs);

      // Check if currently training
      const activeRun = data.runs.find(
        (r: TrainingRun) => r.status === "training" || r.status === "pending"
      );
      setIsTraining(!!activeRun);

      // Notify on completion
      if (
        data.runs[0]?.status === "completed" &&
        runs[0]?.status === "training"
      ) {
        onTrainingComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    // Poll while training
    const interval = setInterval(() => {
      if (isTraining) fetchRuns();
    }, 5000);

    return () => clearInterval(interval);
  }, [adapterId, isTraining]);

  const handleStartTraining = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/adapters/${adapterId}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epochs,
          batch_size: batchSize,
          learning_rate: learningRate,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start training");
      }

      setIsTraining(true);
      fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start training");
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  const latestRun = runs[0];
  const hasActiveRun = latestRun?.status === "training" || latestRun?.status === "pending";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Training</h3>
        <p className="text-sm text-gray-500">{adapterName}</p>
      </div>

      {/* Current Performance */}
      {currentMrr !== undefined && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Current MRR</span>
            <span className="text-lg font-bold text-green-600">
              {(currentMrr * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Active Training Progress */}
      {hasActiveRun && <TrainingProgress run={latestRun} />}

      {/* Training Config */}
      {!hasActiveRun && (
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Epochs
            </label>
            <input
              type="number"
              value={epochs}
              onChange={(e) => setEpochs(parseInt(e.target.value) || 10)}
              min={1}
              max={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch Size
            </label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 32)}
              min={1}
              max={256}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Learning Rate
            </label>
            <input
              type="number"
              value={learningRate}
              onChange={(e) => setLearningRate(parseFloat(e.target.value) || 0.001)}
              min={0.0001}
              max={0.1}
              step={0.0001}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={handleStartTraining}
            disabled={isTraining}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTraining ? "Training in Progress..." : "Start Training"}
          </button>
        </div>
      )}

      {/* Training History */}
      {runs.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Runs</h4>
          <div className="space-y-2">
            {runs.slice(0, 5).map((run) => (
              <RunHistoryItem key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function TrainingProgress({ run }: { run: TrainingRun }) {
  const progress = run.progress;
  const percentComplete =
    progress.total_steps > 0
      ? (progress.current_step / progress.total_steps) * 100
      : 0;

  const latestLoss = run.metrics.train_loss[run.metrics.train_loss.length - 1];
  const latestMrr = run.metrics.mrr[run.metrics.mrr.length - 1];

  return (
    <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-blue-700">Training in Progress</span>
        <span className="text-sm text-blue-600">
          Epoch {progress.current_epoch}/{progress.total_epochs}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-blue-200 rounded-full h-2 mb-3">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-blue-600">Loss:</span>{" "}
          <span className="font-medium">{latestLoss?.toFixed(4) ?? "-"}</span>
        </div>
        <div>
          <span className="text-blue-600">MRR:</span>{" "}
          <span className="font-medium">
            {latestMrr ? `${(latestMrr * 100).toFixed(1)}%` : "-"}
          </span>
        </div>
      </div>
    </div>
  );
}

function RunHistoryItem({ run }: { run: TrainingRun }) {
  const statusConfig = {
    pending: { color: "bg-gray-100 text-gray-700", label: "Pending" },
    training: { color: "bg-blue-100 text-blue-700", label: "Training" },
    completed: { color: "bg-green-100 text-green-700", label: "Completed" },
    failed: { color: "bg-red-100 text-red-700", label: "Failed" },
    cancelled: { color: "bg-gray-100 text-gray-700", label: "Cancelled" },
  };

  const config = statusConfig[run.status];

  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${config.color}`}>
          {config.label}
        </span>
        <span className="text-xs text-gray-500">
          {new Date(run.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="text-sm">
        {run.final_mrr ? (
          <span className="font-medium text-green-600">
            MRR: {(run.final_mrr * 100).toFixed(1)}%
          </span>
        ) : run.error ? (
          <span className="text-red-500 text-xs truncate max-w-[150px]">
            {run.error}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="h-5 w-24 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
      <div className="px-6 py-4 space-y-4">
        <div className="h-10 w-full bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default AdapterTrainingCard;
