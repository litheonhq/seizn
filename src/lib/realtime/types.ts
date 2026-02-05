/**
 * Realtime Types
 *
 * @module lib/realtime/types
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// =============================================================================
// Generic Types
// =============================================================================

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeFilter {
  column: string;
  value: string | number | boolean;
}

export interface RealtimeSubscriptionOptions {
  /** Table name to subscribe to */
  table: string;
  /** Schema (default: 'public') */
  schema?: string;
  /** Filter conditions (column=eq.value format) */
  filter?: string | RealtimeFilter[];
  /** Event types to listen for (default: all) */
  events?: RealtimeEventType[];
  /** Whether subscription is enabled */
  enabled?: boolean;
}

export type RealtimeCallback<T> = (
  eventType: RealtimeEventType,
  newRecord: T | null,
  oldRecord: T | null
) => void;

export type InsertCallback<T> = (record: T) => void;
export type UpdateCallback<T> = (newRecord: T, oldRecord: T) => void;
export type DeleteCallback<T> = (oldRecord: T) => void;

export interface RealtimeCallbacks<T> {
  onInsert?: InsertCallback<T>;
  onUpdate?: UpdateCallback<T>;
  onDelete?: DeleteCallback<T>;
  onChange?: RealtimeCallback<T>;
}

// =============================================================================
// Memory Types
// =============================================================================

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

// =============================================================================
// Spring Memory Candidate Types
// =============================================================================

export interface RealtimeCandidate {
  id: string;
  user_id: string;
  source_type: string;
  raw_content: string;
  extracted_content: string | null;
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'rejected';
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  memory_id: string | null;
}

// =============================================================================
// Usage Event Types
// =============================================================================

export interface RealtimeUsageEvent {
  id: string;
  user_id: string;
  memory_id: string | null;
  event_type: 'view' | 'search_result' | 'context_used' | 'explicit_recall' | 'linked_access';
  search_query: string | null;
  relevance_rank: number | null;
  context_window_position: number | null;
  session_id: string | null;
  created_at: string;
}

// =============================================================================
// Broadcast Types
// =============================================================================

export interface BroadcastEvent {
  event: string;
  payload: Record<string, unknown>;
}

export type BroadcastCallback = (event: string, payload: Record<string, unknown>) => void;

// =============================================================================
// Presence Types
// =============================================================================

export interface PresenceState {
  user_id: string;
  online_at: string;
  [key: string]: unknown;
}

export interface PresenceJoinEvent {
  key: string;
  newPresences: PresenceState[];
  currentPresences: PresenceState[];
}

export interface PresenceLeaveEvent {
  key: string;
  leftPresences: PresenceState[];
  currentPresences: PresenceState[];
}

export interface PresenceCallbacks {
  onJoin?: (event: PresenceJoinEvent) => void;
  onLeave?: (event: PresenceLeaveEvent) => void;
  onSync?: (state: Record<string, PresenceState[]>) => void;
}

// =============================================================================
// Optimistic Update Types
// =============================================================================

export interface OptimisticUpdate<T> {
  id: string;
  type: 'create' | 'update' | 'delete';
  data: T;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  error?: Error;
}

export interface OptimisticState<T> {
  data: T[];
  pendingUpdates: OptimisticUpdate<T>[];
  isOptimistic: boolean;
}

// =============================================================================
// Connection Status
// =============================================================================

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'reconnecting';

export interface ChannelState {
  channel: RealtimeChannel;
  status: ConnectionStatus;
  table: string;
  filter?: string;
}
