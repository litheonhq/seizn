"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR, { mutate } from "swr";

// =============================================================================
// Types
// =============================================================================

interface IngestionSettings {
  autoSaveEnabled: boolean;
  candidateModeEnabled: boolean;
  defaultConfidenceThreshold: number;
  strictness: "low" | "medium" | "high" | "very_high";
  blockedCategories: string[];
  blockedPatterns: string[];
  sensitiveCapsuleEnabled: boolean;
  sensitiveCategories: string[];
}

interface SettingsResponse {
  success: boolean;
  settings: IngestionSettings;
}

const AVAILABLE_CATEGORIES = [
  { id: "health", label: "Health", description: "Medical and health information" },
  { id: "finance", label: "Finance", description: "Financial and banking data" },
  { id: "auth", label: "Auth", description: "Passwords and credentials" },
  { id: "secrets", label: "Secrets", description: "API keys and tokens" },
  { id: "personal", label: "Personal", description: "PII and personal details" },
  { id: "work", label: "Work", description: "Work-related information" },
];

const STRICTNESS_LEVELS = [
  { value: "low", label: "Low", threshold: 0.5, description: "Accept most extractions" },
  { value: "medium", label: "Medium", threshold: 0.75, description: "Balanced filtering" },
  { value: "high", label: "High", threshold: 0.9, description: "Only high confidence" },
  { value: "very_high", label: "Very High", threshold: 0.95, description: "Maximum precision" },
];

// =============================================================================
// Icons
// =============================================================================

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

// =============================================================================
// Component
// =============================================================================

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function IngestionSettingsCard() {
  const { data, error, isLoading } = useSWR<SettingsResponse>(
    "/api/spring/ingestion/settings",
    fetcher
  );

  const [localSettings, setLocalSettings] = useState<IngestionSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Sync local state with fetched data
  useEffect(() => {
    if (data?.settings) {
      setLocalSettings(data.settings);
    }
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!localSettings) return;

    setSaving(true);
    setSaveStatus("idle");

    try {
      const res = await fetch("/api/spring/ingestion/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localSettings),
      });

      if (res.ok) {
        setSaveStatus("success");
        mutate("/api/spring/ingestion/settings");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [localSettings]);

  const toggleCategory = useCallback((category: string, list: "blocked" | "sensitive") => {
    if (!localSettings) return;

    const key = list === "blocked" ? "blockedCategories" : "sensitiveCategories";
    const current = localSettings[key];

    setLocalSettings({
      ...localSettings,
      [key]: current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    });
  }, [localSettings]);

  if (isLoading) {
    return (
      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-[var(--ink-50)] rounded w-1/3" />
          <div className="h-4 bg-[var(--ink-50)] rounded w-2/3" />
          <div className="h-10 bg-[var(--ink-50)] rounded" />
        </div>
      </div>
    );
  }

  if (error || !localSettings) {
    return (
      <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] p-6">
        <p className="text-[var(--signal-conflict-ink)]">Failed to load ingestion settings</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--ink-0)] rounded-lg border border-[var(--ink-200)] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[var(--ink-200)]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--ink-900)]/10 rounded-xl">
            <SparklesIcon className="w-5 h-5 text-[var(--ink-900)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ink-900)]">
              Memory Ingestion Controls
            </h3>
            <p className="text-sm text-[var(--ink-600)]">
              Control what gets remembered and how
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Auto-save Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[var(--ink-900)]">Auto-save memories</p>
            <p className="text-sm text-[var(--ink-600)]">
              Automatically extract and store memories from conversations
            </p>
          </div>
          <button
            onClick={() =>
              setLocalSettings({ ...localSettings, autoSaveEnabled: !localSettings.autoSaveEnabled })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              localSettings.autoSaveEnabled ? "bg-[var(--ink-900)]" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                localSettings.autoSaveEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Candidate Mode Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[var(--ink-900)]">Review before saving</p>
            <p className="text-sm text-[var(--ink-600)]">
              Send extracted memories to candidate queue for approval
            </p>
          </div>
          <button
            onClick={() =>
              setLocalSettings({
                ...localSettings,
                candidateModeEnabled: !localSettings.candidateModeEnabled,
              })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              localSettings.candidateModeEnabled ? "bg-[var(--ink-900)]" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                localSettings.candidateModeEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Strictness Level */}
        <div className="space-y-3">
          <div>
            <p className="font-medium text-[var(--ink-900)]">Extraction strictness</p>
            <p className="text-sm text-[var(--ink-600)]">
              How confident should the AI be before storing a memory?
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {STRICTNESS_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() =>
                  setLocalSettings({
                    ...localSettings,
                    strictness: level.value as IngestionSettings["strictness"],
                    defaultConfidenceThreshold: level.threshold,
                  })
                }
                className={`p-3 rounded-xl border text-center transition-colors ${
                  localSettings.strictness === level.value
                    ? "border-[var(--ink-900)] bg-[var(--ink-900)]/10"
                    : "border-[var(--ink-200)] hover:border-[var(--ink-200)]"
                }`}
              >
                <p
                  className={`font-medium text-sm ${
                    localSettings.strictness === level.value
                      ? "text-[var(--ink-900)]"
                      : "text-[var(--ink-900)]"
                  }`}
                >
                  {level.label}
                </p>
                <p className="text-xs text-[var(--ink-600)] mt-1">
                  {Math.round(level.threshold * 100)}%
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Blocked Categories */}
        <div className="space-y-3">
          <div>
            <p className="font-medium text-[var(--ink-900)]">Never store these topics</p>
            <p className="text-sm text-[var(--ink-600)]">
              Block memories containing sensitive categories
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id, "blocked")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  localSettings.blockedCategories.includes(cat.id)
                    ? "bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/30 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)]"
                    : "bg-[var(--ink-50)] text-[var(--ink-600)] border border-transparent"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sensitive Capsule */}
        <div className="p-4 bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending-ink)]/20 rounded-xl border border-[var(--signal-pending)] dark:border-[var(--signal-pending)] space-y-3">
          <div className="flex items-center gap-2">
            <ShieldIcon className="w-5 h-5 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]" />
            <p className="font-medium text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">Sensitive Capsule</p>
          </div>
          <p className="text-sm text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">
            Memories with these categories will be stored in a protected capsule with extra encryption.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">Enable capsule</span>
            <button
              onClick={() =>
                setLocalSettings({
                  ...localSettings,
                  sensitiveCapsuleEnabled: !localSettings.sensitiveCapsuleEnabled,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localSettings.sensitiveCapsuleEnabled
                  ? "bg-yellow-600"
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.sensitiveCapsuleEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {localSettings.sensitiveCapsuleEnabled && (
            <div className="flex flex-wrap gap-2 pt-2">
              {AVAILABLE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id, "sensitive")}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    localSettings.sensitiveCategories.includes(cat.id)
                      ? "bg-yellow-200 dark:bg-[var(--signal-pending-ink)] text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] border border-[var(--signal-pending)] dark:border-[var(--signal-pending)]"
                      : "bg-[var(--signal-pending-soft)]/50 dark:bg-[var(--signal-pending-ink)]/30 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] border border-transparent"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[var(--ink-200)] flex items-center justify-between">
        <div className="text-sm text-[var(--ink-600)]">
          {saveStatus === "success" && (
            <span className="text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]">Settings saved!</span>
          )}
          {saveStatus === "error" && (
            <span className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">Failed to save</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/90 disabled:bg-[var(--ink-900)]/50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

export default IngestionSettingsCard;
