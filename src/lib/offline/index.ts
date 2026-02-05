/**
 * Offline Support Module
 *
 * Provides client-side utilities for offline-first functionality:
 * - Service worker registration
 * - Offline detection
 * - Background sync queue
 * - IndexedDB caching
 *
 * @module lib/offline
 */

export { registerServiceWorker, unregisterServiceWorker } from './service-worker';
export {
  useOnlineStatus,
  useOfflineDetection,
  type OnlineStatusState,
} from './use-online-status';
export {
  offlineQueue,
  type QueuedOperation,
  type OperationType,
} from './offline-queue';
export {
  offlineStorage,
  type StorageItem,
  type StorageOptions,
} from './offline-storage';
export {
  SyncManager,
  getSyncManager,
  initSyncManager,
  type SyncConfig,
  type SyncStatus,
} from './sync-manager';
