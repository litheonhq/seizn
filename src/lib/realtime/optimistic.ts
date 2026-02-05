/**
 * Optimistic UI Utilities
 *
 * Provides utilities for implementing optimistic updates in UI,
 * including automatic rollback on failure and sync status tracking.
 *
 * @module lib/realtime/optimistic
 */

import type { OptimisticUpdate, OptimisticState } from './types';

// =============================================================================
// Types
// =============================================================================

export interface OptimisticManagerOptions<T> {
  /** Primary key field for identifying items */
  primaryKey?: keyof T;
  /** Timeout for pending updates before auto-rollback (ms) */
  pendingTimeout?: number;
  /** Callback when an update is confirmed */
  onConfirm?: (update: OptimisticUpdate<T>) => void;
  /** Callback when an update fails */
  onRollback?: (update: OptimisticUpdate<T>, error: Error) => void;
}

export interface OptimisticAction<T> {
  /** Unique ID for tracking */
  id: string;
  /** The optimistic data */
  data: T;
  /** Rollback function */
  rollback: () => void;
  /** Confirm the update (call when server confirms) */
  confirm: () => void;
  /** Fail the update (triggers rollback) */
  fail: (error: Error) => void;
}

// =============================================================================
// Optimistic Manager Class
// =============================================================================

/**
 * Manages optimistic updates with rollback support
 *
 * @example
 * ```ts
 * const manager = new OptimisticManager<Memory>({
 *   primaryKey: 'id',
 *   onRollback: (update, error) => {
 *     toast.error(`Failed to save: ${error.message}`);
 *   },
 * });
 *
 * // Apply optimistic update
 * const { data, rollback, confirm, fail } = manager.insert(
 *   currentData,
 *   { id: 'temp-1', content: 'New memory...' }
 * );
 *
 * // Update UI immediately with `data`
 * setMemories(data);
 *
 * try {
 *   const result = await saveMemory(newMemory);
 *   confirm();
 *   // Replace temp data with server data
 *   setMemories(prev => prev.map(m => m.id === 'temp-1' ? result : m));
 * } catch (error) {
 *   fail(error);
 *   // Rollback is called automatically
 * }
 * ```
 */
export class OptimisticManager<T extends { id?: string | number; [key: string]: unknown }> {
  private pendingUpdates = new Map<string, OptimisticUpdate<T>>();
  private rollbackData = new Map<string, T[]>();
  private options: Required<OptimisticManagerOptions<T>>;

  constructor(options: OptimisticManagerOptions<T> = {}) {
    this.options = {
      primaryKey: (options.primaryKey ?? 'id') as keyof T,
      pendingTimeout: options.pendingTimeout ?? 30000,
      onConfirm: options.onConfirm ?? (() => {}),
      onRollback: options.onRollback ?? (() => {}),
    };
  }

  /**
   * Generate a unique ID for optimistic updates
   */
  private generateId(): string {
    return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Apply an optimistic insert
   */
  insert(
    currentData: T[],
    newItem: T
  ): { data: T[]; action: OptimisticAction<T> } {
    const updateId = this.generateId();
    const newData = [newItem, ...currentData];

    // Store for potential rollback
    this.rollbackData.set(updateId, currentData);

    const update: OptimisticUpdate<T> = {
      id: updateId,
      type: 'create',
      data: newItem,
      timestamp: Date.now(),
      status: 'pending',
    };
    this.pendingUpdates.set(updateId, update);

    // Set up timeout for auto-rollback
    const timeout = setTimeout(() => {
      if (this.pendingUpdates.get(updateId)?.status === 'pending') {
        this.fail(updateId, new Error('Optimistic update timeout'));
      }
    }, this.options.pendingTimeout);

    return {
      data: newData,
      action: {
        id: updateId,
        data: newItem,
        rollback: () => this.rollback(updateId),
        confirm: () => {
          clearTimeout(timeout);
          this.confirm(updateId);
        },
        fail: (error: Error) => {
          clearTimeout(timeout);
          this.fail(updateId, error);
        },
      },
    };
  }

  /**
   * Apply an optimistic update
   */
  update(
    currentData: T[],
    updatedItem: T
  ): { data: T[]; action: OptimisticAction<T> } {
    const updateId = this.generateId();
    const { primaryKey } = this.options;

    const newData = currentData.map((item) =>
      item[primaryKey] === updatedItem[primaryKey] ? updatedItem : item
    );

    this.rollbackData.set(updateId, currentData);

    const update: OptimisticUpdate<T> = {
      id: updateId,
      type: 'update',
      data: updatedItem,
      timestamp: Date.now(),
      status: 'pending',
    };
    this.pendingUpdates.set(updateId, update);

    const timeout = setTimeout(() => {
      if (this.pendingUpdates.get(updateId)?.status === 'pending') {
        this.fail(updateId, new Error('Optimistic update timeout'));
      }
    }, this.options.pendingTimeout);

    return {
      data: newData,
      action: {
        id: updateId,
        data: updatedItem,
        rollback: () => this.rollback(updateId),
        confirm: () => {
          clearTimeout(timeout);
          this.confirm(updateId);
        },
        fail: (error: Error) => {
          clearTimeout(timeout);
          this.fail(updateId, error);
        },
      },
    };
  }

  /**
   * Apply an optimistic delete
   */
  delete(
    currentData: T[],
    itemToDelete: T
  ): { data: T[]; action: OptimisticAction<T> } {
    const updateId = this.generateId();
    const { primaryKey } = this.options;

    const newData = currentData.filter(
      (item) => item[primaryKey] !== itemToDelete[primaryKey]
    );

    this.rollbackData.set(updateId, currentData);

    const update: OptimisticUpdate<T> = {
      id: updateId,
      type: 'delete',
      data: itemToDelete,
      timestamp: Date.now(),
      status: 'pending',
    };
    this.pendingUpdates.set(updateId, update);

    const timeout = setTimeout(() => {
      if (this.pendingUpdates.get(updateId)?.status === 'pending') {
        this.fail(updateId, new Error('Optimistic update timeout'));
      }
    }, this.options.pendingTimeout);

    return {
      data: newData,
      action: {
        id: updateId,
        data: itemToDelete,
        rollback: () => this.rollback(updateId),
        confirm: () => {
          clearTimeout(timeout);
          this.confirm(updateId);
        },
        fail: (error: Error) => {
          clearTimeout(timeout);
          this.fail(updateId, error);
        },
      },
    };
  }

  /**
   * Confirm an optimistic update
   */
  private confirm(updateId: string): void {
    const update = this.pendingUpdates.get(updateId);
    if (update) {
      update.status = 'confirmed';
      this.options.onConfirm(update);
      this.pendingUpdates.delete(updateId);
      this.rollbackData.delete(updateId);
    }
  }

  /**
   * Fail an optimistic update and trigger rollback callback
   */
  private fail(updateId: string, error: Error): void {
    const update = this.pendingUpdates.get(updateId);
    if (update && update.status === 'pending') {
      update.status = 'failed';
      update.error = error;
      this.options.onRollback(update, error);
      this.pendingUpdates.delete(updateId);
      this.rollbackData.delete(updateId);
    }
  }

  /**
   * Get rollback data
   */
  private rollback(updateId: string): T[] | undefined {
    const data = this.rollbackData.get(updateId);
    this.pendingUpdates.delete(updateId);
    this.rollbackData.delete(updateId);
    return data;
  }

  /**
   * Get pending updates count
   */
  getPendingCount(): number {
    return this.pendingUpdates.size;
  }

  /**
   * Check if there are any pending updates
   */
  hasPending(): boolean {
    return this.pendingUpdates.size > 0;
  }

  /**
   * Get all pending updates
   */
  getPendingUpdates(): OptimisticUpdate<T>[] {
    return Array.from(this.pendingUpdates.values());
  }

  /**
   * Clear all pending updates (force cleanup)
   */
  clear(): void {
    this.pendingUpdates.clear();
    this.rollbackData.clear();
  }
}

// =============================================================================
// Standalone Functions
// =============================================================================

/**
 * Create an optimistic insert without a manager
 */
export function optimisticInsert<T extends { id?: string | number }>(
  data: T[],
  newItem: T,
  primaryKey: keyof T = 'id' as keyof T
): { data: T[]; rollback: () => T[] } {
  const originalData = [...data];

  return {
    data: [newItem, ...data],
    rollback: () => originalData,
  };
}

/**
 * Create an optimistic update without a manager
 */
export function optimisticUpdate<T extends { id?: string | number }>(
  data: T[],
  updatedItem: T,
  primaryKey: keyof T = 'id' as keyof T
): { data: T[]; rollback: () => T[] } {
  const originalData = [...data];

  return {
    data: data.map((item) =>
      item[primaryKey] === updatedItem[primaryKey] ? updatedItem : item
    ),
    rollback: () => originalData,
  };
}

/**
 * Create an optimistic delete without a manager
 */
export function optimisticDelete<T extends { id?: string | number }>(
  data: T[],
  itemToDelete: T,
  primaryKey: keyof T = 'id' as keyof T
): { data: T[]; rollback: () => T[] } {
  const originalData = [...data];

  return {
    data: data.filter((item) => item[primaryKey] !== itemToDelete[primaryKey]),
    rollback: () => originalData,
  };
}

// =============================================================================
// Sync Status Utilities
// =============================================================================

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  errors: Error[];
}

/**
 * Create a sync status tracker
 */
export function createSyncTracker() {
  let status: SyncStatus = {
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    errors: [],
  };

  const listeners = new Set<(status: SyncStatus) => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener(status);
    }
  };

  return {
    startSync: () => {
      status = { ...status, isSyncing: true, pendingCount: status.pendingCount + 1 };
      notify();
    },

    endSync: (success: boolean, error?: Error) => {
      status = {
        ...status,
        isSyncing: status.pendingCount > 1,
        pendingCount: Math.max(0, status.pendingCount - 1),
        lastSyncAt: success ? new Date() : status.lastSyncAt,
        errors: error ? [...status.errors.slice(-9), error] : status.errors,
      };
      notify();
    },

    getStatus: () => ({ ...status }),

    clearErrors: () => {
      status = { ...status, errors: [] };
      notify();
    },

    subscribe: (listener: (status: SyncStatus) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
