/**
 * Supabase Realtime utilities for Seizn
 *
 * This file re-exports from the modular realtime directory for backwards compatibility.
 * New code should import directly from '@/lib/realtime'.
 *
 * @module lib/realtime
 * @deprecated Use '@/lib/realtime' instead for new code
 */

// Re-export everything from the modular realtime module
export * from './realtime/index';

// Legacy exports for backwards compatibility
export {
  subscribeToMemories,
  subscribeToMemory,
  type RealtimeMemory,
  type MemoryEventType,
  type MemoryInsertCallback,
  type MemoryUpdateCallback,
  type MemoryDeleteCallback,
  type MemoryChangeCallback,
} from './realtime/memory-subscriptions';

export {
  subscribeToUserBroadcast as subscribeToBroadcast,
  broadcastToUser as broadcastMemoryEvent,
} from './realtime/broadcast';

// Note: createPresenceChannel is already exported from './realtime/index'
// The legacy version is kept for older code
export { createPresenceChannelLegacy } from './realtime/presence';
