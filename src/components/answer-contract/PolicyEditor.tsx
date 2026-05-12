"use client";

import { useState, useCallback } from "react";
import type {
  ContractPolicy,
  FailAction,
  PolicyRequest,
} from "@/lib/answer-contract/types";


/**
 * Props for PolicyEditor component
 */
interface PolicyEditorProps {
  policy?: ContractPolicy;
  onSave: (policy: PolicyRequest, policyId?: string) => Promise<void>;
  onCancel?: () => void;
  onDelete?: (policyId: string) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Default policy values (matching types.ts)
 */
const defaultPolicyValues: PolicyRequest = {
  name: "New Policy",
  description: "",
  minGroundingScore: 0.7,
  minFaithfulnessScore: 0.8,
  minCoverageScore: 0.5,
  minEvidenceChunks: 1,
  maxUnsupportedClaims: 0,
  onFailAction: "abstain",
  abstainMessage: "I cannot answer this question with confidence based on the available information.",
  warnPrefix: "[Low Confidence] ",
  claimConfidenceThreshold: 0.6,
  evidenceRelevanceThreshold: 0.5,
  isActive: true,
  isDefault: false,
  priority: 0,
};

/**
 * Slider input with label
 */
function ScoreSlider({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const percentage = Math.round(value * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-700">{label}</label>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
        <span className="text-sm font-medium text-gray-900">{percentage}%</span>
      </div>
      <input aria-label="Value slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{Math.round(min * 100)}%</span>
        <span>{Math.round(max * 100)}%</span>
      </div>
    </div>
  );
}

/**
 * Number input with label
 */
function NumberInput({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <input aria-label="Value"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

/**
 * Text input with label
 */
function TextInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-[var(--signal-conflict-ink)] ml-1">*</span>}
      </label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <input aria-label="Value"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

/**
 * Textarea input with label
 */
function TextareaInput({
  label,
  description,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

/**
 * Toggle switch
 */
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Section header
 */
function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-gray-200 pb-2 mb-4">
      <h3 className="text-md font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
  );
}

/**
 * PolicyEditor component
 *
 * Form for creating and editing answer contract policies.
 */
export default function PolicyEditor({
  policy,
  onSave,
  onCancel,
  onDelete,
  isLoading = false,
}: PolicyEditorProps) {
  // Initialize form state
  const [formData, setFormData] = useState<PolicyRequest>(() => {
    if (policy) {
      return {
        name: policy.name,
        description: policy.description,
        collectionId: policy.collectionId,
        minGroundingScore: policy.minGroundingScore,
        minFaithfulnessScore: policy.minFaithfulnessScore,
        minCoverageScore: policy.minCoverageScore,
        minEvidenceChunks: policy.minEvidenceChunks,
        maxUnsupportedClaims: policy.maxUnsupportedClaims,
        onFailAction: policy.onFailAction,
        abstainMessage: policy.abstainMessage,
        warnPrefix: policy.warnPrefix,
        claimConfidenceThreshold: policy.claimConfidenceThreshold,
        evidenceRelevanceThreshold: policy.evidenceRelevanceThreshold,
        isActive: policy.isActive,
        isDefault: policy.isDefault,
        priority: policy.priority,
      };
    }
    return { ...defaultPolicyValues };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Update field helper
  const updateField = useCallback(<K extends keyof PolicyRequest>(
    field: K,
    value: PolicyRequest[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.trim().length === 0) {
      newErrors.name = "Policy name is required";
    }

    if (formData.minGroundingScore !== undefined && (formData.minGroundingScore < 0 || formData.minGroundingScore > 1)) {
      newErrors.minGroundingScore = "Must be between 0 and 1";
    }

    if (formData.minFaithfulnessScore !== undefined && (formData.minFaithfulnessScore < 0 || formData.minFaithfulnessScore > 1)) {
      newErrors.minFaithfulnessScore = "Must be between 0 and 1";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave(formData, policy?.id);
    } catch (error) {
      console.error("Save failed:", error);
      setErrors({ submit: error instanceof Error ? error.message : "Failed to save policy" });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!policy?.id || !onDelete) return;

    setIsSaving(true);
    try {
      await onDelete(policy.id);
    } catch (error) {
      console.error("Delete failed:", error);
      setErrors({ submit: error instanceof Error ? error.message : "Failed to delete policy" });
    } finally {
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setFormData({ ...defaultPolicyValues, name: formData.name });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          {policy ? "Edit Policy" : "Create Policy"}
        </h2>
        <p className="text-sm text-gray-500">
          Configure how answer verification should behave.
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="p-6 space-y-6">
        {/* Basic Information */}
        <section>
          <SectionHeader title="Basic Information" />
          <div className="space-y-4">
            <TextInput
              label="Policy Name"
              value={formData.name || ""}
              onChange={(v) => updateField("name", v)}
              placeholder="e.g., Strict Verification"
              required
            />
            {errors.name && <p className="text-sm text-[var(--signal-conflict-ink)]">{errors.name}</p>}

            <TextareaInput
              label="Description"
              description="Optional description of this policy's purpose"
              value={formData.description || ""}
              onChange={(v) => updateField("description", v)}
              rows={2}
            />

            <div className="grid grid-cols-2 gap-4">
              <Toggle
                label="Active"
                description="Enable this policy"
                checked={formData.isActive ?? true}
                onChange={(v) => updateField("isActive", v)}
              />
              <Toggle
                label="Default"
                description="Use as fallback policy"
                checked={formData.isDefault ?? false}
                onChange={(v) => updateField("isDefault", v)}
              />
            </div>

            <NumberInput
              label="Priority"
              description="Higher priority policies take precedence (0-100)"
              value={formData.priority ?? 0}
              onChange={(v) => updateField("priority", v)}
              min={0}
              max={100}
            />
          </div>
        </section>

        {/* Score Thresholds */}
        <section>
          <SectionHeader
            title="Score Thresholds"
            description="Minimum scores required to pass verification"
          />
          <div className="space-y-6">
            <ScoreSlider
              label="Minimum Grounding Score"
              description="How much of the answer must be supported by evidence"
              value={formData.minGroundingScore ?? 0.7}
              onChange={(v) => updateField("minGroundingScore", v)}
            />

            <ScoreSlider
              label="Minimum Faithfulness Score"
              description="How faithful the answer must be to the evidence"
              value={formData.minFaithfulnessScore ?? 0.8}
              onChange={(v) => updateField("minFaithfulnessScore", v)}
            />

            <ScoreSlider
              label="Minimum Coverage Score"
              description="How much of the answer text must be verified"
              value={formData.minCoverageScore ?? 0.5}
              onChange={(v) => updateField("minCoverageScore", v)}
            />
          </div>
        </section>

        {/* Claim Requirements */}
        <section>
          <SectionHeader
            title="Claim Requirements"
            description="Configure claim-level verification"
          />
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Minimum Evidence Chunks"
              description="Required evidence to attempt verification"
              value={formData.minEvidenceChunks ?? 1}
              onChange={(v) => updateField("minEvidenceChunks", v)}
              min={0}
              max={20}
            />

            <NumberInput
              label="Max Unsupported Claims"
              description="Allowed claims without evidence"
              value={formData.maxUnsupportedClaims ?? 0}
              onChange={(v) => updateField("maxUnsupportedClaims", v)}
              min={0}
              max={50}
            />
          </div>
        </section>

        {/* Behavior Settings */}
        <section>
          <SectionHeader
            title="Behavior on Failure"
            description="What to do when verification fails"
          />
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Action on Failure</label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {(["abstain", "warn", "pass"] as FailAction[]).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => updateField("onFailAction", action)}
                    className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.onFailAction === action
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-center">
                      <span className="block capitalize">{action}</span>
                      <span className="text-xs font-normal text-gray-500">
                        {action === "abstain" && "Return uncertainty message"}
                        {action === "warn" && "Add warning prefix"}
                        {action === "pass" && "Allow through"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {formData.onFailAction === "abstain" && (
              <TextareaInput
                label="Abstain Message"
                description="Message returned when unable to answer"
                value={formData.abstainMessage || ""}
                onChange={(v) => updateField("abstainMessage", v)}
                rows={2}
              />
            )}

            {formData.onFailAction === "warn" && (
              <TextInput
                label="Warning Prefix"
                description="Text prepended to low-confidence answers"
                value={formData.warnPrefix || ""}
                onChange={(v) => updateField("warnPrefix", v)}
              />
            )}
          </div>
        </section>

        {/* Advanced Settings */}
        <section>
          <SectionHeader
            title="Advanced Settings"
            description="Fine-tune claim extraction and evidence mapping"
          />
          <div className="space-y-6">
            <ScoreSlider
              label="Claim Confidence Threshold"
              description="Minimum confidence to include a claim"
              value={formData.claimConfidenceThreshold ?? 0.6}
              onChange={(v) => updateField("claimConfidenceThreshold", v)}
            />

            <ScoreSlider
              label="Evidence Relevance Threshold"
              description="Minimum relevance for evidence mapping"
              value={formData.evidenceRelevanceThreshold ?? 0.5}
              onChange={(v) => updateField("evidenceRelevanceThreshold", v)}
            />
          </div>
        </section>

        {/* Error message */}
        {errors.submit && (
          <div className="p-4 bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-lg">
            <p className="text-sm text-[var(--signal-conflict-ink)]">{errors.submit}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetToDefaults}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-700"
            >
              Reset to Defaults
            </button>
            {policy && onDelete && (
              <>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--signal-conflict-ink)]">Delete this policy?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1 text-sm bg-[var(--signal-conflict)] text-white rounded hover:bg-[var(--signal-conflict)]"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1 text-sm text-gray-600 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3 py-2 text-sm text-[var(--signal-conflict-ink)] hover:text-[var(--signal-conflict-ink)]"
                  >
                    Delete Policy
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving || isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : policy ? "Update Policy" : "Create Policy"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
