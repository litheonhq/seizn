/**
 * Usage Event Realtime Subscriptions
 *
 * Provides subscriptions to spring_memory_usage_events for tracking
 * memory access patterns and updating UI accordingly.
 *
 * @module lib/realtime/usage-subscriptions
 */

import { subscribeToTable } from './core';
import type { RealtimeUsageEvent, InsertCallback, RealtimeCallbacks } from './types';

// =============================================================================
// Types
// =============================================================================

export type { RealtimeUsageEvent };
export type UsageEventType = RealtimeUsageEvent['event_type'];

export interface UsageCallbacks {
  /** Called when any usage event is created */
  onEvent?: InsertCallback<RealtimeUsageEvent>;
  /** Called when a memory is viewed */
  onView?: (event: RealtimeUsageEvent, memoryId: string) => void;
  /** Called when a memory appears in search results */
  onSearchResult?: (event: RealtimeUsageEvent, memoryId: string, rank: number) => void;
  /** Called when a memory is used in context */
  onContextUsed?: (event: RealtimeUsageEvent, memoryId: string) => void;
  /** Called when a memory is explicitly recalled */
  onRecall?: (event: RealtimeUsageEvent, memoryId: string) => void;
  /** Called when a memory is accessed via link */
  onLinkedAccess?: (event: RealtimeUsageEvent, memoryId: string) => void;
}

export interface UsageStats {
  totalEvents: number;
  viewCount: number;
  searchCount: number;
  contextCount: number;
  recallCount: number;
  linkCount: number;
  lastEventAt: Date | null;
}

// =============================================================================
// Subscription Functions
// =============================================================================

/**
 * Subscribe to usage events for a user
 *
 * @example
 * ```ts
 * const unsubscribe = subscribeToUsageEvents('user-123', {
 *   onView: (event, memoryId) => {
 *     // Update view count in UI
 *     updateMemoryViewCount(memoryId);
 *   },
 *   onSearchResult: (event, memoryId, rank) => {
 *     console.log(`Memory ${memoryId} appeared at rank ${rank}`);
 *   },
 * });
 * ```
 */
export function subscribeToUsageEvents(
  userId: string,
  callbacks: UsageCallbacks
): () => void {
  return subscribeToTable<RealtimeUsageEvent>(
    {
      table: 'spring_memory_usage_events',
      filter: `user_id=eq.${userId}`,
      events: ['INSERT'], // Usage events are write-once
    },
    {
      onInsert: (event) => {
        // Call generic callback
        callbacks.onEvent?.(event);

        // Route to specific callbacks based on event type
        const memoryId = event.memory_id;
        if (!memoryId) return;

        switch (event.event_type) {
          case 'view':
            callbacks.onView?.(event, memoryId);
            break;
          case 'search_result':
            callbacks.onSearchResult?.(event, memoryId, event.relevance_rank ?? 0);
            break;
          case 'context_used':
            callbacks.onContextUsed?.(event, memoryId);
            break;
          case 'explicit_recall':
            callbacks.onRecall?.(event, memoryId);
            break;
          case 'linked_access':
            callbacks.onLinkedAccess?.(event, memoryId);
            break;
        }
      },
    }
  );
}

/**
 * Subscribe to usage events for a specific memory
 */
export function subscribeToMemoryUsage(
  memoryId: string,
  callbacks: UsageCallbacks
): () => void {
  return subscribeToTable<RealtimeUsageEvent>(
    {
      table: 'spring_memory_usage_events',
      filter: `memory_id=eq.${memoryId}`,
      events: ['INSERT'],
    },
    {
      onInsert: (event) => {
        callbacks.onEvent?.(event);

        switch (event.event_type) {
          case 'view':
            callbacks.onView?.(event, memoryId);
            break;
          case 'search_result':
            callbacks.onSearchResult?.(event, memoryId, event.relevance_rank ?? 0);
            break;
          case 'context_used':
            callbacks.onContextUsed?.(event, memoryId);
            break;
          case 'explicit_recall':
            callbacks.onRecall?.(event, memoryId);
            break;
          case 'linked_access':
            callbacks.onLinkedAccess?.(event, memoryId);
            break;
        }
      },
    }
  );
}

/**
 * Subscribe to search-related usage events only
 * Useful for updating search analytics in real-time
 */
export function subscribeToSearchEvents(
  userId: string,
  callback: (event: RealtimeUsageEvent) => void
): () => void {
  return subscribeToTable<RealtimeUsageEvent>(
    {
      table: 'spring_memory_usage_events',
      filter: `user_id=eq.${userId},event_type=eq.search_result`,
      events: ['INSERT'],
    },
    {
      onInsert: callback,
    }
  );
}

/**
 * Subscribe to context usage events only
 * Useful for showing which memories are being used in AI context
 */
export function subscribeToContextEvents(
  userId: string,
  callback: (event: RealtimeUsageEvent) => void
): () => void {
  return subscribeToTable<RealtimeUsageEvent>(
    {
      table: 'spring_memory_usage_events',
      filter: `user_id=eq.${userId},event_type=eq.context_used`,
      events: ['INSERT'],
    },
    {
      onInsert: callback,
    }
  );
}

/**
 * Subscribe to session-specific usage events
 */
export function subscribeToSessionUsage(
  sessionId: string,
  callbacks: UsageCallbacks
): () => void {
  return subscribeToTable<RealtimeUsageEvent>(
    {
      table: 'spring_memory_usage_events',
      filter: `session_id=eq.${sessionId}`,
      events: ['INSERT'],
    },
    {
      onInsert: (event) => {
        callbacks.onEvent?.(event);

        const memoryId = event.memory_id;
        if (!memoryId) return;

        switch (event.event_type) {
          case 'view':
            callbacks.onView?.(event, memoryId);
            break;
          case 'search_result':
            callbacks.onSearchResult?.(event, memoryId, event.relevance_rank ?? 0);
            break;
          case 'context_used':
            callbacks.onContextUsed?.(event, memoryId);
            break;
        }
      },
    }
  );
}
