"use client";

import { useState, useEffect, useCallback } from "react";
import type { AIModel } from "@/lib/spring/types";

interface CostMeterProps {
  inputTokens?: number;
  outputTokens?: number;
  model?: AIModel;
  isStreaming?: boolean;
  className?: string;
}

// Model pricing per 1K tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-5": { input: 0.005, output: 0.015 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku-20241022": { input: 0.0008, output: 0.004 },
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
  "claude-opus-4-20250514": { input: 0.015, output: 0.075 },
  "gemini-2.0-flash-exp": { input: 0.0, output: 0.0 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "o1-preview": { input: 0.015, output: 0.06 },
  "o1-mini": { input: 0.003, output: 0.012 },
  "o3-mini": { input: 0.0011, output: 0.0044 },
  "deepseek-chat": { input: 0.00014, output: 0.00028 },
  "deepseek-reasoner": { input: 0.00055, output: 0.00219 },
  "mistral-large-latest": { input: 0.002, output: 0.006 },
  "mistral-small-latest": { input: 0.0002, output: 0.0006 },
  "codestral-latest": { input: 0.0003, output: 0.0009 },
  "grok-2": { input: 0.002, output: 0.01 },
  "grok-2-vision": { input: 0.002, output: 0.01 },
};

function calculateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

function formatCost(cost: number): string {
  if (cost === 0) return "Free";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

export function CostMeter({
  inputTokens = 0,
  outputTokens = 0,
  model = "gpt-4o-mini",
  isStreaming = false,
  className = "",
}: CostMeterProps) {
  const [displayTokens, setDisplayTokens] = useState({ input: 0, output: 0 });

  // Animate token counter when streaming
  useEffect(() => {
    if (isStreaming) {
      // Smooth animation for streaming
      const targetInput = inputTokens;
      const targetOutput = outputTokens;

      const animate = () => {
        setDisplayTokens((prev) => ({
          input: prev.input + Math.ceil((targetInput - prev.input) * 0.3),
          output: prev.output + Math.ceil((targetOutput - prev.output) * 0.3),
        }));
      };

      const interval = setInterval(animate, 50);
      return () => clearInterval(interval);
    } else {
      setDisplayTokens({ input: inputTokens, output: outputTokens });
    }
  }, [inputTokens, outputTokens, isStreaming]);

  const totalTokens = displayTokens.input + displayTokens.output;
  const cost = calculateCost(model, displayTokens.input, displayTokens.output);

  if (totalTokens === 0) return null;

  return (
    <div className={`inline-flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-lg text-xs ${className}`}>
      {/* Token counter */}
      <div className="flex items-center gap-1.5">
        <TokenIcon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-gray-600">
          <span className="font-medium">{formatTokens(totalTokens)}</span>
          <span className="text-gray-400 ml-1">tokens</span>
        </span>
      </div>

      <div className="w-px h-3 bg-gray-200" />

      {/* Cost display */}
      <div className="flex items-center gap-1.5">
        <CostIcon className="w-3.5 h-3.5 text-gray-400" />
        <span className={`font-medium ${cost === 0 ? "text-emerald-600" : "text-gray-700"}`}>
          {formatCost(cost)}
        </span>
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}

// Conversation-level cost tracker
interface SessionCostTrackerProps {
  className?: string;
}

interface UsageData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  messageCount: number;
}

export function SessionCostTracker({ className = "" }: SessionCostTrackerProps) {
  const [usage, setUsage] = useState<UsageData>({
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    messageCount: 0,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const updateUsage = useCallback((data: Partial<UsageData>) => {
    setUsage((prev) => ({
      ...prev,
      ...data,
      totalInputTokens: prev.totalInputTokens + (data.totalInputTokens || 0),
      totalOutputTokens: prev.totalOutputTokens + (data.totalOutputTokens || 0),
      totalCost: prev.totalCost + (data.totalCost || 0),
      messageCount: prev.messageCount + (data.messageCount || 0),
    }));
  }, []);

  // Expose updateUsage globally for chat components
  useEffect(() => {
    (window as unknown as { updateSessionCost?: typeof updateUsage }).updateSessionCost = updateUsage;
    return () => {
      delete (window as unknown as { updateSessionCost?: typeof updateUsage }).updateSessionCost;
    };
  }, [updateUsage]);

  if (usage.messageCount === 0) return null;

  const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;

  return (
    <div className={`${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-xs"
      >
        <ChartIcon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-gray-600">
          Session: <span className="font-medium text-gray-800">{formatCost(usage.totalCost)}</span>
        </span>
        <ChevronIcon className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {isExpanded && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Messages</span>
            <span className="text-gray-700 font-medium">{usage.messageCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Input tokens</span>
            <span className="text-gray-700">{formatTokens(usage.totalInputTokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Output tokens</span>
            <span className="text-gray-700">{formatTokens(usage.totalOutputTokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total tokens</span>
            <span className="text-gray-700 font-medium">{formatTokens(totalTokens)}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 flex justify-between">
            <span className="text-gray-600 font-medium">Total cost</span>
            <span className="text-gray-800 font-semibold">{formatCost(usage.totalCost)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function TokenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function CostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
