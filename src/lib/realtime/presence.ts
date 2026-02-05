/**
 * Presence Utilities
 *
 * Track online users and enable collaborative features using Supabase Presence.
 * Supports cursor tracking, typing indicators, and shared state.
 *
 * @module lib/realtime/presence
 */

import type { RealtimeChannel, RealtimePresenceJoinPayload, RealtimePresenceLeavePayload } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import { getOrCreateChannel, removeChannel } from './core';
import type { PresenceState, PresenceCallbacks, PresenceJoinEvent, PresenceLeaveEvent } from './types';

// =============================================================================
// Types
// =============================================================================

export interface PresenceOptions {
  /** Channel name (will be prefixed with 'presence:') */
  channelName: string;
  /** Current user ID */
  userId: string;
  /** Additional metadata to track */
  metadata?: Record<string, unknown>;
  /** Callbacks for presence events */
  callbacks?: PresenceCallbacks;
  /** Whether to track immediately */
  autoTrack?: boolean;
}

export interface PresenceUser {
  userId: string;
  onlineAt: Date;
  metadata: Record<string, unknown>;
}

export interface PresenceChannelInstance {
  /** Start tracking presence */
  track: (metadata?: Record<string, unknown>) => Promise<void>;
  /** Stop tracking presence */
  untrack: () => Promise<void>;
  /** Update presence metadata */
  update: (metadata: Record<string, unknown>) => Promise<void>;
  /** Get all online users */
  getOnlineUsers: () => PresenceUser[];
  /** Check if a user is online */
  isUserOnline: (userId: string) => boolean;
  /** Get count of online users */
  getOnlineCount: () => number;
  /** Cleanup channel */
  cleanup: () => void;
  /** The underlying channel */
  channel: RealtimeChannel;
}

// =============================================================================
// Presence Functions
// =============================================================================

/**
 * Create a presence channel for tracking online users
 *
 * @example
 * ```ts
 * // Create a presence channel for a memory space
 * const presence = createPresenceChannel({
 *   channelName: 'space:project-123',
 *   userId: currentUser.id,
 *   metadata: { name: currentUser.name, avatar: currentUser.avatar },
 *   callbacks: {
 *     onJoin: (event) => {
 *       console.log(`${event.newPresences.length} users joined`);
 *     },
 *     onLeave: (event) => {
 *       console.log(`${event.leftPresences.length} users left`);
 *     },
 *     onSync: (state) => {
 *       updateOnlineUsers(state);
 *     },
 *   },
 * });
 *
 * // Start tracking
 * await presence.track();
 *
 * // Check online users
 * const users = presence.getOnlineUsers();
 *
 * // Cleanup
 * presence.cleanup();
 * ```
 */
export function createPresenceChannel(options: PresenceOptions): PresenceChannelInstance {
  const {
    channelName,
    userId,
    metadata = {},
    callbacks = {},
    autoTrack = false,
  } = options;

  const fullChannelName = `presence:${channelName}`;
  const channel = getOrCreateChannel(fullChannelName);

  // Set up presence event handlers
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceState>();
      callbacks.onSync?.(state);
    })
    .on('presence', { event: 'join' }, ({ key, newPresences, currentPresences }: RealtimePresenceJoinPayload<PresenceState>) => {
      callbacks.onJoin?.({
        key,
        newPresences,
        currentPresences,
      });
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences, currentPresences }: RealtimePresenceLeavePayload<PresenceState>) => {
      callbacks.onLeave?.({
        key,
        leftPresences,
        currentPresences,
      });
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && autoTrack) {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
          ...metadata,
        });
      }
    });

  const getOnlineUsers = (): PresenceUser[] => {
    const state = channel.presenceState<PresenceState>();
    const users: PresenceUser[] = [];

    for (const presences of Object.values(state)) {
      for (const presence of presences) {
        users.push({
          userId: presence.user_id,
          onlineAt: new Date(presence.online_at),
          metadata: Object.fromEntries(
            Object.entries(presence).filter(
              ([key]) => !['user_id', 'online_at', 'presence_ref'].includes(key)
            )
          ),
        });
      }
    }

    return users;
  };

  return {
    track: async (extraMetadata = {}) => {
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...metadata,
        ...extraMetadata,
      });
    },

    untrack: async () => {
      await channel.untrack();
    },

    update: async (newMetadata) => {
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...metadata,
        ...newMetadata,
      });
    },

    getOnlineUsers,

    isUserOnline: (targetUserId: string): boolean => {
      const users = getOnlineUsers();
      return users.some((u) => u.userId === targetUserId);
    },

    getOnlineCount: (): number => {
      return getOnlineUsers().length;
    },

    cleanup: () => {
      removeChannel(fullChannelName);
    },

    channel,
  };
}

// =============================================================================
// Convenience Presence Channels
// =============================================================================

/**
 * Create a user-specific presence channel
 */
export function createUserPresenceChannel(
  userId: string,
  callbacks?: PresenceCallbacks
): PresenceChannelInstance {
  return createPresenceChannel({
    channelName: `user:${userId}`,
    userId,
    callbacks,
    autoTrack: true,
  });
}

/**
 * Create a collaborative editing presence channel
 * Includes cursor position and selection tracking
 */
export function createCollaborativePresence(
  documentId: string,
  userId: string,
  userName: string,
  callbacks?: PresenceCallbacks
): PresenceChannelInstance & {
  updateCursor: (x: number, y: number) => Promise<void>;
  updateSelection: (start: number, end: number) => Promise<void>;
  setTyping: (isTyping: boolean) => Promise<void>;
} {
  const presence = createPresenceChannel({
    channelName: `collab:${documentId}`,
    userId,
    metadata: {
      name: userName,
      cursor: null,
      selection: null,
      isTyping: false,
    },
    callbacks,
    autoTrack: true,
  });

  return {
    ...presence,

    updateCursor: async (x: number, y: number) => {
      await presence.update({ cursor: { x, y } });
    },

    updateSelection: async (start: number, end: number) => {
      await presence.update({ selection: { start, end } });
    },

    setTyping: async (isTyping: boolean) => {
      await presence.update({ isTyping });
    },
  };
}

/**
 * Create a memory viewing session presence
 * Track who is viewing what memories
 */
export function createMemoryViewPresence(
  userId: string,
  userName: string,
  callbacks?: PresenceCallbacks
): PresenceChannelInstance & {
  viewMemory: (memoryId: string | null) => Promise<void>;
  getCurrentViews: () => Map<string, string[]>;
} {
  const presence = createPresenceChannel({
    channelName: `memory-view:${userId}`,
    userId,
    metadata: {
      name: userName,
      viewingMemoryId: null,
    },
    callbacks,
    autoTrack: true,
  });

  return {
    ...presence,

    viewMemory: async (memoryId: string | null) => {
      await presence.update({ viewingMemoryId: memoryId });
    },

    getCurrentViews: (): Map<string, string[]> => {
      const users = presence.getOnlineUsers();
      const views = new Map<string, string[]>();

      for (const user of users) {
        const memoryId = user.metadata.viewingMemoryId as string | null;
        if (memoryId) {
          const viewers = views.get(memoryId) || [];
          viewers.push(user.userId);
          views.set(memoryId, viewers);
        }
      }

      return views;
    },
  };
}

// =============================================================================
// Legacy Compatibility (from old realtime.ts)
// =============================================================================

/**
 * @deprecated Use createPresenceChannel instead
 */
export function createPresenceChannelLegacy(
  channelName: string,
  userId: string,
  metadata?: Record<string, unknown>
): {
  channel: RealtimeChannel;
  track: () => Promise<void>;
  untrack: () => Promise<void>;
  update: (newMetadata: Record<string, unknown>) => Promise<void>;
  getPresenceState: () => Record<string, unknown[]>;
  onSync: (callback: () => void) => void;
  cleanup: () => void;
} {
  const supabase = getSupabase();
  const channel = supabase.channel(channelName);

  let syncCallback: (() => void) | null = null;
  let currentMetadata = metadata || {};

  channel.on('presence', { event: 'sync' }, () => {
    if (syncCallback) syncCallback();
  });

  return {
    channel,
    track: async () => {
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...currentMetadata,
      });
    },
    untrack: async () => {
      await channel.untrack();
    },
    update: async (newMetadata: Record<string, unknown>) => {
      currentMetadata = { ...currentMetadata, ...newMetadata };
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...currentMetadata,
      });
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
