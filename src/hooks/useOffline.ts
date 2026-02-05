'use client';

/**
 * useOffline Hook
 *
 * Comprehensive hook for offline functionality.
 *
 * @module hooks/useOffline
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useOnlineStatus,
  offlineQueue,
  offlineStorage,
  getSyncManager,
  type QueuedOperation,
  type SyncStatus,
} from '@/lib/offline';

export interface UseOfflineOptions {
  /** Auto-sync when coming online */
  autoSync?: boolean;
  /** Callback when coming online */
  onOnline?: () => void;
  /** Callback when going offline */
  onOffline?: () => void;
  /** Callback when sync completes */
  onSyncComplete?: (result: { processed: number; failed: number }) => void;
}

export interface UseOfflineReturn {
  /** Whether currently online */
  isOnline: boolean;
  /** Whether was recently offline */
  wasOffline: boolean;
  /** Sync status */
  syncStatus: SyncStatus;
  /** Pending operations count */
  pendingCount: number;
  /** Queue an operation for later */
  queueOperation: (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => Promise<string>;
  /** Force sync now */
  syncNow: () => Promise<void>;
  /** Cache data for offline access */
  cacheData: <T>(key: string, data: T, ttl?: number) => Promise<void>;
  /** Get cached data */
  getCachedData: <T>(key: string) => Promise<T | null>;
  /** Clear offline cache */
  clearCache: () => Promise<void>;
}

/**
 * Hook for managing offline functionality
 *
 * @example
 * ```tsx
 * function App() {
 *   const {
 *     isOnline,
 *     wasOffline,
 *     pendingCount,
 *     syncNow,
 *     queueOperation,
 *     cacheData,
 *   } = useOffline({
 *     autoSync: true,
 *     onOnline: () => toast.success('Back online!'),
 *     onOffline: () => toast.warning('You are offline'),
 *   });
 *
 *   // Queue operation when offline
 *   const saveMemory = async (memory: Memory) => {
 *     if (!isOnline) {
 *       await queueOperation({
 *         type: 'create',
 *         entityType: 'memory',
 *         url: '/api/memories',
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify(memory),
 *       });
 *       return;
 *     }
 *
 *     await fetch('/api/memories', { ... });
 *   };
 * }
 * ```
 */
export function useOffline(options: UseOfflineOptions = {}): UseOfflineReturn {
  const { autoSync = true, onOnline, onOffline, onSyncComplete } = options;

  // Online status
  const { isOnline, wasOffline } = useOnlineStatus({
    onOnline: () => {
      onOnline?.();
      if (autoSync) {
        syncNow();
      }
    },
    onOffline,
  });

  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    failedCount: 0,
    errors: [],
  });

  // Pending count
  const [pendingCount, setPendingCount] = useState(0);

  // Subscribe to queue changes
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe((queue) => {
      setPendingCount(queue.length);
    });

    return unsubscribe;
  }, []);

  // Subscribe to sync status
  useEffect(() => {
    const syncManager = getSyncManager();
    const unsubscribe = syncManager.subscribe(setSyncStatus);

    return unsubscribe;
  }, []);

  // Queue operation
  const queueOperation = useCallback(
    async (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => {
      return offlineQueue.add(operation);
    },
    []
  );

  // Force sync
  const syncNow = useCallback(async () => {
    const syncManager = getSyncManager();
    const result = await syncManager.sync();
    onSyncComplete?.({ processed: result.processed, failed: result.failed });
  }, [onSyncComplete]);

  // Cache data
  const cacheData = useCallback(
    async <T,>(key: string, data: T, ttl?: number) => {
      await offlineStorage.set(key, data, { ttl });
    },
    []
  );

  // Get cached data
  const getCachedData = useCallback(async <T,>(key: string): Promise<T | null> => {
    return offlineStorage.get<T>(key);
  }, []);

  // Clear cache
  const clearCache = useCallback(async () => {
    await offlineStorage.clear();
  }, []);

  return {
    isOnline,
    wasOffline,
    syncStatus,
    pendingCount,
    queueOperation,
    syncNow,
    cacheData,
    getCachedData,
    clearCache,
  };
}

/**
 * Simpler hook for just online status
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
