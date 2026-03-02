"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  QueryPlan,
  DefaultQueryPlan,
  ListPlansResponse,
} from "@/lib/adaptive-planner/types";

// ============================================
// Types
// ============================================

export interface PlanListProps {
  /** Collection ID to filter plans (optional) */
  collectionId?: string;
  /** Whether to show default plans */
  showDefaults?: boolean;
  /** Whether to show inactive plans */
  showInactive?: boolean;
  /** Callback when a plan is selected */
  onPlanSelect?: (plan: QueryPlan | DefaultQueryPlan) => void;
  /** Callback when edit is requested */
  onEdit?: (plan: QueryPlan) => void;
  /** Callback when delete is requested */
  onDelete?: (plan: QueryPlan) => void;
  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

export function PlanList({
  collectionId,
  showDefaults = true,
  showInactive = false,
  onPlanSelect,
  onEdit,
  onDelete,
  className = "",
}: PlanListProps) {
  const [plans, setPlans] = useState<QueryPlan[]>([]);
  const [defaults, setDefaults] = useState<DefaultQueryPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch plans
  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (collectionId) {
        params.append("collectionId", collectionId);
      }
      params.append("includeDefaults", showDefaults ? "true" : "false");
      params.append("activeOnly", showInactive ? "false" : "true");

      const response = await fetch(`/api/planner/plans?${params}`);
      const data: ListPlansResponse = await response.json();

      if (!data.success) {
        throw new Error("Failed to fetch plans");
      }

      setPlans(data.plans);
      setDefaults(data.defaults || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [collectionId, showDefaults, showInactive]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Handle plan selection
  const handleSelect = (plan: QueryPlan | DefaultQueryPlan) => {
    setSelectedId(plan.id);
    onPlanSelect?.(plan);
  };

  // Handle delete
  const handleDelete = async (plan: QueryPlan) => {
    if (!confirm(`Are you sure you want to delete "${plan.planName}"?`)) {
      return;
    }

    try {
      setDeletingId(plan.id);

      const response = await fetch(`/api/planner/plans?id=${plan.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete plan");
      }

      // Refresh the list
      await fetchPlans();
      onDelete?.(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete plan");
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================
  // Render
  // ============================================

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-szn-surface rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={fetchPlans}
            className="mt-2 text-sm text-red-600 dark:text-red-400 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const hasPlans = plans.length > 0;
  const hasDefaults = defaults.length > 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* User Plans */}
      <div>
        <h3 className="text-sm font-medium text-szn-text-2 mb-2">
          Custom Plans ({plans.length})
        </h3>

        {!hasPlans ? (
          <div className="text-center py-8 bg-szn-surface rounded-lg">
            <p className="text-szn-text-2">
              No custom plans yet. Create one to optimize retrieval for your use case.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isSelected={selectedId === plan.id}
                isDeleting={deletingId === plan.id}
                onClick={() => handleSelect(plan)}
                onEdit={onEdit ? () => onEdit(plan) : undefined}
                onDelete={() => handleDelete(plan)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Default Plans */}
      {showDefaults && hasDefaults && (
        <div>
          <h3 className="text-sm font-medium text-szn-text-2 mb-2">
            System Defaults ({defaults.length})
          </h3>

          <div className="space-y-2">
            {defaults.map((plan) => (
              <DefaultPlanCard
                key={plan.id}
                plan={plan}
                isSelected={selectedId === plan.id}
                onClick={() => handleSelect(plan)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Plan Card Component
// ============================================

interface PlanCardProps {
  plan: QueryPlan;
  isSelected: boolean;
  isDeleting: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}

function PlanCard({
  plan,
  isSelected,
  isDeleting,
  onClick,
  onEdit,
  onDelete,
}: PlanCardProps) {
  return (
    <div
      className={`
        relative p-4 rounded-lg border transition-all cursor-pointer
        ${isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "border-szn-border hover:border-gray-300 dark:hover:border-gray-600"
        }
        ${!plan.isActive ? "opacity-60" : ""}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-szn-text-1 truncate">
              {plan.planName}
            </h4>
            {plan.isLearned && (
              <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
                Learned
              </span>
            )}
            {!plan.isActive && (
              <span className="px-2 py-0.5 text-xs bg-szn-surface text-gray-500 rounded">
                Inactive
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-4 text-sm text-szn-text-2">
            {plan.queryIntents && plan.queryIntents.length > 0 && (
              <span>Intents: {plan.queryIntents.join(", ")}</span>
            )}
            <span>Priority: {plan.priority}</span>
          </div>

          <div className="mt-2 flex items-center gap-4 text-xs text-szn-text-3">
            <span>Uses: {plan.usageCount}</span>
            <span>Success: {(plan.successRate * 100).toFixed(0)}%</span>
            {plan.avgLatencyMs > 0 && (
              <span>Avg: {plan.avgLatencyMs.toFixed(0)}ms</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-4">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Edit plan"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
            className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
            title="Delete plan"
          >
            {isDeleting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Config Preview */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <ConfigBadge label="topK" value={plan.planConfig.topK} />
        <ConfigBadge label="mode" value={plan.planConfig.mode} />
        <ConfigBadge label="threshold" value={plan.planConfig.threshold.toFixed(2)} />
        {plan.planConfig.rerankEnabled && (
          <ConfigBadge label="rerank" value={`top ${plan.planConfig.rerankTopN}`} />
        )}
      </div>
    </div>
  );
}

// ============================================
// Default Plan Card Component
// ============================================

interface DefaultPlanCardProps {
  plan: DefaultQueryPlan;
  isSelected: boolean;
  onClick: () => void;
}

function DefaultPlanCard({ plan, isSelected, onClick }: DefaultPlanCardProps) {
  return (
    <div
      className={`
        p-3 rounded-lg border transition-all cursor-pointer
        ${isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "border-szn-border hover:border-gray-300 dark:hover:border-gray-600"
        }
      `}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-szn-text-2">
              {plan.planName}
            </h4>
            <span className="px-2 py-0.5 text-xs bg-szn-surface text-gray-500 rounded">
              System
            </span>
          </div>
          {plan.description && (
            <p className="mt-0.5 text-sm text-szn-text-2">
              {plan.description}
            </p>
          )}
        </div>

        <div className="flex gap-2 text-xs">
          {plan.queryIntents && plan.queryIntents.length > 0 && (
            <span className="px-2 py-1 bg-szn-surface text-szn-text-2 rounded">
              {plan.queryIntents.join(", ")}
            </span>
          )}
          {plan.complexity && (
            <span className="px-2 py-1 bg-szn-surface text-szn-text-2 rounded">
              {plan.complexity}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Config Badge Component
// ============================================

function ConfigBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="px-2 py-1 bg-szn-surface text-szn-text-2 rounded">
      {label}: {value}
    </span>
  );
}

// ============================================
// Export
// ============================================

export default PlanList;
