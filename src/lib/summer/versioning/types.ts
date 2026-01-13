/**
 * Versioned Index Types
 *
 * Type definitions for index versioning system.
 * Supports semantic versioning, version comparison, and snapshots.
 */

// ============================================
// Version Identifiers
// ============================================

/**
 * Semantic version format: major.minor.patch
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse semantic version string (e.g., "1.2.3")
 */
export function parseSemanticVersion(version: string): SemanticVersion {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Format semantic version as string
 */
export function formatSemanticVersion(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Compare two semantic versions
 * Returns: -1 (a < b), 0 (a == b), 1 (a > b)
 */
export function compareSemanticVersions(a: SemanticVersion, b: SemanticVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

// ============================================
// Index Version
// ============================================

/**
 * Version type indicating the nature of the change
 */
export type VersionType = 'major' | 'minor' | 'patch';

/**
 * Represents a single version of an index
 */
export interface IndexVersion {
  /** Unique version identifier (UUID) */
  id: string;

  /** Collection this version belongs to */
  collectionId: string;

  /** Semantic version string */
  version: string;

  /** Parsed semantic version */
  semanticVersion: SemanticVersion;

  /** Version creation timestamp */
  createdAt: Date;

  /** User who created this version */
  createdBy: string;

  /** Human-readable change summary */
  changeSummary: string;

  /** Number of documents in this version */
  documentCount: number;

  /** Total number of chunks in this version */
  chunkCount: number;

  /** Embedding dimensions used */
  embeddingDimensions: number;

  /** Embedding provider (e.g., "voyage", "openai") */
  embeddingProvider: string;

  /** Embedding model (e.g., "voyage-3") */
  embeddingModel: string;

  /** Previous version ID (null for first version) */
  previousVersionId: string | null;

  /** Whether this is the current active version */
  isActive: boolean;

  /** Optional tags for organization */
  tags?: string[];

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new version
 */
export interface CreateVersionInput {
  collectionId: string;
  userId: string;
  changeSummary: string;
  versionType?: VersionType;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Input for restoring a version
 */
export interface RestoreVersionInput {
  versionId: string;
  userId: string;
  reason?: string;
}

// ============================================
// Version Diff
// ============================================

/**
 * Type of change to a document or chunk
 */
export type DiffChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * Represents a document-level change between versions
 */
export interface DocumentDiff {
  /** Document ID */
  documentId: string;

  /** Document title (if available) */
  title?: string;

  /** Type of change */
  changeType: DiffChangeType;

  /** Content hash in previous version */
  previousHash?: string;

  /** Content hash in current version */
  currentHash?: string;

  /** Number of chunks changed */
  chunksChanged: number;

  /** Detailed chunk changes (optional) */
  chunkDiffs?: ChunkDiff[];
}

/**
 * Represents a chunk-level change between versions
 */
export interface ChunkDiff {
  /** Chunk index */
  chunkIndex: number;

  /** Type of change */
  changeType: DiffChangeType;

  /** Previous content (for removed/modified) */
  previousContent?: string;

  /** Current content (for added/modified) */
  currentContent?: string;

  /** Previous hash */
  previousHash?: string;

  /** Current hash */
  currentHash?: string;
}

/**
 * Complete diff between two versions
 */
export interface VersionDiff {
  /** Source version ID */
  sourceVersionId: string;

  /** Source version string */
  sourceVersion: string;

  /** Target version ID */
  targetVersionId: string;

  /** Target version string */
  targetVersion: string;

  /** Collection ID */
  collectionId: string;

  /** Diff generation timestamp */
  generatedAt: Date;

  /** Summary statistics */
  summary: {
    documentsAdded: number;
    documentsRemoved: number;
    documentsModified: number;
    documentsUnchanged: number;
    totalChunksAdded: number;
    totalChunksRemoved: number;
    totalChunksModified: number;
  };

  /** Document-level changes */
  documents: DocumentDiff[];
}

// ============================================
// Version Snapshot
// ============================================

/**
 * Snapshot status
 */
export type SnapshotStatus = 'pending' | 'creating' | 'completed' | 'failed' | 'expired';

/**
 * Snapshot format
 */
export type SnapshotFormat = 'json' | 'parquet' | 'sqlite';

/**
 * Represents a complete snapshot of an index version
 */
export interface VersionSnapshot {
  /** Snapshot ID */
  id: string;

  /** Version this snapshot represents */
  versionId: string;

  /** Version string */
  version: string;

  /** Collection ID */
  collectionId: string;

  /** User who created the snapshot */
  createdBy: string;

  /** Snapshot creation timestamp */
  createdAt: Date;

  /** Snapshot status */
  status: SnapshotStatus;

  /** Snapshot format */
  format: SnapshotFormat;

  /** Storage location (e.g., S3 URL) */
  storageUrl?: string;

  /** File size in bytes */
  sizeBytes?: number;

  /** Checksum for integrity verification */
  checksum?: string;

  /** Expiration time (for auto-cleanup) */
  expiresAt?: Date;

  /** Number of documents in snapshot */
  documentCount: number;

  /** Number of chunks in snapshot */
  chunkCount: number;

  /** Whether embeddings are included */
  includesEmbeddings: boolean;

  /** Snapshot metadata */
  metadata?: Record<string, unknown>;

  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Input for creating a snapshot
 */
export interface CreateSnapshotInput {
  versionId: string;
  userId: string;
  format?: SnapshotFormat;
  includeEmbeddings?: boolean;
  expiresInDays?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for restoring from a snapshot
 */
export interface RestoreSnapshotInput {
  snapshotId: string;
  userId: string;
  targetCollectionId?: string;
  restoreAsNewVersion?: boolean;
}

// ============================================
// Database Row Types (Supabase)
// ============================================

/**
 * Database row for summer_index_versions table
 */
export interface IndexVersionRow {
  id: string;
  collection_id: string;
  version: string;
  version_major: number;
  version_minor: number;
  version_patch: number;
  created_at: string;
  created_by: string;
  change_summary: string;
  document_count: number;
  chunk_count: number;
  embedding_dimensions: number;
  embedding_provider: string;
  embedding_model: string;
  previous_version_id: string | null;
  is_active: boolean;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Database row for summer_version_snapshots table
 */
export interface VersionSnapshotRow {
  id: string;
  version_id: string;
  collection_id: string;
  created_by: string;
  created_at: string;
  status: SnapshotStatus;
  format: SnapshotFormat;
  storage_url: string | null;
  size_bytes: number | null;
  checksum: string | null;
  expires_at: string | null;
  document_count: number;
  chunk_count: number;
  includes_embeddings: boolean;
  metadata: Record<string, unknown> | null;
  error: string | null;
}

// ============================================
// Converters
// ============================================

/**
 * Convert database row to IndexVersion
 */
export function rowToIndexVersion(row: IndexVersionRow): IndexVersion {
  return {
    id: row.id,
    collectionId: row.collection_id,
    version: row.version,
    semanticVersion: {
      major: row.version_major,
      minor: row.version_minor,
      patch: row.version_patch,
    },
    createdAt: new Date(row.created_at),
    createdBy: row.created_by,
    changeSummary: row.change_summary,
    documentCount: row.document_count,
    chunkCount: row.chunk_count,
    embeddingDimensions: row.embedding_dimensions,
    embeddingProvider: row.embedding_provider,
    embeddingModel: row.embedding_model,
    previousVersionId: row.previous_version_id,
    isActive: row.is_active,
    tags: row.tags ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

/**
 * Convert database row to VersionSnapshot
 */
export function rowToVersionSnapshot(row: VersionSnapshotRow, version?: string): VersionSnapshot {
  return {
    id: row.id,
    versionId: row.version_id,
    version: version ?? '',
    collectionId: row.collection_id,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    status: row.status,
    format: row.format,
    storageUrl: row.storage_url ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    checksum: row.checksum ?? undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    documentCount: row.document_count,
    chunkCount: row.chunk_count,
    includesEmbeddings: row.includes_embeddings,
    metadata: row.metadata ?? undefined,
    error: row.error ?? undefined,
  };
}
