"use client";

import { useState, useEffect } from "react";
import type {
  CharacterPersona,
  RoleplaySettings,
} from "@/lib/spring/roleplay";
import {
  DEFAULT_ROLEPLAY_SETTINGS,
  CHARACTER_TEMPLATES,
  generatePersonaId,
  validatePersona,
} from "@/lib/spring/roleplay";

interface RoleplaySettingsProps {
  settings: RoleplaySettings;
  onSettingsChange: (settings: RoleplaySettings) => void;
  className?: string;
}

export function RoleplaySettingsPanel({
  settings,
  onSettingsChange,
  className = "",
}: RoleplaySettingsProps) {
  const [showPersonaEditor, setShowPersonaEditor] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const updateSetting = <K extends keyof RoleplaySettings>(
    key: K,
    value: RoleplaySettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MaskIcon className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold text-gray-900">Roleplay Mode</h3>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => updateSetting("enabled", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {settings.enabled && (
        <div className="p-4 space-y-4">
          {/* Character Persona */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Character Persona
            </label>
            {settings.persona ? (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-purple-900">{settings.persona.name}</p>
                    <p className="text-sm text-purple-700 mt-0.5 line-clamp-2">
                      {settings.persona.description}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setShowPersonaEditor(true)}
                      className="p-1.5 hover:bg-purple-200 rounded-lg transition-colors"
                    >
                      <EditIcon className="w-4 h-4 text-purple-600" />
                    </button>
                    <button
                      onClick={() => updateSetting("persona", undefined)}
                      className="p-1.5 hover:bg-purple-200 rounded-lg transition-colors"
                    >
                      <XIcon className="w-4 h-4 text-purple-600" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPersonaEditor(true)}
                  className="flex-1 py-2 px-3 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-purple-400 hover:text-purple-600 transition-colors"
                >
                  + Create Character
                </button>
                <button
                  onClick={() => setShowTemplates(true)}
                  className="py-2 px-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-purple-400 hover:text-purple-600 transition-colors"
                >
                  Templates
                </button>
              </div>
            )}
          </div>

          {/* Context Length */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Memory Length
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(["short", "medium", "long", "unlimited"] as const).map((length) => (
                <button
                  key={length}
                  onClick={() => updateSetting("contextLength", length)}
                  className={`py-1.5 px-2 text-xs rounded-lg transition-colors ${
                    settings.contextLength === length
                      ? "bg-purple-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {length.charAt(0).toUpperCase() + length.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {settings.contextLength === "unlimited"
                ? "Uses maximum model context"
                : `Keeps last ${
                    { short: 10, medium: 30, long: 100 }[settings.contextLength]
                  } messages`}
            </p>
          </div>

          {/* Response Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Response Style
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(["narrative", "dialogue", "mixed"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => updateSetting("responseStyle", style)}
                  className={`py-1.5 px-2 text-xs rounded-lg transition-colors ${
                    settings.responseStyle === style
                      ? "bg-purple-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <ToggleOption
              label="Preserve Character"
              description="AI stays in character throughout"
              checked={settings.preserveCharacter}
              onChange={(v) => updateSetting("preserveCharacter", v)}
            />
          </div>
        </div>
      )}

      {/* Persona Editor Modal */}
      {showPersonaEditor && (
        <PersonaEditor
          persona={settings.persona}
          onSave={(persona) => {
            updateSetting("persona", persona);
            setShowPersonaEditor(false);
          }}
          onClose={() => setShowPersonaEditor(false)}
        />
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <TemplateSelector
          onSelect={(template) => {
            const persona: CharacterPersona = {
              ...template,
              id: generatePersonaId(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            updateSetting("persona", persona);
            setShowTemplates(false);
          }}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}

// Toggle option component
function ToggleOption({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-5 h-5 border-2 border-gray-300 rounded peer-checked:border-purple-500 peer-checked:bg-purple-500 flex items-center justify-center transition-colors">
          {checked && <CheckIcon className="w-3 h-3 text-white" />}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}

// Persona editor modal
function PersonaEditor({
  persona,
  onSave,
  onClose,
}: {
  persona?: CharacterPersona;
  onSave: (persona: CharacterPersona) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<Partial<CharacterPersona>>(
    persona || {
      name: "",
      description: "",
      personality: "",
      background: "",
      appearance: "",
      speakingStyle: "",
      exampleDialogue: [],
      tags: [],
      isPublic: false,
    }
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [newDialogue, setNewDialogue] = useState("");

  const handleSave = () => {
    const validationErrors = validatePersona(formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    onSave({
      id: persona?.id || generatePersonaId(),
      name: formData.name!,
      description: formData.description!,
      personality: formData.personality!,
      background: formData.background,
      appearance: formData.appearance,
      speakingStyle: formData.speakingStyle,
      exampleDialogue: formData.exampleDialogue,
      tags: formData.tags || [],
      isPublic: formData.isPublic || false,
      createdAt: persona?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const addDialogue = () => {
    if (newDialogue.trim()) {
      setFormData({
        ...formData,
        exampleDialogue: [...(formData.exampleDialogue || []), newDialogue.trim()],
      });
      setNewDialogue("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            {persona ? "Edit Character" : "Create Character"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              {errors.map((error, i) => (
                <p key={i} className="text-sm text-red-600">{error}</p>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Character name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Brief description of the character"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Personality *
            </label>
            <textarea
              value={formData.personality || ""}
              onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Personality traits, behavior patterns"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Background
            </label>
            <textarea
              value={formData.background || ""}
              onChange={(e) => setFormData({ ...formData, background: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Character backstory, history"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Speaking Style
            </label>
            <input
              type="text"
              value={formData.speakingStyle || ""}
              onChange={(e) => setFormData({ ...formData, speakingStyle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="How does the character speak?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Example Dialogue
            </label>
            <div className="space-y-2">
              {(formData.exampleDialogue || []).map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    &quot;{d}&quot;
                  </p>
                  <button
                    onClick={() =>
                      setFormData({
                        ...formData,
                        exampleDialogue: formData.exampleDialogue?.filter((_, j) => j !== i),
                      })
                    }
                    className="p-1 hover:bg-red-100 rounded"
                  >
                    <XIcon className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDialogue}
                  onChange={(e) => setNewDialogue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addDialogue()}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Add example dialogue"
                />
                <button
                  onClick={addDialogue}
                  className="px-3 py-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
          >
            Save Character
          </button>
        </div>
      </div>
    </div>
  );
}

// Template selector modal
function TemplateSelector({
  onSelect,
  onClose,
}: {
  onSelect: (template: typeof CHARACTER_TEMPLATES[0]) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Character Templates</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <XIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {CHARACTER_TEMPLATES.map((template, i) => (
            <button
              key={i}
              onClick={() => onSelect(template)}
              className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors"
            >
              <p className="font-medium text-gray-900">{template.name}</p>
              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
              <div className="flex gap-1 mt-2">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Export default settings creator
export function useRoleplaySettings(
  initial?: Partial<RoleplaySettings>
): [RoleplaySettings, (settings: RoleplaySettings) => void] {
  const [settings, setSettings] = useState<RoleplaySettings>({
    ...DEFAULT_ROLEPLAY_SETTINGS,
    ...initial,
  });

  useEffect(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem("spring_roleplay_settings");
    if (saved) {
      try {
        setSettings({ ...DEFAULT_ROLEPLAY_SETTINGS, ...JSON.parse(saved) });
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const updateSettings = (newSettings: RoleplaySettings) => {
    setSettings(newSettings);
    localStorage.setItem("spring_roleplay_settings", JSON.stringify(newSettings));
  };

  return [settings, updateSettings];
}

// Icons
function MaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}
