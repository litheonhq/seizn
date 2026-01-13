/**
 * Self-Healing Index
 *
 * Automatic detection and repair of index issues including:
 * - Stale embeddings
 * - Orphaned chunks
 * - Missing embeddings
 * - Index drift
 */

// Types
export * from './types';

// Scanner - Issue detection
export {
  scanCollection,
  quickHealthCheck,
  countIssuesByType,
  saveHealthRecord,
  getHealthRecord,
} from './scanner';

// Healer - Issue resolution
export {
  healIssues,
  reembedChunks,
  deleteChunks,
  quarantineChunks,
  updateChunkMetadata,
  flagChunks,
  resolveQueuedIssues,
  getPendingIssues,
} from './healer';

// Scheduler - Job management
export {
  scheduleHealingJob,
  getNextJob,
  executeJob,
  getJobStatus,
  cancelJob,
  pauseJob,
  resumeJob,
  listJobs,
  getHealingConfig,
} from './scheduler';

// Rules - Automation
export {
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  getRule,
  listRules,
  getActiveRules,
  evaluateRule,
  findMatchingRules,
  getDueRules,
  updateRuleAfterExecution,
  createDefaultRules,
  validateRuleRequest,
} from './rules';
