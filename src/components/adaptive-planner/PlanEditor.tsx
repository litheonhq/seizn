"use client";

import { useState } from "react";

import type {
  QueryPlan,
  PlanConfig,
  QueryIntent,
  CreatePlanRequest,
  UpdatePlanRequest,
} from "@/lib/adaptive-planner/types";

// ============================================
// Types
// ============================================

export interface PlanEditorProps {
  /** Existing plan to edit (undefined for create mode) */
  plan?: QueryPlan;
  /** Collection ID for new plans */
  collectionId?: string;
  /** Callback on successful save */
  onSave?: (plan: QueryPlan) => void;
  /** Callback on cancel */
  onCancel?: () => void;
  /** Custom class name */
  className?: string;
}

const INTENT_OPTIONS: QueryIntent[] = [
  "factual",
  "exploratory",
  "comparison",
  "procedural",
  "opinion",
];

const MODE_OPTIONS = ["vector", "keyword", "hybrid"] as const;

// ============================================
// Component
// ============================================

export function PlanEditor({
  plan,
  collectionId,
  onSave,
  onCancel,
  className = "",
}: PlanEditorProps) {
  const isEditMode = !!plan;

  // Form state
  const [name, setName] = useState(plan?.planName || "");
  const [priority, setPriority] = useState(plan?.priority ?? 50);
  const [intents, setIntents] = useState<QueryIntent[]>(plan?.queryIntents || []);
  const [patterns, setPatterns] = useState<string>(
    plan?.queryPatterns?.join("\n") || ""
  );
  const [minLength, setMinLength] = useState<number | undefined>(plan?.minQueryLength);
  const [maxLength, setMaxLength] = useState<number | undefined>(plan?.maxQueryLength);
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);

  // Config state
  const [config, setConfig] = useState<PlanConfig>({
    topK: plan?.planConfig.topK ?? 10,
    rerankEnabled: plan?.planConfig.rerankEnabled ?? true,
    rerankTopN: plan?.planConfig.rerankTopN ?? 5,
    hybridAlpha: plan?.planConfig.hybridAlpha ?? 0.7,
    threshold: plan?.planConfig.threshold ?? 0.55,
    mode: plan?.planConfig.mode ?? "hybrid",
  });

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle intent toggle
  const toggleIntent = (intent: QueryIntent) => {
    setIntents((prev) =>
      prev.includes(intent) ? prev.filter((i) => i !== intent) : [...prev, intent]
    );
  };

  // Handle config change
  const updateConfig = <K extends keyof PlanConfig>(key: K, value: PlanConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!name.trim()) {
      setError("Plan name is required");
      return;
    }

    if (config.topK < 1 || config.topK > 100) {
      setError("Top K must be between 1 and 100");
      return;
    }

    try {
      setSaving(true);

      const queryPatterns = patterns
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (isEditMode && plan) {
        // Update existing plan
        const updateData: UpdatePlanRequest & { id: string } = {
          id: plan.id,
          planName: name.trim(),
          planConfig: config,
          queryIntents: intents.length > 0 ? intents : undefined,
          queryPatterns: queryPatterns.length > 0 ? queryPatterns : undefined,
          minQueryLength: minLength,
          maxQueryLength: maxLength,
          priority,
          isActive,
        };

        const response = await fetch("/api/planner/plans", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update plan");
        }

        const data = await response.json();
        onSave?.(data.plan);
      } else {
        // Create new plan
        const createData: CreatePlanRequest = {
          planName: name.trim(),
          collectionId,
          planConfig: config,
          queryIntents: intents.length > 0 ? intents : undefined,
          queryPatterns: queryPatterns.length > 0 ? queryPatterns : undefined,
          minQueryLength: minLength,
          maxQueryLength: maxLength,
          priority,
        };

        const response = await fetch("/api/planner/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createData),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create plan");
        }

        const data = await response.json();
        onSave?.(data.plan);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink-900)]">
          {isEditMode ? "Edit Plan" : "Create Plan"}
        </h2>
        <p className="text-sm text-[var(--ink-600)]">
          Configure retrieval strategy for specific query types
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/20 border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] rounded-lg">
          <p className="text-sm text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">{error}</p>
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
            Plan Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., technical_queries"
            className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
              Priority
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
              min={0}
              max={100}
              className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Higher = selected first (0-100)</p>
          </div>

          {isEditMode && (
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-[var(--ink-600)]">Active</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Matching Criteria */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-[var(--ink-900)]">
          Matching Criteria
        </h3>

        {/* Intent Selection */}
        <div>
          <label className="block text-sm text-[var(--ink-600)] mb-2">
            Query Intents
          </label>
          <div className="flex flex-wrap gap-2">
            {INTENT_OPTIONS.map((intent) => (
              <button
                key={intent}
                type="button"
                onClick={() => toggleIntent(intent)}
                className={`
                  px-3 py-1.5 text-sm rounded-full border transition-colors
                  ${intents.includes(intent)
                    ? "bg-blue-100 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300"
                    : "bg-[var(--ink-50)] border-[var(--ink-200)] text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
                  }
                `}
              >
                {intent}
              </button>
            ))}
          </div>
        </div>

        {/* Patterns */}
        <div>
          <label className="block text-sm text-[var(--ink-600)] mb-1">
            Query Patterns (regex, one per line)
          </label>
          <textarea
            value={patterns}
            onChange={(e) => setPatterns(e.target.value)}
            placeholder="^how (do|can|to)\b&#10;.*implement.*"
            rows={3}
            className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
        </div>

        {/* Length Constraints */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--ink-600)] mb-1">
              Min Query Length
            </label>
            <input
              type="number"
              value={minLength ?? ""}
              onChange={(e) => setMinLength(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="No minimum"
              min={1}
              className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--ink-600)] mb-1">
              Max Query Length
            </label>
            <input
              type="number"
              value={maxLength ?? ""}
              onChange={(e) => setMaxLength(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="No maximum"
              min={1}
              className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Retrieval Config */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-[var(--ink-900)]">
          Retrieval Configuration
        </h3>

        {/* Mode */}
        <div>
          <label className="block text-sm text-[var(--ink-600)] mb-1">
            Retrieval Mode
          </label>
          <div className="flex gap-2">
            {MODE_OPTIONS.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateConfig("mode", mode)}
                className={`
                  px-4 py-2 text-sm rounded-lg border transition-colors
                  ${config.mode === mode
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-[var(--ink-50)] border-[var(--ink-200)] text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
                  }
                `}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Top K and Threshold */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--ink-600)] mb-1">
              Top K Results
            </label>
            <input
              type="number"
              value={config.topK}
              onChange={(e) => updateConfig("topK", parseInt(e.target.value, 10) || 10)}
              min={1}
              max={100}
              className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--ink-600)] mb-1">
              Similarity Threshold
            </label>
            <input
              type="number"
              value={config.threshold}
              onChange={(e) => updateConfig("threshold", parseFloat(e.target.value) || 0.5)}
              min={0}
              max={1}
              step={0.05}
              className="w-full px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Hybrid Alpha */}
        {config.mode === "hybrid" && (
          <div>
            <label className="block text-sm text-[var(--ink-600)] mb-1">
              Hybrid Alpha (0 = keyword, 1 = vector)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                value={config.hybridAlpha}
                onChange={(e) => updateConfig("hybridAlpha", parseFloat(e.target.value))}
                min={0}
                max={1}
                step={0.05}
                className="flex-1"
              />
              <span className="text-sm text-[var(--ink-600)] w-12">
                {config.hybridAlpha.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Reranking */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.rerankEnabled}
              onChange={(e) => updateConfig("rerankEnabled", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-[var(--ink-600)]">
              Enable Reranking
            </span>
          </label>

          {config.rerankEnabled && (
            <div className="ml-6">
              <label className="block text-sm text-[var(--ink-600)] mb-1">
                Rerank Top N
              </label>
              <input
                type="number"
                value={config.rerankTopN}
                onChange={(e) => updateConfig("rerankTopN", parseInt(e.target.value, 10) || 5)}
                min={1}
                max={config.topK}
                className="w-32 px-3 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--ink-200)]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm text-[var(--ink-600)] bg-[var(--ink-50)] rounded-lg hover:bg-[var(--ink-50)] disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isEditMode ? "Save Changes" : "Create Plan"}
        </button>
      </div>
    </form>
  );
}

// ============================================
// Export
// ============================================

export default PlanEditor;
