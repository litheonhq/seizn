"use client";

import { useState, useRef, useEffect } from "react";
import type { AIModel } from "@/lib/spring/types";

interface ModelSelectorProps {
  selectedModel: AIModel;
  onSelect: (model: AIModel) => void;
}

interface ModelInfo {
  id: AIModel;
  name: string;
  provider: string;
  description: string;
  icon: string;
  tier: string;
}

const MODELS: ModelInfo[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    description: "Fast and affordable",
    icon: "🟢",
    tier: "free",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Most capable",
    icon: "🟢",
    tier: "starter",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "Balanced & smart",
    icon: "🟠",
    tier: "starter",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "Anthropic",
    description: "Fast & efficient",
    icon: "🟠",
    tier: "free",
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    description: "Most powerful",
    icon: "🟠",
    tier: "plus",
  },
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    description: "Latest & fast",
    icon: "🔵",
    tier: "starter",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "Google",
    description: "Long context",
    icon: "🔵",
    tier: "plus",
  },
];

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <span>{selected.icon}</span>
        <span className="text-sm font-medium text-gray-700">{selected.name}</span>
        <ChevronIcon className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Select Model
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onSelect(model.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors
                  ${selectedModel === model.id ? "bg-pink-50" : ""}
                `}
              >
                <span className="text-lg">{model.icon}</span>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {model.name}
                    </span>
                    <TierBadge tier={model.tier} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {model.provider} · {model.description}
                  </p>
                </div>
                {selectedModel === model.id && (
                  <CheckIcon className="w-5 h-5 text-pink-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    free: "bg-green-100 text-green-700",
    starter: "bg-blue-100 text-blue-700",
    plus: "bg-purple-100 text-purple-700",
    pro: "bg-pink-100 text-pink-700",
  };

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[tier] || colors.free}`}>
      {tier.toUpperCase()}
    </span>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
