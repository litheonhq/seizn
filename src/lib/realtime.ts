/**
 * Supabase Realtime utilities for Seizn
 *
 * Enables real-time subscriptions to memory changes
 */

import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

// Memory type for realtime events
export interface RealtimeMemory {
  id: string;
  user_id: string;
  content: string;
  memory_type: string;
  tags: string[];
  namespace: string;
  importance: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// Event types
export type MemoryEventType = 'INSERT' | 'UPDATE' | 'DELETE';

// Callback types
export type MemoryInsertCallback = (memory: RealtimeMemory) => void;
export type MemoryUpdateCallback = (memory: RealtimeMemory, oldMemory: RealtimeMemory) => void;
export type MemoryDeleteCallback = (oldMemory: RealtimeMemory) => void;
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

/**
 * Subscribe to real-time memory changes for a specific user
 *
 * @param userId - The user ID to subscribe to
 * @param callbacks - Callback functions for different event types
 * @param namespace - Optional namespace filter
 * @returns A function to unsubscribe
 */
export function subscribeToMemories(
  userId: string,
  callbacks: SubscriptionCallbacks,
  namespace?: string
): () => void {
  const supabase = getSupabase();

  // Create channel with unique name
  const channelName = `memories:${userId}${namespace ? `:${namespace}` : ''}`;

  // Build filter - Supabase Realtime requires RLS or filter
  const filter = namespace
    ? `user_id=eq.${userId},namespace=eq.${namespace}`
    : `user_id=eq.${userId}`;

  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on<RealtimeMemory>(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'memories',
        filter,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeMemory>) => {
        const eventType = payload.eventType as MemoryEventType;
        const newRecord = payload.new as RealtimeMemory | null;
        const oldRecord = payload.old as RealtimeMemory | null;

        // Call specific callbacks
        if (eventType === 'INSERT' && newRecord && callbacks.onInsert) {
          callbacks.onInsert(newRecord);
        } else if (eventType === 'UPDATE' && newRecord && oldRecord && callbacks.onUpdate) {
          callbacks.onUpdate(newRecord, oldRecord);
        } else if (eventType === 'DELETE' && oldRecord && callbacks.onDelete) {
          callbacks.onDelete(oldRecord);
        }

        // Call generic onChange callback
        if (callbacks.onChange) {
          callbacks.onChange(eventType, newRecord, oldRecord);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Realtime subscribed to ${channelName}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`Realtime channel error: ${channelName}`);
      }
    });

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
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
  const supabase = getSupabase();

  const channelName = `memory:${memoryId}`;

  const channel = supabase
    .channel(channelName)
    .on<RealtimeMemory>(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'memories',
        filter: `id=eq.${memoryId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeMemory>) => {
        const eventType = payload.eventType;
        const newRecord = payload.new as RealtimeMemory | null;
        const oldRecord = payload.old as RealtimeMemory | null;

        if (eventType === 'UPDATE' && newRecord && oldRecord && onUpdate) {
          onUpdate(newRecord, oldRecord);
        } else if (eventType === 'DELETE' && oldRecord && onDelete) {
          onDelete(oldRecord);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Broadcast a custom event to all subscribers
 * Useful for syncing state across multiple clients
 */
export function broadcastMemoryEvent(
  userId: string,
  event: string,
  payload: Record<string, unknown>
): void {
  const supabase = getSupabase();
  const channelName = `broadcast:${userId}`;

  const channel = supabase.channel(channelName);
  channel.send({
    type: 'broadcast',
    event,
    payload,
  });
}

/**
 * Subscribe to broadcast events for a user
 */
export function subscribeToBroadcast(
  userId: string,
  onEvent: (event: string, payload: Record<string, unknown>) => void
): () => void {
  const supabase = getSupabase();
  const channelName = `broadcast:${userId}`;

  const channel = supabase
    .channel(channelName)
    .on('broadcast', { event: '*' }, ({ event, payload }) => {
      onEvent(event, payload as Record<string, unknown>);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Create a presence channel for tracking online users/sessions
 */
export function createPresenceChannel(
  channelName: string,
  userId: string,
  metadata?: Record<string, unknown>
): {
  channel: RealtimeChannel;
  track: () => Promise<void>;
  untrack: () => Promise<void>;
  getPresenceState: () => Record<string, unknown[]>;
  onSync: (callback: () => void) => void;
  cleanup: () => void;
} {
  const supabase = getSupabase();
  const channel = supabase.channel(channelName);

  let syncCallback: (() => void) | null = null;

  channel.on('presence', { event: 'sync' }, () => {
    if (syncCallback) syncCallback();
  });

  return {
    channel,
    track: async () => {
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...metadata,
      });
    },
    untrack: async () => {
      await channel.untrack();
    },
    getPresenceState: () => channel.presenceState(),
    onSync: (callback: () => void) => {
      syncCallback = callback;
    },
    cleanup: () => {
      supabase.removeChannel(channel);
    },
  };
}
