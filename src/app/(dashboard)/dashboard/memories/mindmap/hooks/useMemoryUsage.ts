"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";

// =============================================================================
// Types
// =============================================================================

export interface MemoryUsage {
  id: string;
  usageType: "recalled" | "cited" | "influenced" | "rejected";
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  agentId?: string;
  relevanceScore?: number;
  outcome?: "success" | "failure" | "unknown";
  feedback?: "positive" | "negative" | "neutral";
  feedbackReason?: string;
  queryText?: string;
  responseSnippet?: string;
  createdAt: string;
}

export interface MemoryUsageStats {
  totalUsages: number;
  recallCount: number;
  citedCount: number;
  successRate: number;
  positiveRate: number;
  negativeRate: number;
  lastUsedAt?: string;
  avgRelevanceScore?: number;
}

export interface UsageResponse {
  success: boolean;
  usage: MemoryUsage[];
  stats: MemoryUsageStats;
  total: number;
}

// =============================================================================
// Hook
// =============================================================================

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useMemoryUsage(noteId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<UsageResponse>(
    noteId ? `/api/spring/memory/${noteId}/usage?limit=20` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const recordUsage = useCallback(
    async (input: {
      usageType: "recalled" | "cited" | "influenced" | "rejected";
      traceId?: string;
      queryText?: string;
    }) => {
      if (!noteId) return;

      await fetch(`/api/spring/memory/${noteId}/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      mutate();
    },
    [noteId, mutate]
  );

  return {
    usage: data?.usage || [],
    stats: data?.stats || {
      totalUsages: 0,
      recallCount: 0,
      citedCount: 0,
      successRate: 0,
      positiveRate: 0,
      negativeRate: 0,
    },
    isLoading,
    error,
    recordUsage,
    refresh: mutate,
  };
}

// =============================================================================
// Usage Heatmap Calculation
// =============================================================================

export type HeatLevel = "hot" | "warm" | "cold" | "unused";

export function calculateHeatLevel(stats: MemoryUsageStats): HeatLevel {
  // Based on usage frequency and success rate
  if (stats.totalUsages === 0) return "unused";

  const recencyScore = stats.lastUsedAt
    ? Math.max(0, 1 - (Date.now() - new Date(stats.lastUsedAt).getTime()) / (30 * 24 * 60 * 60 * 1000))
    : 0;

  const usageScore = Math.min(1, stats.totalUsages / 10);
  const successScore = stats.successRate;

  const combinedScore = (recencyScore * 0.3 + usageScore * 0.4 + successScore * 0.3);

  if (combinedScore > 0.7) return "hot";
  if (combinedScore > 0.4) return "warm";
  return "cold";
}

export function getHeatColor(level: HeatLevel): string {
  switch (level) {
    case "hot":
      return "rgba(239, 68, 68, 0.6)"; // red
    case "warm":
      return "rgba(249, 115, 22, 0.5)"; // orange
    case "cold":
      return "rgba(59, 130, 246, 0.4)"; // blue
    case "unused":
      return "rgba(156, 163, 175, 0.3)"; // gray
  }
}
