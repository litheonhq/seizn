'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  subscribeToMemories,
  subscribeToMemory,
  type RealtimeMemory,
  type MemoryEventType,
} from '@/lib/realtime';

interface UseRealtimeMemoriesOptions {
  userId: string;
  namespace?: string;
  enabled?: boolean;
  onInsert?: (memory: RealtimeMemory) => void;
  onUpdate?: (memory: RealtimeMemory, oldMemory: RealtimeMemory) => void;
  onDelete?: (oldMemory: RealtimeMemory) => void;
}

interface UseRealtimeMemoriesReturn {
  recentChanges: Array<{
    type: MemoryEventType;
    memory: RealtimeMemory | null;
    timestamp: Date;
  }>;
  isConnected: boolean;
  clearChanges: () => void;
}

/**
 * React hook for subscribing to real-time memory changes
 *
 * @example
 * ```tsx
 * const { recentChanges, isConnected } = useRealtimeMemories({
 *   userId: session.user.id,
 *   namespace: 'default',
 *   onInsert: (memory) => console.log('New memory:', memory),
 * });
 * ```
 */
export function useRealtimeMemories({
  userId,
  namespace,
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeMemoriesOptions): UseRealtimeMemoriesReturn {
  const [recentChanges, setRecentChanges] = useState<
    Array<{
      type: MemoryEventType;
      memory: RealtimeMemory | null;
      timestamp: Date;
    }>
  >([]);
  const [isConnected, setIsConnected] = useState(false);

  // Use refs to avoid stale closures in callbacks
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
  }, [onInsert, onUpdate, onDelete]);

  const clearChanges = useCallback(() => {
    setRecentChanges([]);
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false);
      return;
    }

    const unsubscribe = subscribeToMemories(
      userId,
      {
        onInsert: (memory) => {
          setRecentChanges((prev) => [
            { type: 'INSERT', memory, timestamp: new Date() },
            ...prev.slice(0, 49), // Keep last 50 changes
          ]);
          onInsertRef.current?.(memory);
        },
        onUpdate: (memory, oldMemory) => {
          setRecentChanges((prev) => [
            { type: 'UPDATE', memory, timestamp: new Date() },
            ...prev.slice(0, 49),
          ]);
          onUpdateRef.current?.(memory, oldMemory);
        },
        onDelete: (oldMemory) => {
          setRecentChanges((prev) => [
            { type: 'DELETE', memory: oldMemory, timestamp: new Date() },
            ...prev.slice(0, 49),
          ]);
          onDeleteRef.current?.(oldMemory);
        },
      },
      namespace
    );

    setIsConnected(true);

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [userId, namespace, enabled]);

  return {
    recentChanges,
    isConnected,
    clearChanges,
  };
}

interface UseRealtimeMemoryOptions {
  memoryId: string;
  enabled?: boolean;
  onUpdate?: (memory: RealtimeMemory, oldMemory: RealtimeMemory) => void;
  onDelete?: (oldMemory: RealtimeMemory) => void;
}

interface UseRealtimeMemoryReturn {
  lastUpdate: RealtimeMemory | null;
  isDeleted: boolean;
  isConnected: boolean;
}

/**
 * React hook for subscribing to a single memory's changes
 *
 * @example
 * ```tsx
 * const { lastUpdate, isDeleted } = useRealtimeMemory({
 *   memoryId: 'uuid-here',
 *   onUpdate: (memory) => console.log('Memory updated:', memory),
 * });
 * ```
 */
export function useRealtimeMemory({
  memoryId,
  enabled = true,
  onUpdate,
  onDelete,
}: UseRealtimeMemoryOptions): UseRealtimeMemoryReturn {
  const [lastUpdate, setLastUpdate] = useState<RealtimeMemory | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
  }, [onUpdate, onDelete]);

  useEffect(() => {
    if (!enabled || !memoryId) {
      setIsConnected(false);
      return;
    }

    const unsubscribe = subscribeToMemory(
      memoryId,
      (memory, oldMemory) => {
        setLastUpdate(memory);
        onUpdateRef.current?.(memory, oldMemory);
      },
      (oldMemory) => {
        setIsDeleted(true);
        onDeleteRef.current?.(oldMemory);
      }
    );

    setIsConnected(true);

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [memoryId, enabled]);

  return {
    lastUpdate,
    isDeleted,
    isConnected,
  };
}
