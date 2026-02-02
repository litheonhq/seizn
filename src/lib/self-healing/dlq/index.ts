/**
 * Dead Letter Queue (DLQ) Module
 *
 * Provides dead letter queue functionality for failed healing jobs:
 * - Capture failed jobs after max retries
 * - Manual inspection and debugging
 * - Retry capability
 * - Monitoring and alerting
 */

// Types
export * from './types';

// Core DLQ operations
export {
  moveToDLQ,
  moveJobToDLQById,
  getDLQEntry,
  listDLQEntries,
  retryDLQEntry,
  resolveDLQEntry,
  acknowledgeDLQAlert,
  bulkDLQAction,
  getDLQStats,
  getDLQExtendedStats,
  cleanupOldDLQEntries,
  shouldMoveToDLQ,
} from './dlq';

// Alerting
export {
  getAlertConfig,
  checkDLQThresholds,
  alertOnNewDLQEntry,
  registerDLQMonitoring,
  unregisterDLQMonitoring,
  emitDLQEvent,
  emitEntryCreated,
  emitEntryRetried,
  emitEntryResolved,
} from './alerting';

export type { DLQMonitoringCallback, DLQMonitoringEvent } from './alerting';
