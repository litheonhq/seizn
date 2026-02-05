/**
 * Sync Manager
 *
 * Coordinates background sync of offline operations.
 *
 * @module lib/offline/sync-manager
 */

import { offlineQueue, type QueuedOperation } from './offline-queue';

export interface SyncConfig {
  /** Sync interval in ms (0 to disable auto-sync) */
  syncInterval?: number;
  /** Whether to sync when coming online */
  syncOnOnline?: boolean;
  /** Whether to use background sync API */
  useBackgroundSync?: boolean;
  /** Maximum concurrent sync operations */
  maxConcurrent?: number;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  pendingCount: number;
  failedCount: number;
  errors: Error[];
}

type SyncStatusListener = (status: SyncStatus) => void;

/**
 * Sync Manager Class
 */
export class SyncManager {
  private config: Required<SyncConfig>;
  private status: SyncStatus;
  private listeners: Set<SyncStatusListener> = new Set();
  private intervalId: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(config: SyncConfig = {}) {
    this.config = {
      syncInterval: config.syncInterval ?? 30000, // 30 seconds
      syncOnOnline: config.syncOnOnline ?? true,
      useBackgroundSync: config.useBackgroundSync ?? true,
      maxConcurrent: config.maxConcurrent ?? 3,
    };

    this.status = {
      isSyncing: false,
      lastSyncAt: null,
      pendingCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  /**
   * Initialize the sync manager
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    // Set up online listener
    if (this.config.syncOnOnline && typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.sync();
      });
    }

    // Set up interval sync
    if (this.config.syncInterval > 0) {
      this.intervalId = setInterval(() => {
        if (navigator.onLine) {
          this.sync();
        }
      }, this.config.syncInterval);
    }

    // Subscribe to queue changes
    offlineQueue.subscribe((queue) => {
      this.updateStatus({ pendingCount: queue.length });
    });

    // Register background sync
    if (this.config.useBackgroundSync) {
      await this.registerBackgroundSync();
    }

    this.isInitialized = true;
  }

  /**
   * Destroy the sync manager
   */
  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.listeners.clear();
    this.isInitialized = false;
  }

  /**
   * Register background sync with service worker
   */
  private async registerBackgroundSync(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('sync' in ServiceWorkerRegistration.prototype)) {
      console.log('[SyncManager] Background sync not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-memories');
      console.log('[SyncManager] Background sync registered');
    } catch (error) {
      console.error('[SyncManager] Background sync registration failed:', error);
    }
  }

  /**
   * Perform sync
   */
  async sync(): Promise<{
    processed: number;
    failed: number;
    remaining: number;
  }> {
    if (this.status.isSyncing) {
      console.log('[SyncManager] Sync already in progress');
      return { processed: 0, failed: 0, remaining: this.status.pendingCount };
    }

    if (!navigator.onLine) {
      console.log('[SyncManager] Offline, skipping sync');
      return { processed: 0, failed: 0, remaining: this.status.pendingCount };
    }

    this.updateStatus({ isSyncing: true, errors: [] });

    try {
      const result = await offlineQueue.processAll(async (operation) => {
        return this.executeOperation(operation);
      });

      this.updateStatus({
        isSyncing: false,
        lastSyncAt: new Date(),
        pendingCount: result.remaining,
        failedCount: result.failed,
      });

      return result;
    } catch (error) {
      this.updateStatus({
        isSyncing: false,
        errors: [...this.status.errors, error as Error],
      });

      throw error;
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(operation: QueuedOperation): Promise<boolean> {
    try {
      const response = await fetch(operation.url, {
        method: operation.method,
        headers: operation.headers,
        body: operation.body,
      });

      return response.ok;
    } catch (error) {
      console.error('[SyncManager] Operation failed:', error);
      return false;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Subscribe to status changes
   */
  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(partial: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...partial };

    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  /**
   * Force sync now
   */
  async forceSync(): Promise<void> {
    await this.sync();
  }

  /**
   * Clear failed operations
   */
  async clearFailed(): Promise<void> {
    const operations = await offlineQueue.getAll();

    for (const op of operations) {
      if (op.retryCount >= op.maxRetries) {
        await offlineQueue.remove(op.id);
      }
    }

    this.updateStatus({ failedCount: 0 });
  }
}

// Singleton instance
let syncManager: SyncManager | null = null;

export function getSyncManager(config?: SyncConfig): SyncManager {
  if (!syncManager) {
    syncManager = new SyncManager(config);
  }
  return syncManager;
}

/**
 * Initialize sync manager (call once on app start)
 */
export async function initSyncManager(config?: SyncConfig): Promise<SyncManager> {
  const manager = getSyncManager(config);
  await manager.init();
  return manager;
}
