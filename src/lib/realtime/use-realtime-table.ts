'use client';

/**
 * Generic useRealtimeTable Hook
 *
 * A flexible hook for subscribing to any Supabase table with real-time updates.
 * Supports filtering, optimistic updates, and automatic reconnection.
 *
 * @module lib/realtime/use-realtime-table
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { subscribeToTable, generateChannelName } from './core';
import type {
  RealtimeEventType,
  RealtimeFilter,
  ConnectionStatus,
  InsertCallback,
  UpdateCallback,
  DeleteCallback,
} from './types';

// =============================================================================
// Types
// =============================================================================

export interface UseRealtimeTableOptions<T> {
  /** Table name to subscribe to */
  table: string;
  /** Schema (default: 'public') */
  schema?: string;
  /** Filter as string (e.g., 'user_id=eq.123') or filter objects */
  filter?: string | RealtimeFilter[];
  /** Primary key field for merging updates (default: 'id') */
  primaryKey?: keyof T;
  /** Whether the subscription is enabled */
  enabled?: boolean;
  /** Initial data (e.g., from server-side fetch) */
  initialData?: T[];
  /** Maximum number of items to keep in state (for performance) */
  maxItems?: number;
  /** Callbacks */
  onInsert?: InsertCallback<T>;
  onUpdate?: UpdateCallback<T>;
  onDelete?: DeleteCallback<T>;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
}

export interface UseRealtimeTableReturn<T> {
  /** Current data with real-time updates merged */
  data: T[];
  /** Recent changes for UI feedback */
  recentChanges: RealtimeChange<T>[];
  /** Connection status */
  status: ConnectionStatus;
  /** Whether there are pending optimistic updates */
  isOptimistic: boolean;
  /** Apply an optimistic update (returns rollback function) */
  optimisticUpdate: (
    type: 'insert' | 'update' | 'delete',
    item: T
  ) => () => void;
  /** Clear recent changes */
  clearChanges: () => void;
  /** Force refresh data (clears optimistic state) */
  refresh: (newData: T[]) => void;
}

export interface RealtimeChange<T> {
  id: string;
  type: RealtimeEventType;
  item: T | null;
  previousItem?: T | null;
  timestamp: Date;
  isOptimistic: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Generic hook for subscribing to real-time table changes
 *
 * @example
 * ```tsx
 * // Subscribe to candidates for a user
 * const { data, status, recentChanges } = useRealtimeTable<Candidate>({
 *   table: 'spring_memory_candidates',
 *   filter: `user_id=eq.${userId}`,
 *   initialData: serverCandidates,
 *   onInsert: (candidate) => toast.success('New candidate!'),
 * });
 *
 * // Subscribe with filter objects
 * const { data } = useRealtimeTable<Memory>({
 *   table: 'memories',
 *   filter: [
 *     { column: 'user_id', value: userId },
 *     { column: 'namespace', value: 'default' },
 *   ],
 * });
 * ```
 */
export function useRealtimeTable<T extends { id?: string | number }>(
  options: UseRealtimeTableOptions<T>
): UseRealtimeTableReturn<T> {
  const {
    table,
    schema = 'public',
    filter,
    primaryKey = 'id' as keyof T,
    enabled = true,
    initialData = [],
    maxItems = 1000,
    onInsert,
    onUpdate,
    onDelete,
    onError,
    onConnectionChange,
  } = options;

  // State
  const [data, setData] = useState<T[]>(initialData);
  const [recentChanges, setRecentChanges] = useState<RealtimeChange<T>[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, T>>(
    new Map()
  );

  // Refs for callbacks to avoid stale closures
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  const onErrorRef = useRef(onError);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
    onErrorRef.current = onError;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onInsert, onUpdate, onDelete, onError, onConnectionChange]);

  // Generate stable filter string
  const filterString = useMemo(() => {
    if (!filter) return undefined;
    if (typeof filter === 'string') return filter;
    return filter.map((f) => `${f.column}=eq.${f.value}`).join(',');
  }, [filter]);

  // Add recent change
  const addChange = useCallback(
    (
      type: RealtimeEventType,
      item: T | null,
      previousItem?: T | null,
      isOptimistic = false
    ) => {
      const change: RealtimeChange<T> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        item,
        previousItem,
        timestamp: new Date(),
        isOptimistic,
      };

      setRecentChanges((prev) => [change, ...prev.slice(0, 49)]);
    },
    []
  );

  // Handle INSERT
  const handleInsert = useCallback(
    (newItem: T) => {
      setData((prev) => {
        // Check for duplicates
        const exists = prev.some(
          (item) => item[primaryKey] === newItem[primaryKey]
        );
        if (exists) return prev;

        // Remove from optimistic if confirmed
        setOptimisticUpdates((opt) => {
          const updated = new Map(opt);
          updated.delete(String(newItem[primaryKey]));
          return updated;
        });

        // Add to beginning, respect maxItems
        const updated = [newItem, ...prev];
        return updated.slice(0, maxItems);
      });

      addChange('INSERT', newItem);
      onInsertRef.current?.(newItem);
    },
    [primaryKey, maxItems, addChange]
  );

  // Handle UPDATE
  const handleUpdate = useCallback(
    (newItem: T, oldItem: T) => {
      setData((prev) =>
        prev.map((item) =>
          item[primaryKey] === newItem[primaryKey] ? newItem : item
        )
      );

      // Remove from optimistic if confirmed
      setOptimisticUpdates((opt) => {
        const updated = new Map(opt);
        updated.delete(String(newItem[primaryKey]));
        return updated;
      });

      addChange('UPDATE', newItem, oldItem);
      onUpdateRef.current?.(newItem, oldItem);
    },
    [primaryKey, addChange]
  );

  // Handle DELETE
  const handleDelete = useCallback(
    (oldItem: T) => {
      setData((prev) =>
        prev.filter((item) => item[primaryKey] !== oldItem[primaryKey])
      );

      // Remove from optimistic if confirmed
      setOptimisticUpdates((opt) => {
        const updated = new Map(opt);
        updated.delete(String(oldItem[primaryKey]));
        return updated;
      });

      addChange('DELETE', null, oldItem);
      onDeleteRef.current?.(oldItem);
    },
    [primaryKey, addChange]
  );

  // Optimistic update
  const optimisticUpdate = useCallback(
    (type: 'insert' | 'update' | 'delete', item: T) => {
      const key = String(item[primaryKey]);

      // Store original state for rollback
      const originalData = [...data];
      const originalOptimistic = new Map(optimisticUpdates);

      // Apply optimistic update
      if (type === 'insert') {
        setData((prev) => [item, ...prev].slice(0, maxItems));
        setOptimisticUpdates((opt) => new Map(opt).set(key, item));
        addChange('INSERT', item, null, true);
      } else if (type === 'update') {
        setData((prev) =>
          prev.map((existing) =>
            existing[primaryKey] === item[primaryKey] ? item : existing
          )
        );
        setOptimisticUpdates((opt) => new Map(opt).set(key, item));
        addChange('UPDATE', item, null, true);
      } else if (type === 'delete') {
        setData((prev) =>
          prev.filter((existing) => existing[primaryKey] !== item[primaryKey])
        );
        setOptimisticUpdates((opt) => new Map(opt).set(key, item));
        addChange('DELETE', null, item, true);
      }

      // Return rollback function
      return () => {
        setData(originalData);
        setOptimisticUpdates(originalOptimistic);
      };
    },
    [data, optimisticUpdates, primaryKey, maxItems, addChange]
  );

  // Clear changes
  const clearChanges = useCallback(() => {
    setRecentChanges([]);
  }, []);

  // Refresh data
  const refresh = useCallback((newData: T[]) => {
    setData(newData);
    setOptimisticUpdates(new Map());
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!enabled) {
      const id = setTimeout(() => setStatus('disconnected'), 0);
      return () => clearTimeout(id);
    }

    const connectingId = setTimeout(() => setStatus('connecting'), 0);

    const unsubscribe = subscribeToTable<T>(
      {
        table,
        schema,
        filter: filterString,
        enabled,
      },
      {
        onInsert: handleInsert,
        onUpdate: handleUpdate,
        onDelete: handleDelete,
      }
    );

    const connectedId = setTimeout(() => {
      setStatus('connected');
      onConnectionChangeRef.current?.('connected');
    }, 0);

    return () => {
      clearTimeout(connectingId);
      clearTimeout(connectedId);
      unsubscribe();
      setStatus('disconnected');
      onConnectionChangeRef.current?.('disconnected');
    };
  }, [table, schema, filterString, enabled, handleInsert, handleUpdate, handleDelete]);

  // Sync initial data when it changes
  useEffect(() => {
    if (initialData.length > 0) {
      const id = setTimeout(() => setData(initialData), 0);
      return () => clearTimeout(id);
    }
  }, [initialData]);

  return {
    data,
    recentChanges,
    status,
    isOptimistic: optimisticUpdates.size > 0,
    optimisticUpdate,
    clearChanges,
    refresh,
  };
}

// =============================================================================
// Convenience Hooks
// =============================================================================

/**
 * Simplified hook that only returns data and status
 */
export function useRealtimeData<T extends { id?: string | number }>(
  table: string,
  filter?: string | RealtimeFilter[],
  initialData?: T[]
): { data: T[]; status: ConnectionStatus } {
  const { data, status } = useRealtimeTable<T>({
    table,
    filter,
    initialData,
  });

  return { data, status };
}
