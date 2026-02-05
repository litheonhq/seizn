/**
 * Offline Storage
 *
 * IndexedDB-based storage for offline data caching.
 *
 * @module lib/offline/offline-storage
 */

export interface StorageItem<T = unknown> {
  key: string;
  value: T;
  type: string;
  expiry: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface StorageOptions {
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Item type for organization */
  type?: string;
}

const DB_NAME = 'seizn-offline';
const DB_VERSION = 1;
const STORE_NAME = 'cached-data';

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
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('expiry', 'expiry', { unique: false });
      }
    };
  });
}

/**
 * Offline Storage Manager
 */
class OfflineStorage {
  /**
   * Get an item from storage
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const item = request.result as StorageItem<T> | undefined;

          if (!item) {
            resolve(null);
            return;
          }

          // Check expiry
          if (item.expiry && item.expiry < Date.now()) {
            // Expired, remove it
            this.remove(key);
            resolve(null);
            return;
          }

          resolve(item.value);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] Get error:', error);
      return null;
    }
  }

  /**
   * Set an item in storage
   */
  async set<T>(key: string, value: T, options: StorageOptions = {}): Promise<void> {
    try {
      const db = await openDB();
      const now = Date.now();

      const item: StorageItem<T> = {
        key,
        value,
        type: options.type || 'default',
        expiry: options.ttl ? now + options.ttl : null,
        createdAt: now,
        updatedAt: now,
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] Set error:', error);
    }
  }

  /**
   * Remove an item from storage
   */
  async remove(key: string): Promise<void> {
    try {
      const db = await openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] Remove error:', error);
    }
  }

  /**
   * Get all items of a type
   */
  async getByType<T>(type: string): Promise<T[]> {
    try {
      const db = await openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('type');
        const request = index.getAll(type);

        request.onsuccess = () => {
          const items = request.result as StorageItem<T>[];
          const now = Date.now();

          // Filter out expired items
          const valid = items
            .filter((item) => !item.expiry || item.expiry > now)
            .map((item) => item.value);

          resolve(valid);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] GetByType error:', error);
      return [];
    }
  }

  /**
   * Clear all items of a type
   */
  async clearType(type: string): Promise<void> {
    try {
      const db = await openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('type');
        const request = index.openCursor(type);

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] ClearType error:', error);
    }
  }

  /**
   * Clear all expired items
   */
  async clearExpired(): Promise<number> {
    try {
      const db = await openDB();
      const now = Date.now();
      let deleted = 0;

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('expiry');
        const range = IDBKeyRange.upperBound(now);
        const request = index.openCursor(range);

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve(deleted);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] ClearExpired error:', error);
      return 0;
    }
  }

  /**
   * Clear all storage
   */
  async clear(): Promise<void> {
    try {
      const db = await openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] Clear error:', error);
    }
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<{
    totalItems: number;
    byType: Record<string, number>;
    totalSize: number;
  }> {
    try {
      const db = await openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const items = request.result as StorageItem[];
          const byType: Record<string, number> = {};

          let totalSize = 0;

          for (const item of items) {
            byType[item.type] = (byType[item.type] || 0) + 1;
            totalSize += JSON.stringify(item).length;
          }

          resolve({
            totalItems: items.length,
            byType,
            totalSize,
          });
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[OfflineStorage] GetStats error:', error);
      return { totalItems: 0, byType: {}, totalSize: 0 };
    }
  }

  /**
   * Get or fetch with caching
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: StorageOptions = {}
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Cache it
    await this.set(key, data, options);

    return data;
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorage();

/**
 * Hook-friendly storage helper
 */
export function createStorageKey(type: string, ...parts: (string | number)[]): string {
  return `${type}:${parts.join(':')}`;
}
