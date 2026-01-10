"use client";

import { useState, useEffect, useCallback } from "react";
import type { AIModel } from "@/lib/spring/types";
import { recommendModel, getQueryTypeLabel, type ModelRecommendation } from "@/lib/spring/model-recommender";

interface ModelRecommendationProps {
  query: string;
  currentModel: AIModel;
  onSelectModel: (model: AIModel) => void;
  hasImage?: boolean;
  className?: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function ModelRecommendation({
  query,
  currentModel,
  onSelectModel,
  hasImage = false,
  className = "",
}: ModelRecommendationProps) {
  const [recommendation, setRecommendation] = useState<ModelRecommendation | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Debounce query to avoid excessive calculations
  const debouncedQuery = useDebounce(query, 500);

  // Calculate recommendation
  useEffect(() => {
    if (debouncedQuery.length < 10 || isDismissed) {
      setIsVisible(false);
      return;
    }

    const result = recommendModel(debouncedQuery, {
      hasImage,
      preferCost: 'balanced',
    });

    // Only show if recommendation differs from current model
    if (result.model !== currentModel && result.confidence !== 'low') {
      setRecommendation(result);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [debouncedQuery, currentModel, hasImage, isDismissed]);

  // Reset dismissed state when query changes significantly
  useEffect(() => {
    if (isDismissed && debouncedQuery.length < 5) {
      setIsDismissed(false);
    }
  }, [debouncedQuery, isDismissed]);

  const handleAccept = useCallback(() => {
    if (recommendation) {
      onSelectModel(recommendation.model);
      setIsVisible(false);
    }
  }, [recommendation, onSelectModel]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    setIsVisible(false);
  }, []);

  if (!isVisible || !recommendation) return null;

  return (
    <div className={`animate-in fade-in slide-in-from-bottom-2 duration-200 ${className}`}>
      <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
        {/* Icon */}
        <div className="flex-shrink-0">
          <LightbulbIcon className="w-4 h-4 text-blue-500" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-700">
            <span className="font-medium">{getQueryTypeLabel(recommendation.queryType)}</span>
            {" detected • "}
            <span className="font-medium">{getModelDisplayName(recommendation.model)}</span>
            {" recommended"}
          </p>
          <p className="text-xs text-blue-600/70 mt-0.5">
            {recommendation.reason}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleAccept}
            className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
          >
            Switch
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alternatives (collapsed by default) */}
      {recommendation.alternatives.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          <span>Also consider:</span>
          {recommendation.alternatives.slice(0, 2).map((alt) => (
            <button
              key={alt.model}
              onClick={() => onSelectModel(alt.model)}
              className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
            >
              {getModelDisplayName(alt.model)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline model badge for compact display
interface ModelBadgeProps {
  model: AIModel;
  queryType?: string;
  onClick?: () => void;
}

export function ModelBadge({ model, queryType, onClick }: ModelBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-xs text-gray-700 transition-colors"
    >
      <span className={`w-2 h-2 rounded-full ${getModelColor(model)}`} />
      <span>{getModelDisplayName(model)}</span>
      {queryType && (
        <span className="text-gray-400">• {queryType}</span>
      )}
    </button>
  );
}

// Helper functions
function getModelDisplayName(model: AIModel): string {
  const names: Partial<Record<AIModel, string>> = {
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4o': 'GPT-4o',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-5': 'GPT-5',
    'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
    'claude-3-5-haiku-20241022': 'Haiku 3.5',
    'claude-3-opus-20240229': 'Opus 3',
    'claude-opus-4-20250514': 'Opus 4',
    'gemini-2.0-flash-exp': 'Gemini Flash',
    'gemini-1.5-pro': 'Gemini Pro',
    'o1-preview': 'o1 Preview',
    'o1-mini': 'o1 Mini',
    'o3-mini': 'o3 Mini',
    'deepseek-chat': 'DeepSeek V3',
    'deepseek-reasoner': 'DeepSeek R1',
    'mistral-large-latest': 'Mistral Large',
    'mistral-small-latest': 'Mistral Small',
    'codestral-latest': 'Codestral',
    'grok-2': 'Grok 2',
    'grok-2-vision': 'Grok Vision',
  };
  return names[model] || model;
}

function getModelColor(model: AIModel): string {
  if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) {
    return 'bg-emerald-500';
  }
  if (model.includes('claude')) {
    return 'bg-orange-500';
  }
  if (model.includes('gemini')) {
    return 'bg-blue-500';
  }
  if (model.includes('deepseek')) {
    return 'bg-indigo-500';
  }
  if (model.includes('mistral') || model.includes('codestral')) {
    return 'bg-rose-500';
  }
  if (model.includes('grok')) {
    return 'bg-gray-700';
  }
  return 'bg-gray-400';
}

// Icons
function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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
