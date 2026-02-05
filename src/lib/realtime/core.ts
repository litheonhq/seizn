/**
 * Core Realtime Utilities
 *
 * Provides low-level functions for managing Supabase Realtime channels.
 *
 * @module lib/realtime/core
 */

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import type {
  RealtimeEventType,
  RealtimeFilter,
  RealtimeSubscriptionOptions,
  RealtimeCallbacks,
  ConnectionStatus,
} from './types';

// =============================================================================
// Channel Registry
// =============================================================================

// Global registry to track active channels and prevent duplicates
const channelRegistry = new Map<string, RealtimeChannel>();

/**
 * Get or create a channel with the given name
 */
export function getOrCreateChannel(
  channelName: string,
  supabase?: SupabaseClient
): RealtimeChannel {
  const client = supabase || getSupabase();

  if (channelRegistry.has(channelName)) {
    return channelRegistry.get(channelName)!;
  }

  const channel = client.channel(channelName);
  channelRegistry.set(channelName, channel);

  return channel;
}

/**
 * Remove a channel from registry and Supabase
 */
export function removeChannel(channelName: string, supabase?: SupabaseClient): void {
  const client = supabase || getSupabase();
  const channel = channelRegistry.get(channelName);

  if (channel) {
    client.removeChannel(channel);
    channelRegistry.delete(channelName);
  }
}

/**
 * Get all active channel names
 */
export function getActiveChannels(): string[] {
  return Array.from(channelRegistry.keys());
}

/**
 * Clear all channels (useful for cleanup on logout)
 */
export function clearAllChannels(supabase?: SupabaseClient): void {
  const client = supabase || getSupabase();

  for (const [name, channel] of channelRegistry) {
    client.removeChannel(channel);
  }

  channelRegistry.clear();
}

// =============================================================================
// Filter Utilities
// =============================================================================

/**
 * Build a Supabase Realtime filter string from filter objects
 */
export function buildFilterString(filters: RealtimeFilter[]): string {
  return filters.map((f) => `${f.column}=eq.${f.value}`).join(',');
}

/**
 * Generate a unique channel name for a table subscription
 */
export function generateChannelName(
  table: string,
  filter?: string,
  prefix?: string
): string {
  const base = prefix ? `${prefix}:${table}` : table;
  if (filter) {
    // Create a hash-like suffix from filter
    const filterHash = filter.replace(/[=.,]/g, '_').slice(0, 50);
    return `${base}:${filterHash}`;
  }
  return base;
}

// =============================================================================
// Generic Table Subscription
// =============================================================================

/**
 * Subscribe to postgres changes on a table
 *
 * @template T - The row type for the table
 * @param options - Subscription options
 * @param callbacks - Callbacks for different event types
 * @param supabase - Optional Supabase client
 * @returns Unsubscribe function
 */
export function subscribeToTable<T extends object>(
  options: RealtimeSubscriptionOptions,
  callbacks: RealtimeCallbacks<T>,
  supabase?: SupabaseClient
): () => void {
  const client = supabase || getSupabase();
  const {
    table,
    schema = 'public',
    filter,
    events = ['INSERT', 'UPDATE', 'DELETE'],
    enabled = true,
  } = options;

  if (!enabled) {
    return () => {};
  }

  // Build filter string if needed
  const filterString =
    typeof filter === 'string'
      ? filter
      : Array.isArray(filter)
        ? buildFilterString(filter)
        : undefined;

  const channelName = generateChannelName(table, filterString);
  const channel = getOrCreateChannel(channelName, client);

  // Determine which events to listen for
  const eventFilter = events.length === 3 ? '*' : events.join(',');

// Cast to any to avoid Supabase type incompatibility with postgres_changes
  (channel as unknown as {
    on: (
      type: string,
      opts: Record<string, unknown>,
      callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
    ) => { subscribe: (cb: (status: string) => void) => void };
  })
    .on(
      'postgres_changes',
      {
        event: eventFilter as 'INSERT' | 'UPDATE' | 'DELETE' | '*',
        schema,
        table,
        filter: filterString,
      },
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typedPayload = payload as any;
        const eventType = typedPayload.eventType as RealtimeEventType;
        const newRecord = typedPayload.new as T | null;
        const oldRecord = typedPayload.old as T | null;

        // Call specific callbacks
        if (eventType === 'INSERT' && newRecord && callbacks.onInsert) {
          callbacks.onInsert(newRecord);
        } else if (
          eventType === 'UPDATE' &&
          newRecord &&
          oldRecord &&
          callbacks.onUpdate
        ) {
          callbacks.onUpdate(newRecord, oldRecord);
        } else if (eventType === 'DELETE' && oldRecord && callbacks.onDelete) {
          callbacks.onDelete(oldRecord);
        }

        // Call generic onChange
        if (callbacks.onChange) {
          callbacks.onChange(eventType, newRecord, oldRecord);
        }
      }
    )
    .subscribe((status) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime] ${channelName}: ${status}`);
      }
    });

  return () => {
    removeChannel(channelName, client);
  };
}

// =============================================================================
// Connection Monitoring
// =============================================================================

type StatusCallback = (status: ConnectionStatus, channelName: string) => void;
const statusCallbacks = new Set<StatusCallback>();

/**
 * Subscribe to connection status changes
 */
export function onConnectionStatusChange(callback: StatusCallback): () => void {
  statusCallbacks.add(callback);
  return () => {
    statusCallbacks.delete(callback);
  };
}

/**
 * Notify status change
 */
export function notifyStatusChange(
  status: ConnectionStatus,
  channelName: string
): void {
  for (const callback of statusCallbacks) {
    callback(status, channelName);
  }
}

// =============================================================================
// Reconnection Utilities
// =============================================================================

/**
 * Attempt to reconnect a channel
 */
export async function reconnectChannel(
  channelName: string,
  supabase?: SupabaseClient
): Promise<boolean> {
  const client = supabase || getSupabase();
  const channel = channelRegistry.get(channelName);

  if (!channel) {
    return false;
  }

  try {
    notifyStatusChange('reconnecting', channelName);
    await client.removeChannel(channel);

    // Channel will need to be re-subscribed
    channelRegistry.delete(channelName);
    notifyStatusChange('disconnected', channelName);

    return true;
  } catch (error) {
    console.error(`[Realtime] Failed to reconnect ${channelName}:`, error);
    notifyStatusChange('error', channelName);
    return false;
  }
}
