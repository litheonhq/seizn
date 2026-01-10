"use client";

import { useState, useEffect } from "react";
import type { Plan } from "@/lib/spring/types";

interface QuotaData {
  plan: {
    name: Plan;
    quotas: {
      gpt4o_mini_daily: number;
      gpt4o_daily: number;
      gpt5_daily: number;
      claude_sonnet_daily: number;
      claude_opus_daily: number;
      gemini_daily: number;
    };
  };
  today: {
    remaining: {
      gpt4o_mini: number;
      gpt4o: number;
      gpt5: number;
      claude_sonnet: number;
      claude_opus: number;
      gemini: number;
    };
    percentage: {
      gpt4o_mini: number;
      gpt4o: number;
      gpt5: number;
      claude_sonnet: number;
      claude_opus: number;
      gemini: number;
    };
  };
}

interface QuotaDisplayProps {
  compact?: boolean;
  className?: string;
}

// Model display configs with provider colors
const MODEL_DISPLAY = {
  gpt4o_mini: { name: "GPT-4o Mini", color: "bg-emerald-500", provider: "OpenAI" },
  gpt4o: { name: "GPT-4o", color: "bg-emerald-600", provider: "OpenAI" },
  gpt5: { name: "GPT-5", color: "bg-emerald-700", provider: "OpenAI" },
  claude_sonnet: { name: "Sonnet", color: "bg-orange-500", provider: "Anthropic" },
  claude_opus: { name: "Opus", color: "bg-orange-600", provider: "Anthropic" },
  gemini: { name: "Gemini", color: "bg-blue-500", provider: "Google" },
} as const;

export function QuotaDisplay({ compact = false, className = "" }: QuotaDisplayProps) {
  const [data, setData] = useState<QuotaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetchQuota();
    // Refresh every 30 seconds
    const interval = setInterval(fetchQuota, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchQuota() {
    try {
      const res = await fetch("/api/spring/usage?history=false");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch quota:", error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-16 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  // Filter to only show models user has access to (quota > 0 or unlimited)
  const availableModels = Object.entries(MODEL_DISPLAY).filter(([key]) => {
    const quota = data.plan.quotas[`${key}_daily` as keyof typeof data.plan.quotas];
    return quota !== 0;
  });

  // Calculate overall usage percentage
  const overallUsage = Math.round(
    availableModels.reduce((sum, [key]) => {
      const pct = data.today.percentage[key as keyof typeof data.today.percentage] || 0;
      return sum + pct;
    }, 0) / availableModels.length
  );

  if (compact) {
    return (
      <div className={`${className}`}>
        {/* Compact view - shows overall usage bar */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <QuotaIcon className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Today&apos;s Quota</span>
            </div>
            <span className="text-xs text-gray-500">{100 - overallUsage}% left</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                overallUsage > 80 ? "bg-red-500" : overallUsage > 50 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${overallUsage}%` }}
            />
          </div>
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
              {availableModels.map(([key, config]) => {
                const remaining = data.today.remaining[key as keyof typeof data.today.remaining];
                const limit = data.plan.quotas[`${key}_daily` as keyof typeof data.plan.quotas];
                const isUnlimited = limit === -1;

                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${config.color}`} />
                      <span className="text-gray-600">{config.name}</span>
                    </div>
                    <span className="text-gray-500">
                      {isUnlimited ? "∞" : remaining}/{isUnlimited ? "∞" : limit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </button>
      </div>
    );
  }

  // Full view
  return (
    <div className={`p-4 bg-white rounded-xl border border-gray-200 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Today&apos;s Quota</h3>
        <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
          {data.plan.name.charAt(0).toUpperCase() + data.plan.name.slice(1)} Plan
        </span>
      </div>

      <div className="space-y-3">
        {availableModels.map(([key, config]) => {
          const remaining = data.today.remaining[key as keyof typeof data.today.remaining];
          const percentage = data.today.percentage[key as keyof typeof data.today.percentage];
          const limit = data.plan.quotas[`${key}_daily` as keyof typeof data.plan.quotas];
          const isUnlimited = limit === -1;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                  <span className="text-sm text-gray-700">{config.name}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {isUnlimited ? (
                    <span className="text-emerald-600">∞</span>
                  ) : (
                    <>
                      <span className={remaining === 0 ? "text-red-500 font-medium" : ""}>
                        {remaining}
                      </span>
                      <span className="text-gray-400">/{limit}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${config.color}`}
                  style={{ width: isUnlimited ? "5%" : `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Warning if any quota is low */}
      {availableModels.some(([key]) => {
        const pct = data.today.percentage[key as keyof typeof data.today.percentage];
        return pct > 80;
      }) && (
        <div className="mt-4 p-2 bg-amber-50 rounded-lg flex items-center gap-2">
          <WarningIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            Some quotas are running low. Auto-fallback will switch to available models.
          </p>
        </div>
      )}
    </div>
  );
}

// Icons
function QuotaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
