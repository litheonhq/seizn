/**
 * Memory-specific Realtime Subscriptions
 *
 * Provides specialized hooks and utilities for subscribing to memory changes.
 *
 * @module lib/realtime/memory-subscriptions
 */

import { subscribeToTable } from './core';
import type {
  RealtimeMemory,
  RealtimeEventType,
  InsertCallback,
  UpdateCallback,
  DeleteCallback,
  RealtimeCallbacks,
} from './types';

// =============================================================================
// Types (Re-export for backwards compatibility)
// =============================================================================

export type { RealtimeMemory };
export type MemoryEventType = RealtimeEventType;
export type MemoryInsertCallback = InsertCallback<RealtimeMemory>;
export type MemoryUpdateCallback = UpdateCallback<RealtimeMemory>;
export type MemoryDeleteCallback = DeleteCallback<RealtimeMemory>;
export type MemoryChangeCallback = (
  eventType: MemoryEventType,
  memory: RealtimeMemory | null,
  oldMemory: RealtimeMemory | null
) => void;

interface SubscriptionCallbacks {
  onInsert?: MemoryInsertCallback;
  onUpdate?: MemoryUpdateCallback;
  onDelete?: MemoryDeleteCallback;
  onChange?: MemoryChangeCallback;
}

// =============================================================================
// Subscription Functions
// =============================================================================

/**
 * Subscribe to real-time memory changes for a specific user
 *
 * @param userId - The user ID to subscribe to
 * @param callbacks - Callback functions for different event types
 * @param namespace - Optional namespace filter
 * @returns A function to unsubscribe
 *
 * @example
 * ```ts
 * const unsubscribe = subscribeToMemories('user-123', {
 *   onInsert: (memory) => console.log('New:', memory),
 *   onUpdate: (memory, old) => console.log('Updated:', memory),
 *   onDelete: (old) => console.log('Deleted:', old),
 * }, 'default');
 *
 * // Later: cleanup
 * unsubscribe();
 * ```
 */
export function subscribeToMemories(
  userId: string,
  callbacks: SubscriptionCallbacks,
  namespace?: string
): () => void {
  // Build filter
  const filter = namespace
    ? `user_id=eq.${userId},namespace=eq.${namespace}`
    : `user_id=eq.${userId}`;

  return subscribeToTable<RealtimeMemory>(
    {
      table: 'memories',
      filter,
    },
    {
      onInsert: callbacks.onInsert,
      onUpdate: callbacks.onUpdate,
      onDelete: callbacks.onDelete,
      onChange: callbacks.onChange,
    }
  );
}

/**
 * Subscribe to a specific memory by ID
 *
 * @param memoryId - The memory ID to watch
 * @param onUpdate - Callback when memory is updated
 * @param onDelete - Callback when memory is deleted
 * @returns A function to unsubscribe
 */
export function subscribeToMemory(
  memoryId: string,
  onUpdate?: MemoryUpdateCallback,
  onDelete?: MemoryDeleteCallback
): () => void {
  return subscribeToTable<RealtimeMemory>(
    {
      table: 'memories',
      filter: `id=eq.${memoryId}`,
    },
    {
      onUpdate,
      onDelete,
    }
  );
}

/**
 * Subscribe to memory changes by type
 */
export function subscribeToMemoriesByType(
  userId: string,
  memoryType: string,
  callbacks: SubscriptionCallbacks
): () => void {
  return subscribeToTable<RealtimeMemory>(
    {
      table: 'memories',
      filter: `user_id=eq.${userId},memory_type=eq.${memoryType}`,
    },
    callbacks as RealtimeCallbacks<RealtimeMemory>
  );
}

/**
 * Subscribe to Spring Memory Notes (v4)
 */
export function subscribeToSpringNotes(
  userId: string,
  callbacks: SubscriptionCallbacks
): () => void {
  return subscribeToTable<RealtimeMemory>(
    {
      table: 'spring_memory_notes',
      filter: `user_id=eq.${userId}`,
    },
    callbacks as RealtimeCallbacks<RealtimeMemory>
  );
}
