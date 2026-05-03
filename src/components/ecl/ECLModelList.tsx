"use client";

import { useState, useEffect, useCallback } from "react";
import type { TranslationModel } from "@/lib/ecl/types";
import { formatDate } from "@/lib/format-date";

// ============================================
// Types
// ============================================

export interface ECLModelListProps {
  apiKey?: string;
  onSelectModel?: (model: TranslationModel) => void;
  onDeleteModel?: (modelId: string) => void;
  onCreateNew?: () => void;
  selectedModelId?: string;
  showActions?: boolean;
}

interface ApiResponse {
  success: boolean;
  models: TranslationModel[];
  count: number;
}

// ============================================
// Status Badge
// ============================================

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  pending: {
    badge: "szn-badge szn-badge-muted",
    label: "Pending",
  },
  training: {
    badge: "szn-badge szn-badge-info",
    label: "Training",
  },
  ready: {
    badge: "szn-badge szn-badge-success",
    label: "Ready",
  },
  failed: {
    badge: "szn-badge szn-badge-error",
    label: "Failed",
  },
  archived: {
    badge: "szn-badge szn-badge-warning",
    label: "Archived",
  },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={style.badge}>
      {style.label}
    </span>
  );
}

// ============================================
// Icons
// ============================================

function ArrowRightIcon() {
  return (
    <svg
      className="w-4 h-4 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 5l7 7m0 0l-7 7m7-7H3"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  );
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

// ============================================
// Model Card
// ============================================

interface ModelCardProps {
  model: TranslationModel;
  isSelected: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  showActions: boolean;
}

function ModelCard({
  model,
  isSelected,
  onSelect,
  onDelete,
  showActions,
}: ModelCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm && onDelete) {
      onDelete();
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  // formatDate imported from @/lib/format-date

  const formatModelName = (name: string) => {
    // Shorten common embedding model names
    return name
      .replace("text-embedding-", "")
      .replace("-multilingual", "-ml")
      .replace("-english", "-en");
  };

  return (
    <div
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {model.name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Created {formatDate(model.createdAt)}
          </p>
        </div>
        <StatusBadge status={model.status} />
      </div>

      {/* Model Pair */}
      <div className="flex items-center gap-2 mt-3 text-xs">
        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
          {formatModelName(model.sourceModel)}
        </span>
        <ArrowRightIcon />
        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
          {formatModelName(model.targetModel)}
        </span>
      </div>

      {/* Dimensions */}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span>{model.sourceDim}d</span>
        <ArrowRightIcon />
        <span>{model.targetDim}d</span>
        <span className="text-gray-300">|</span>
        <span className="capitalize">{model.translationType}</span>
      </div>

      {/* Quality Metrics */}
      {model.status === "ready" && model.validationRmse !== undefined && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs">
          <div>
            <span className="text-gray-500">RMSE: </span>
            <span className="font-medium text-gray-700">
              {model.validationRmse.toFixed(4)}
            </span>
          </div>
          {model.cosineSimilarityMean !== undefined && (
            <div>
              <span className="text-gray-500">Cosine: </span>
              <span className="font-medium text-gray-700">
                {(model.cosineSimilarityMean * 100).toFixed(1)}%
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Samples: </span>
            <span className="font-medium text-gray-700">
              {model.trainingSamples.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {model.status === "failed" && model.errorMessage && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-[var(--signal-conflict-ink)] truncate" title={model.errorMessage}>
            {model.errorMessage}
          </p>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={handleDelete}
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              showDeleteConfirm
                ? "bg-[var(--signal-conflict)] text-white hover:bg-[var(--signal-conflict)]"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <TrashIcon />
            {showDeleteConfirm ? "Confirm" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ECLModelList({
  apiKey,
  onSelectModel,
  onDeleteModel,
  onCreateNew,
  selectedModelId,
  showActions = true,
}: ECLModelListProps) {
  const [models, setModels] = useState<TranslationModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      const url = new URL("/api/ecl/models", window.location.origin);
      if (filter !== "all") {
        url.searchParams.set("status", filter);
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to fetch models");
      }

      const data: ApiResponse = await response.json();
      setModels(data.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, filter]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleDelete = async (modelId: string) => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      const response = await fetch(`/api/ecl/models?id=${modelId}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to delete model");
      }

      setModels((prev) => prev.filter((m) => m.id !== modelId));
      onDeleteModel?.(modelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete model");
    }
  };

  const filteredModels = models;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">ECL Models</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchModels}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            disabled={isLoading}
          >
            <RefreshIcon spinning={isLoading} />
            Refresh
          </button>
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              <PlusIcon />
              New Model
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Filter:</span>
        {["all", "ready", "pending", "training", "failed"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
              filter === status
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)]">
          <p className="text-sm text-[var(--signal-conflict-ink)]">{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <RefreshIcon spinning />
          <span className="ml-2 text-sm text-gray-500">Loading models...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredModels.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">
            {filter === "all"
              ? "No ECL models yet. Create your first model to enable embedding migration."
              : `No ${filter} models found.`}
          </p>
          {onCreateNew && filter === "all" && (
            <button
              onClick={onCreateNew}
              className="mt-4 inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon />
              Create ECL Model
            </button>
          )}
        </div>
      )}

      {/* Model List */}
      {!isLoading && filteredModels.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isSelected={model.id === selectedModelId}
              onSelect={() => onSelectModel?.(model)}
              onDelete={() => handleDelete(model.id)}
              showActions={showActions}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {!isLoading && models.length > 0 && (
        <div className="text-xs text-gray-500 text-right">
          {models.length} model{models.length !== 1 ? "s" : ""} total
          {models.filter((m) => m.status === "ready").length > 0 && (
            <span>
              {" "}
              ({models.filter((m) => m.status === "ready").length} ready)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ECLModelList;
