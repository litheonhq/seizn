'use client';

/**
 * usePresence Hook
 *
 * Provides real-time presence tracking for collaborative features.
 *
 * @module hooks/usePresence
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  createPresenceChannel,
  type PresenceUser,
  type PresenceCallbacks,
} from '@/lib/realtime';

// =============================================================================
// Types
// =============================================================================

export interface UsePresenceOptions {
  /** Channel name for presence tracking */
  channelName: string;
  /** Current user ID */
  userId: string;
  /** User display name */
  userName?: string;
  /** Additional metadata to track */
  metadata?: Record<string, unknown>;
  /** Whether presence is enabled */
  enabled?: boolean;
  /** Callbacks for presence events */
  onJoin?: (users: PresenceUser[]) => void;
  onLeave?: (users: PresenceUser[]) => void;
  onSync?: (users: PresenceUser[]) => void;
}

export interface UsePresenceReturn {
  /** List of online users */
  onlineUsers: PresenceUser[];
  /** Number of online users */
  onlineCount: number;
  /** Whether the current user is tracked */
  isTracking: boolean;
  /** Connection status */
  isConnected: boolean;
  /** Update presence metadata */
  updateMetadata: (metadata: Record<string, unknown>) => Promise<void>;
  /** Check if a specific user is online */
  isUserOnline: (userId: string) => boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for real-time presence tracking
 *
 * @example
 * ```tsx
 * function CollaborativeEditor({ documentId }) {
 *   const {
 *     onlineUsers,
 *     onlineCount,
 *     updateMetadata,
 *     isUserOnline,
 *   } = usePresence({
 *     channelName: `document:${documentId}`,
 *     userId: currentUser.id,
 *     userName: currentUser.name,
 *     metadata: { color: '#ff0000' },
 *     onJoin: (users) => {
 *       toast.info(`${users[0]?.metadata?.name} joined`);
 *     },
 *   });
 *
 *   // Update cursor position
 *   const handleMouseMove = (e) => {
 *     updateMetadata({ cursor: { x: e.clientX, y: e.clientY } });
 *   };
 *
 *   return (
 *     <div onMouseMove={handleMouseMove}>
 *       <span>{onlineCount} online</span>
 *       {onlineUsers.map(user => (
 *         <Avatar key={user.userId} user={user} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePresence({
  channelName,
  userId,
  userName,
  metadata = {},
  enabled = true,
  onJoin,
  onLeave,
  onSync,
}: UsePresenceOptions): UsePresenceReturn {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const presenceRef = useRef<ReturnType<typeof createPresenceChannel> | null>(null);

  // Refs for callbacks
  const onJoinRef = useRef(onJoin);
  const onLeaveRef = useRef(onLeave);
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onJoinRef.current = onJoin;
    onLeaveRef.current = onLeave;
    onSyncRef.current = onSync;
  }, [onJoin, onLeave, onSync]);

  // Update metadata function
  const updateMetadata = useCallback(
    async (newMetadata: Record<string, unknown>) => {
      if (presenceRef.current && isTracking) {
        await presenceRef.current.update(newMetadata);
      }
    },
    [isTracking]
  );

  // Check if user is online
  const isUserOnline = useCallback(
    (targetUserId: string): boolean => {
      return onlineUsers.some((u) => u.userId === targetUserId);
    },
    [onlineUsers]
  );

  // Set up presence channel
  useEffect(() => {
    if (!enabled || !userId || !channelName) {
      setIsConnected(false);
      setIsTracking(false);
      return;
    }

    const callbacks: PresenceCallbacks = {
      onJoin: (event) => {
        const joinedUsers: PresenceUser[] = event.newPresences.map((p) => ({
          userId: p.user_id,
          onlineAt: new Date(p.online_at),
          metadata: Object.fromEntries(
            Object.entries(p).filter(
              ([key]) => !['user_id', 'online_at', 'presence_ref'].includes(key)
            )
          ),
        }));
        onJoinRef.current?.(joinedUsers);
      },
      onLeave: (event) => {
        const leftUsers: PresenceUser[] = event.leftPresences.map((p) => ({
          userId: p.user_id,
          onlineAt: new Date(p.online_at),
          metadata: Object.fromEntries(
            Object.entries(p).filter(
              ([key]) => !['user_id', 'online_at', 'presence_ref'].includes(key)
            )
          ),
        }));
        onLeaveRef.current?.(leftUsers);
      },
      onSync: (state) => {
        const users: PresenceUser[] = [];
        for (const presences of Object.values(state)) {
          for (const p of presences) {
            users.push({
              userId: p.user_id,
              onlineAt: new Date(p.online_at),
              metadata: Object.fromEntries(
                Object.entries(p).filter(
                  ([key]) => !['user_id', 'online_at', 'presence_ref'].includes(key)
                )
              ),
            });
          }
        }
        setOnlineUsers(users);
        onSyncRef.current?.(users);
      },
    };

    const presence = createPresenceChannel({
      channelName,
      userId,
      metadata: {
        name: userName,
        ...metadata,
      },
      callbacks,
      autoTrack: false,
    });

    presenceRef.current = presence;
    setIsConnected(true);

    // Track presence
    presence.track().then(() => {
      setIsTracking(true);
    });

    return () => {
      presence.untrack().then(() => {
        setIsTracking(false);
      });
      presence.cleanup();
      presenceRef.current = null;
      setIsConnected(false);
      setOnlineUsers([]);
    };
  }, [channelName, userId, userName, enabled, metadata]);

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
    isTracking,
    isConnected,
    updateMetadata,
    isUserOnline,
  };
}

// =============================================================================
// Specialized Hooks
// =============================================================================

/**
 * Hook for tracking users viewing a specific memory
 */
export function useMemoryViewers(
  memoryId: string | null,
  userId: string,
  userName?: string
): {
  viewers: PresenceUser[];
  viewerCount: number;
} {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);

  const { onlineUsers } = usePresence({
    channelName: `memory-viewers:${memoryId || 'none'}`,
    userId,
    userName,
    enabled: !!memoryId,
    onSync: (users) => {
      setViewers(users.filter((u) => u.userId !== userId));
    },
  });

  return {
    viewers,
    viewerCount: viewers.length,
  };
}

/**
 * Hook for collaborative typing indicator
 */
export function useTypingIndicator(
  channelName: string,
  userId: string,
  userName?: string
): {
  typingUsers: string[];
  setTyping: (isTyping: boolean) => void;
} {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const { onlineUsers, updateMetadata } = usePresence({
    channelName: `typing:${channelName}`,
    userId,
    userName,
    metadata: { isTyping: false },
    onSync: (users) => {
      const typing = users
        .filter((u) => u.metadata.isTyping && u.userId !== userId)
        .map((u) => (u.metadata.name as string) || u.userId);
      setTypingUsers(typing);
    },
  });

  const setTyping = useCallback(
    (isTyping: boolean) => {
      updateMetadata({ isTyping });
    },
    [updateMetadata]
  );

  return {
    typingUsers,
    setTyping,
  };
}
