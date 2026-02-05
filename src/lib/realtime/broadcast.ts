/**
 * Broadcast Channel Utilities
 *
 * Provides pub/sub functionality for custom events across clients.
 * Useful for syncing state, notifications, and real-time collaboration.
 *
 * @module lib/realtime/broadcast
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import { getOrCreateChannel, removeChannel } from './core';
import type { BroadcastCallback } from './types';

// =============================================================================
// Types
// =============================================================================

export interface BroadcastChannelOptions {
  /** Channel name (will be prefixed with 'broadcast:') */
  channelName: string;
  /** Whether to auto-subscribe on creation */
  autoSubscribe?: boolean;
}

export interface BroadcastChannelInstance {
  /** Send an event to all subscribers */
  send: <T = Record<string, unknown>>(event: string, payload: T) => Promise<void>;
  /** Subscribe to a specific event */
  on: <T = Record<string, unknown>>(event: string, callback: (payload: T) => void) => void;
  /** Subscribe to all events */
  onAny: (callback: BroadcastCallback) => void;
  /** Unsubscribe from all events and cleanup */
  cleanup: () => void;
  /** Get the underlying channel */
  channel: RealtimeChannel;
}

// =============================================================================
// Broadcast Functions
// =============================================================================

/**
 * Create a broadcast channel for custom events
 *
 * @example
 * ```ts
 * // Create a channel for memory sync
 * const channel = createBroadcastChannel({ channelName: 'memory-sync:user-123' });
 *
 * // Subscribe to events
 * channel.on<{ memoryId: string }>('memory-updated', (payload) => {
 *   refreshMemory(payload.memoryId);
 * });
 *
 * // Send events
 * await channel.send('memory-updated', { memoryId: '123' });
 *
 * // Cleanup
 * channel.cleanup();
 * ```
 */
export function createBroadcastChannel(
  options: BroadcastChannelOptions
): BroadcastChannelInstance {
  const { channelName, autoSubscribe = true } = options;
  const fullChannelName = `broadcast:${channelName}`;

  const channel = getOrCreateChannel(fullChannelName);
  const eventCallbacks = new Map<string, Set<(payload: unknown) => void>>();
  let anyCallbacks: Set<BroadcastCallback> = new Set();

  // Set up listener for all broadcast events
  channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
    // Call specific event callbacks
    const callbacks = eventCallbacks.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(payload);
      }
    }

    // Call 'any' callbacks
    for (const callback of anyCallbacks) {
      callback(event, payload as Record<string, unknown>);
    }
  });

  if (autoSubscribe) {
    channel.subscribe();
  }

  return {
    send: async <T>(event: string, payload: T) => {
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
    },

    on: <T>(event: string, callback: (payload: T) => void) => {
      if (!eventCallbacks.has(event)) {
        eventCallbacks.set(event, new Set());
      }
      eventCallbacks.get(event)!.add(callback as (payload: unknown) => void);
    },

    onAny: (callback: BroadcastCallback) => {
      anyCallbacks.add(callback);
    },

    cleanup: () => {
      removeChannel(fullChannelName);
      eventCallbacks.clear();
      anyCallbacks.clear();
    },

    channel,
  };
}

/**
 * Simple broadcast to a user channel
 */
export async function broadcastToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  const channelName = `user:${userId}`;

  const channel = supabase.channel(channelName);

  await channel.send({
    type: 'broadcast',
    event,
    payload,
  });
}

/**
 * Subscribe to a user's broadcast channel
 */
export function subscribeToUserBroadcast(
  userId: string,
  onEvent: BroadcastCallback
): () => void {
  const channelName = `user:${userId}`;
  const channel = createBroadcastChannel({ channelName });

  channel.onAny(onEvent);

  return () => channel.cleanup();
}

// =============================================================================
// Predefined Event Types
// =============================================================================

export const BROADCAST_EVENTS = {
  // Memory events
  MEMORY_CREATED: 'memory:created',
  MEMORY_UPDATED: 'memory:updated',
  MEMORY_DELETED: 'memory:deleted',
  MEMORY_BULK_OPERATION: 'memory:bulk',

  // Candidate events
  CANDIDATE_SUBMITTED: 'candidate:submitted',
  CANDIDATE_PROCESSED: 'candidate:processed',
  CANDIDATE_FAILED: 'candidate:failed',

  // Search events
  SEARCH_PERFORMED: 'search:performed',
  SEARCH_CACHED: 'search:cached',

  // Sync events
  SYNC_STARTED: 'sync:started',
  SYNC_COMPLETED: 'sync:completed',
  SYNC_FAILED: 'sync:failed',

  // Graph events
  LINK_CREATED: 'graph:link-created',
  COMMUNITY_UPDATED: 'graph:community-updated',

  // Session events
  SESSION_CONTEXT_UPDATED: 'session:context-updated',
  SESSION_MEMORY_USED: 'session:memory-used',

  // Notification events
  NOTIFICATION: 'notification',
} as const;

export type BroadcastEventType = (typeof BROADCAST_EVENTS)[keyof typeof BROADCAST_EVENTS];

// =============================================================================
// Typed Event Helpers
// =============================================================================

/**
 * Create a typed broadcast sender for a specific user
 */
export function createUserBroadcaster(userId: string) {
  const channel = createBroadcastChannel({ channelName: `user:${userId}` });

  return {
    memoryCreated: (memoryId: string) =>
      channel.send(BROADCAST_EVENTS.MEMORY_CREATED, { memoryId }),

    memoryUpdated: (memoryId: string, changes: string[]) =>
      channel.send(BROADCAST_EVENTS.MEMORY_UPDATED, { memoryId, changes }),

    memoryDeleted: (memoryId: string) =>
      channel.send(BROADCAST_EVENTS.MEMORY_DELETED, { memoryId }),

    candidateProcessed: (candidateId: string, memoryId: string) =>
      channel.send(BROADCAST_EVENTS.CANDIDATE_PROCESSED, { candidateId, memoryId }),

    notification: (title: string, body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') =>
      channel.send(BROADCAST_EVENTS.NOTIFICATION, { title, body, type }),

    cleanup: () => channel.cleanup(),
  };
}
