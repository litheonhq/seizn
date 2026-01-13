/**
 * Versioned Index Module
 *
 * Exports all versioning functionality for index management.
 */

// Types
export type {
  SemanticVersion,
  VersionType,
  IndexVersion,
  CreateVersionInput,
  RestoreVersionInput,
  DiffChangeType,
  DocumentDiff,
  ChunkDiff,
  VersionDiff,
  SnapshotStatus,
  SnapshotFormat,
  VersionSnapshot,
  CreateSnapshotInput,
  RestoreSnapshotInput,
  IndexVersionRow,
  VersionSnapshotRow,
} from './types';

// Type utilities
export {
  parseSemanticVersion,
  formatSemanticVersion,
  compareSemanticVersions,
  rowToIndexVersion,
  rowToVersionSnapshot,
} from './types';

// Version Manager
export {
  getCurrentVersion,
  getVersionById,
  createVersion,
  listVersions,
  getVersionHistory,
  restoreVersion,
  verifyCollectionAccess,
  getVersionPair,
  pruneVersions,
} from './version-manager';

// Diff Engine
export {
  generateVersionDiff,
  getQuickDiffSummary,
  detectVersionType,
} from './diff-engine';

// Snapshot Manager
export {
  createSnapshot,
  getSnapshotById,
  listSnapshots,
  restoreFromSnapshot,
  deleteSnapshot,
  cleanupExpiredSnapshots,
  exportSnapshot,
} from './snapshot';
