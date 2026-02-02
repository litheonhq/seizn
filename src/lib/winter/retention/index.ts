/**
 * Data Retention Module
 *
 * Comprehensive data retention management:
 * - Per-organization retention schedules
 * - Legal holds for compliance
 * - Auto-deletion after retention period
 * - Execution logging and history
 */

// Types
export * from './types';

// Legal Holds
export {
  createLegalHold,
  getLegalHold,
  listLegalHolds,
  updateLegalHold,
  releaseLegalHold,
  isUnderLegalHold,
  getLegalHoldStats,
  expireLegalHolds,
} from './legal-holds';

// Retention Schedules
export {
  createRetentionSchedule,
  getRetentionSchedule,
  listRetentionSchedules,
  updateRetentionSchedule,
  deleteRetentionSchedule,
  getEffectiveRetentionSchedule,
  getEffectiveRetentionDays,
  checkRetentionStatus,
  previewRetention,
  getDefaultRetentionDays,
} from './schedules';

// Execution
export {
  executeRetention,
  getExecutionHistory,
  runScheduledRetention,
} from './executor';

export type {
  ExecuteRetentionParams,
  ExecuteRetentionResult,
} from './executor';
