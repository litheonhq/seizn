/**
 * Offline Queue
 *
 * Queues operations for later execution when offline.
 *
 * @module lib/offline/offline-queue
 */

export type OperationType = 'create' | 'update' | 'delete' | 'custom';

export interface QueuedOperation {
  id: string;
  type: OperationType;
  entityType: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, unknown>;
}

interface QueueOptions {
  maxRetries?: number;
  onQueueChange?: (queue: QueuedOperation[]) => void;
}

const DB_NAME = 'seizn-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-operations';

/**
 * Open IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('entityType', 'entityType', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Offline Queue Manager
 */
class OfflineQueue {
  private options: QueueOptions;
  private listeners: Set<(queue: QueuedOperation[]) => void> = new Set();

  constructor(options: QueueOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      onQueueChange: options.onQueueChange,
    };
  }

  /**
   * Add operation to queue
   */
  async add(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    const db = await openDB();
    const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const fullOperation: QueuedOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: operation.maxRetries ?? this.options.maxRetries ?? 3,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(fullOperation);

      request.onsuccess = () => {
        this.notifyListeners();
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all queued operations
   */
  async getAll(): Promise<QueuedOperation[]> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get operations by entity type
   */
  async getByType(entityType: string): Promise<QueuedOperation[]> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('entityType');
      const request = index.getAll(entityType);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove operation from queue
   */
  async remove(id: string): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        this.notifyListeners();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update operation retry count
   */
  async incrementRetry(id: string): Promise<QueuedOperation | null> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result as QueuedOperation;

        if (!operation) {
          resolve(null);
          return;
        }

        operation.retryCount += 1;

        const putRequest = store.put(operation);
        putRequest.onsuccess = () => resolve(operation);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Clear all operations
   */
  async clear(): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this.notifyListeners();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get queue count
   */
  async count(): Promise<number> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Process all queued operations
   */
  async processAll(
    executor: (operation: QueuedOperation) => Promise<boolean>
  ): Promise<{
    processed: number;
    failed: number;
    remaining: number;
  }> {
    const operations = await this.getAll();
    let processed = 0;
    let failed = 0;

    for (const operation of operations) {
      try {
        const success = await executor(operation);

        if (success) {
          await this.remove(operation.id);
          processed++;
        } else {
          const updated = await this.incrementRetry(operation.id);

          if (updated && updated.retryCount >= updated.maxRetries) {
            await this.remove(operation.id);
            failed++;
          }
        }
      } catch (error) {
        console.error('[OfflineQueue] Process error:', error);

        const updated = await this.incrementRetry(operation.id);

        if (updated && updated.retryCount >= updated.maxRetries) {
          await this.remove(operation.id);
          failed++;
        }
      }
    }

    const remaining = await this.count();

    return { processed, failed, remaining };
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(callback: (queue: QueuedOperation[]) => void): () => void {
    this.listeners.add(callback);

    // Send initial state
    this.getAll().then(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of queue changes
   */
  private async notifyListeners(): Promise<void> {
    const queue = await this.getAll();

    for (const listener of this.listeners) {
      listener(queue);
    }

    this.options.onQueueChange?.(queue);
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueue();

/**
 * Helper to queue a fetch request
 */
export async function queueFetch(
  url: string,
  options: RequestInit & { entityType?: string; operationType?: OperationType; metadata?: Record<string, unknown> }
): Promise<string> {
  const { entityType = 'unknown', operationType = 'custom', metadata, ...fetchOptions } = options;

  return offlineQueue.add({
    type: operationType,
    entityType,
    url,
    method: fetchOptions.method || 'GET',
    headers: Object.fromEntries(
      Object.entries(fetchOptions.headers || {}).map(([k, v]) => [k, String(v)])
    ),
    body: typeof fetchOptions.body === 'string' ? fetchOptions.body : undefined,
    maxRetries: 3,
    metadata,
  });
}
