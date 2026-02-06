"use client";

import { useState, useEffect } from "react";
import type { BudgetSettings as BudgetSettingsType, BudgetMode, FallbackStrategy } from "@/lib/budget-planner/types";

// ============================================
// Types
// ============================================

export interface BudgetSettingsProps {
  initialSettings?: Partial<BudgetSettingsType>;
  onSave?: (settings: BudgetSettingsType) => Promise<void>;
  disabled?: boolean;
}

interface FormState {
  dailyBudgetUsd: string;
  monthlyBudgetUsd: string;
  perQueryMaxUsd: string;
  alertAtPercent: string;
  mode: BudgetMode;
  fallbackStrategy: FallbackStrategy;
}

// ============================================
// Component
// ============================================

export function BudgetSettings({
  initialSettings,
  onSave,
  disabled = false,
}: BudgetSettingsProps) {
  const [form, setForm] = useState<FormState>({
    dailyBudgetUsd: initialSettings?.dailyBudgetUsd?.toString() ?? "10.00",
    monthlyBudgetUsd: initialSettings?.monthlyBudgetUsd?.toString() ?? "100.00",
    perQueryMaxUsd: initialSettings?.perQueryMaxUsd?.toString() ?? "0.05",
    alertAtPercent: initialSettings?.alertAtPercent?.toString() ?? "80",
    mode: initialSettings?.mode ?? "soft",
    fallbackStrategy: initialSettings?.fallbackStrategy ?? "degrade",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Update form when initial settings change
  useEffect(() => {
    if (initialSettings) {
      setForm((prev) => ({
        dailyBudgetUsd: initialSettings.dailyBudgetUsd?.toString() ?? prev.dailyBudgetUsd,
        monthlyBudgetUsd: initialSettings.monthlyBudgetUsd?.toString() ?? prev.monthlyBudgetUsd,
        perQueryMaxUsd: initialSettings.perQueryMaxUsd?.toString() ?? prev.perQueryMaxUsd,
        alertAtPercent: initialSettings.alertAtPercent?.toString() ?? prev.alertAtPercent,
        mode: initialSettings.mode ?? prev.mode,
        fallbackStrategy: initialSettings.fallbackStrategy ?? prev.fallbackStrategy,
      }));
    }

  }, [initialSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validate
    const dailyBudget = parseFloat(form.dailyBudgetUsd);
    const monthlyBudget = parseFloat(form.monthlyBudgetUsd);
    const perQueryMax = parseFloat(form.perQueryMaxUsd);
    const alertPercent = parseInt(form.alertAtPercent);

    if (isNaN(dailyBudget) || dailyBudget < 0) {
      setError("Daily budget must be a non-negative number");
      return;
    }
    if (isNaN(monthlyBudget) || monthlyBudget < 0) {
      setError("Monthly budget must be a non-negative number");
      return;
    }
    if (isNaN(perQueryMax) || perQueryMax < 0) {
      setError("Per-query max must be a non-negative number");
      return;
    }
    if (isNaN(alertPercent) || alertPercent < 0 || alertPercent > 100) {
      setError("Alert threshold must be between 0 and 100");
      return;
    }

    if (onSave) {
      setSaving(true);
      try {
        await onSave({
          dailyBudgetUsd: dailyBudget,
          monthlyBudgetUsd: monthlyBudget,
          perQueryMaxUsd: perQueryMax,
          alertAtPercent: alertPercent,
          mode: form.mode,
          fallbackStrategy: form.fallbackStrategy,
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Budget Limits */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Limits</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Daily Budget */}
          <div>
            <label htmlFor="budget-daily" className="block text-sm font-medium text-gray-700 mb-1">
              Daily Budget (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="budget-daily"
                type="number"
                step="0.01"
                min="0"
                value={form.dailyBudgetUsd}
                onChange={(e) => setForm({ ...form, dailyBudgetUsd: e.target.value })}
                disabled={disabled || saving}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:bg-gray-100"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Max spend per day</p>
          </div>

          {/* Monthly Budget */}
          <div>
            <label htmlFor="budget-monthly" className="block text-sm font-medium text-gray-700 mb-1">
              Monthly Budget (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="budget-monthly"
                type="number"
                step="0.01"
                min="0"
                value={form.monthlyBudgetUsd}
                onChange={(e) => setForm({ ...form, monthlyBudgetUsd: e.target.value })}
                disabled={disabled || saving}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:bg-gray-100"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Max spend per month</p>
          </div>

          {/* Per-Query Max */}
          <div>
            <label htmlFor="budget-per-query" className="block text-sm font-medium text-gray-700 mb-1">
              Per-Query Max (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="budget-per-query"
                type="number"
                step="0.001"
                min="0"
                value={form.perQueryMaxUsd}
                onChange={(e) => setForm({ ...form, perQueryMaxUsd: e.target.value })}
                disabled={disabled || saving}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:bg-gray-100"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Max cost per query</p>
          </div>
        </div>
      </div>

      {/* Alert Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Settings</h3>

        <div>
          <label htmlFor="budget-alert-threshold" className="block text-sm font-medium text-gray-700 mb-1">
            Alert Threshold
          </label>
          <div className="flex items-center gap-4">
            <input
              id="budget-alert-threshold"
              type="range"
              min="0"
              max="100"
              value={form.alertAtPercent}
              onChange={(e) => setForm({ ...form, alertAtPercent: e.target.value })}
              disabled={disabled || saving}
              className="flex-1"
            />
            <span className="text-sm font-medium text-gray-900 w-12">
              {form.alertAtPercent}%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Receive alerts when budget usage reaches this percentage
          </p>
        </div>
      </div>

      {/* Enforcement Mode */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Enforcement Mode</h3>

        <div className="space-y-4">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget Mode
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="soft"
                  checked={form.mode === "soft"}
                  onChange={(e) => setForm({ ...form, mode: e.target.value as BudgetMode })}
                  disabled={disabled || saving}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Soft</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="hard"
                  checked={form.mode === "hard"}
                  onChange={(e) => setForm({ ...form, mode: e.target.value as BudgetMode })}
                  disabled={disabled || saving}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Hard</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {form.mode === "soft"
                ? "Warn but allow queries when over budget"
                : "Reject queries when budget is exceeded"}
            </p>
          </div>

          {/* Fallback Strategy */}
          {form.mode === "soft" && (
            <div>
              <label htmlFor="budget-fallback-strategy" className="block text-sm font-medium text-gray-700 mb-2">
                Fallback Strategy
              </label>
              <select
                id="budget-fallback-strategy"
                value={form.fallbackStrategy}
                onChange={(e) =>
                  setForm({ ...form, fallbackStrategy: e.target.value as FallbackStrategy })
                }
                disabled={disabled || saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:bg-gray-100"
              >
                <option value="degrade">Degrade - Use cheaper models/fewer results</option>
                <option value="reject">Reject - Return error when over budget</option>
                <option value="queue">Queue - Queue queries for later</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                What to do when a query would exceed the budget
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">Settings saved successfully!</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled || saving}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

export default BudgetSettings;
