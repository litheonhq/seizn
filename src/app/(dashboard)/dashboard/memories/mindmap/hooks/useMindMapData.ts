"use client";

import { useState, useEffect, useCallback } from "react";
import type { MindMapResponse, MindMapQuery } from "@/lib/spring/memory-v3/types";

// ============================================
// Types
// ============================================

interface UseMindMapDataOptions {
  /** Initial query parameters */
  query?: Partial<MindMapQuery>;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Polling interval in ms (0 to disable) */
  pollInterval?: number;
}

interface UseMindMapDataReturn {
  /** The fetched mind map data */
  data: MindMapResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Update query parameters and refetch */
  updateQuery: (query: Partial<MindMapQuery>) => void;
  /** Current query parameters */
  query: Partial<MindMapQuery>;
}

// ============================================
// Default Query
// ============================================

const defaultQuery: Partial<MindMapQuery> = {
  maxDepth: 3,
  maxNodes: 100,
  minEdgeWeight: 0.3,
  includeEntities: true,
  includeClusters: false,
};

// ============================================
// Mock Data Generator (for development)
// ============================================

function generateMockData(): MindMapResponse {
  const noteTypes = ["fact", "preference", "instruction", "episode", "procedure", "relationship"] as const;
  const noteStatuses = ["candidate", "active", "superseded", "contradicted"] as const;
  const privacyClasses = ["public", "internal", "confidential", "restricted"] as const;
  const edgeTypes = ["similar", "supersedes", "contradicts", "derived_from", "mentions_entity", "part_of_cluster"] as const;

  const nodes: MindMapResponse["nodes"] = [];
  const edges: MindMapResponse["edges"] = [];

  // Generate random nodes
  const nodeCount = 15 + Math.floor(Math.random() * 10);
  for (let i = 0; i < nodeCount; i++) {
    const type = noteTypes[Math.floor(Math.random() * noteTypes.length)];
    const status = noteStatuses[Math.floor(Math.random() * noteStatuses.length)];
    const privacyClass = privacyClasses[Math.floor(Math.random() * privacyClasses.length)];

    const contents = [
      "User prefers dark mode in all applications",
      "Always use TypeScript for new projects",
      "Customer meeting scheduled for Friday at 2pm",
      "Project deadline extended to March 15th",
      "Use React Query for server state management",
      "Coffee preferences: cappuccino with oat milk",
      "Important: Review PR #234 before merge",
      "Budget approval pending for Q2 initiative",
      "Team standup moved to 10am daily",
      "API rate limits set to 1000 req/min",
      "Database migration completed successfully",
      "New feature request from enterprise client",
      "Security audit findings need resolution",
      "Performance optimization reduced load time by 40%",
      "User onboarding flow needs improvement",
      "Integration with Slack workspace enabled",
      "Weekly report due every Friday by 5pm",
      "Backup policy: daily incremental, weekly full",
      "Code review requires 2 approvals minimum",
      "Deployment window: Tue-Thu, 2-4pm only",
    ];

    nodes.push({
      id: `node-${i}`,
      type: "note",
      label: contents[i % contents.length].substring(0, 30) + "...",
      content: contents[i % contents.length],
      note: {
        id: `note-${i}`,
        content: contents[i % contents.length],
        type,
        status,
        scope: "user",
        privacyClass,
        userId: "user-1",
        provenance: {
          source: {
            type: "conversation",
            extractedAt: new Date(),
          },
          createdBy: "system",
        },
        salience: {
          score: 0.3 + Math.random() * 0.7,
          calculatedAt: new Date(),
        },
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        version: 1,
      },
      depth: Math.floor(Math.random() * 3),
      relevance: 0.5 + Math.random() * 0.5,
    });
  }

  // Generate random edges
  const edgeCount = Math.floor(nodeCount * 1.2);
  const usedPairs = new Set<string>();

  for (let i = 0; i < edgeCount; i++) {
    const sourceIdx = Math.floor(Math.random() * nodeCount);
    let targetIdx = Math.floor(Math.random() * nodeCount);

    // Ensure no self-loops and no duplicate edges
    while (targetIdx === sourceIdx || usedPairs.has(`${sourceIdx}-${targetIdx}`)) {
      targetIdx = Math.floor(Math.random() * nodeCount);
    }
    usedPairs.add(`${sourceIdx}-${targetIdx}`);

    const edgeType = edgeTypes[Math.floor(Math.random() * edgeTypes.length)];

    edges.push({
      sourceId: `node-${sourceIdx}`,
      targetId: `node-${targetIdx}`,
      type: edgeType,
      weight: 0.3 + Math.random() * 0.7,
      label: edgeType,
    });
  }

  return {
    nodes,
    edges,
    centerId: "node-0",
    stats: {
      totalNotes: nodeCount,
      totalEntities: 0,
      totalClusters: 0,
      maxDepthReached: 3,
      truncated: false,
    },
  };
}

// ============================================
// Hook Implementation
// ============================================

export function useMindMapData(options: UseMindMapDataOptions = {}): UseMindMapDataReturn {
  const {
    query: initialQuery = defaultQuery,
    autoFetch = true,
    pollInterval = 0,
  } = options;

  const [data, setData] = useState<MindMapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [query, setQuery] = useState<Partial<MindMapQuery>>(initialQuery);

  // Fetch function
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Build query string
      const params = new URLSearchParams();
      if (query.centerId) params.set("centerId", query.centerId);
      if (query.centerEntityId) params.set("centerEntityId", query.centerEntityId);
      if (query.semanticQuery) params.set("semanticQuery", query.semanticQuery);
      if (query.maxDepth !== undefined) params.set("maxDepth", String(query.maxDepth));
      if (query.maxNodes !== undefined) params.set("maxNodes", String(query.maxNodes));
      if (query.minEdgeWeight !== undefined) params.set("minEdgeWeight", String(query.minEdgeWeight));
      if (query.edgeTypes?.length) params.set("edgeTypes", query.edgeTypes.join(","));
      if (query.noteTypes?.length) params.set("noteTypes", query.noteTypes.join(","));
      if (query.includeEntities !== undefined) params.set("includeEntities", String(query.includeEntities));
      if (query.includeClusters !== undefined) params.set("includeClusters", String(query.includeClusters));

      const response = await fetch(`/api/memories/mindmap?${params.toString()}`);

      if (!response.ok) {
        // If API doesn't exist yet, use mock data in development
        if (response.status === 404 && process.env.NODE_ENV === "development") {
          console.warn("Mind map API not found, using mock data");
          const mockData = generateMockData();
          setData(mockData);
          return;
        }
        throw new Error(`Failed to fetch mind map data: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
      } else if (result.nodes && result.edges) {
        // Direct response format
        setData(result);
      } else {
        throw new Error(result.error || "Invalid response format");
      }
    } catch (err) {
      console.error("Failed to fetch mind map data:", err);

      // Use mock data in development for better DX
      if (process.env.NODE_ENV === "development") {
        console.warn("Using mock data due to fetch error");
        const mockData = generateMockData();
        setData(mockData);
      } else {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);

  // Polling
  useEffect(() => {
    if (pollInterval > 0) {
      const interval = setInterval(fetchData, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval, fetchData]);

  // Update query
  const updateQuery = useCallback((newQuery: Partial<MindMapQuery>) => {
    setQuery((prev) => ({ ...prev, ...newQuery }));
  }, []);

  // Refetch
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch,
    updateQuery,
    query,
  };
}

export default useMindMapData;
