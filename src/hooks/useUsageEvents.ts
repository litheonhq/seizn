'use client';

/**
 * useUsageEvents Hook
 *
 * Provides real-time updates for memory usage events (views, searches, context use).
 *
 * @module hooks/useUsageEvents
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  subscribeToUsageEvents,
  subscribeToMemoryUsage,
  type RealtimeUsageEvent,
  type UsageEventType,
} from '@/lib/realtime';

// =============================================================================
// Types
// =============================================================================

export interface UsageStats {
  totalEvents: number;
  viewCount: number;
  searchCount: number;
  contextCount: number;
  recallCount: number;
  linkCount: number;
  recentEvents: RealtimeUsageEvent[];
}

export interface UseUsageEventsOptions {
  /** User ID to track usage for */
  userId: string;
  /** Whether tracking is enabled */
  enabled?: boolean;
  /** Maximum number of recent events to keep */
  maxRecentEvents?: number;
  /** Callback when any event occurs */
  onEvent?: (event: RealtimeUsageEvent) => void;
  /** Callback when a memory is viewed */
  onView?: (memoryId: string) => void;
  /** Callback when a memory appears in search */
  onSearchResult?: (memoryId: string, rank: number) => void;
  /** Callback when a memory is used in context */
  onContextUsed?: (memoryId: string) => void;
}

export interface UseUsageEventsReturn {
  /** Aggregated usage statistics */
  stats: UsageStats;
  /** Whether connected to realtime */
  isConnected: boolean;
  /** Reset statistics */
  resetStats: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

const initialStats: UsageStats = {
  totalEvents: 0,
  viewCount: 0,
  searchCount: 0,
  contextCount: 0,
  recallCount: 0,
  linkCount: 0,
  recentEvents: [],
};

/**
 * Hook for tracking real-time memory usage events
 *
 * @example
 * ```tsx
 * function UsageAnalytics() {
 *   const { stats, isConnected } = useUsageEvents({
 *     userId: session.user.id,
 *     onContextUsed: (memoryId) => {
 *       console.log(`Memory ${memoryId} used in AI context`);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <span>Views: {stats.viewCount}</span>
 *       <span>Searches: {stats.searchCount}</span>
 *       <span>Context Uses: {stats.contextCount}</span>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUsageEvents({
  userId,
  enabled = true,
  maxRecentEvents = 50,
  onEvent,
  onView,
  onSearchResult,
  onContextUsed,
}: UseUsageEventsOptions): UseUsageEventsReturn {
  const [stats, setStats] = useState<UsageStats>(initialStats);
  const [isConnected, setIsConnected] = useState(false);

  // Refs for callbacks
  const onEventRef = useRef(onEvent);
  const onViewRef = useRef(onView);
  const onSearchResultRef = useRef(onSearchResult);
  const onContextUsedRef = useRef(onContextUsed);

  useEffect(() => {
    onEventRef.current = onEvent;
    onViewRef.current = onView;
    onSearchResultRef.current = onSearchResult;
    onContextUsedRef.current = onContextUsed;
  }, [onEvent, onView, onSearchResult, onContextUsed]);

  // Reset stats
  const resetStats = useCallback(() => {
    setStats(initialStats);
  }, []);

  // Subscribe to usage events
  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false);
      return;
    }

    const unsubscribe = subscribeToUsageEvents(userId, {
      onEvent: (event) => {
        onEventRef.current?.(event);

        // Update stats
        setStats((prev) => ({
          ...prev,
          totalEvents: prev.totalEvents + 1,
          viewCount:
            event.event_type === 'view' ? prev.viewCount + 1 : prev.viewCount,
          searchCount:
            event.event_type === 'search_result'
              ? prev.searchCount + 1
              : prev.searchCount,
          contextCount:
            event.event_type === 'context_used'
              ? prev.contextCount + 1
              : prev.contextCount,
          recallCount:
            event.event_type === 'explicit_recall'
              ? prev.recallCount + 1
              : prev.recallCount,
          linkCount:
            event.event_type === 'linked_access'
              ? prev.linkCount + 1
              : prev.linkCount,
          recentEvents: [event, ...prev.recentEvents.slice(0, maxRecentEvents - 1)],
        }));
      },
      onView: (event, memoryId) => {
        onViewRef.current?.(memoryId);
      },
      onSearchResult: (event, memoryId, rank) => {
        onSearchResultRef.current?.(memoryId, rank);
      },
      onContextUsed: (event, memoryId) => {
        onContextUsedRef.current?.(memoryId);
      },
    });

    setIsConnected(true);

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [userId, enabled, maxRecentEvents]);

  return {
    stats,
    isConnected,
    resetStats,
  };
}

// =============================================================================
// Memory-specific Usage Hook
// =============================================================================

export interface UseMemoryUsageOptions {
  memoryId: string;
  enabled?: boolean;
  onUsed?: (eventType: UsageEventType) => void;
}

export interface UseMemoryUsageReturn {
  /** Total usage count */
  usageCount: number;
  /** View count */
  viewCount: number;
  /** Last used timestamp */
  lastUsedAt: Date | null;
  /** Whether connected */
  isConnected: boolean;
}

/**
 * Hook for tracking usage of a specific memory
 */
export function useMemoryUsage({
  memoryId,
  enabled = true,
  onUsed,
}: UseMemoryUsageOptions): UseMemoryUsageReturn {
  const [usageCount, setUsageCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [lastUsedAt, setLastUsedAt] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const onUsedRef = useRef(onUsed);
  useEffect(() => {
    onUsedRef.current = onUsed;
  }, [onUsed]);

  useEffect(() => {
    if (!enabled || !memoryId) {
      setIsConnected(false);
      return;
    }

    const unsubscribe = subscribeToMemoryUsage(memoryId, {
      onEvent: (event) => {
        setUsageCount((prev) => prev + 1);
        setLastUsedAt(new Date(event.created_at));
        onUsedRef.current?.(event.event_type);
      },
      onView: () => {
        setViewCount((prev) => prev + 1);
      },
    });

    setIsConnected(true);

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [memoryId, enabled]);

  return {
    usageCount,
    viewCount,
    lastUsedAt,
    isConnected,
  };
}
