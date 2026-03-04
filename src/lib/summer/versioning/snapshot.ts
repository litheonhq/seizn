/**
 * Snapshot Manager
 *
 * Handles snapshot creation, storage, and restoration.
 */

import { createHash, randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import {
  VersionSnapshot,
  VersionSnapshotRow,
  CreateSnapshotInput,
  RestoreSnapshotInput,
  SnapshotStatus,
  SnapshotFormat,
  rowToVersionSnapshot,
} from './types';
import { getVersionById, createVersion } from './version-manager';

const SNAPSHOT_BUCKET = process.env.SUMMER_SNAPSHOT_BUCKET || 'summer-snapshots';
const MAX_INLINE_SNAPSHOT_BYTES = parsePositiveInt(
  process.env.SUMMER_SNAPSHOT_INLINE_MAX_BYTES,
  512 * 1024
);

interface SnapshotPayload {
  version: string;
  exportedAt: string;
  collectionId: string;
  documents: Record<string, unknown>[];
  chunks: Record<string, unknown>[];
  metadata: {
    documentCount: number;
    chunkCount: number;
    includeEmbeddings: boolean;
    format: SnapshotFormat;
  };
}

interface SnapshotStoragePointer {
  bucket: string;
  path: string;
  contentType: string;
}

type SnapshotMetadata = Record<string, unknown> & {
  _snapshotStorage?: SnapshotStoragePointer;
  _snapshotInline?: {
    encoding: 'base64';
    sizeBytes: number;
    data: string;
  };
  _snapshotGeneratedAt?: string;
  _snapshotInfo?: {
    format: SnapshotFormat;
    includeEmbeddings: boolean;
    documentCount: number;
    chunkCount: number;
  };
  _snapshotStorageError?: string;
};

// ============================================
// Snapshot Creation
// ============================================

/**
 * Create a snapshot of a version
 */
export async function createSnapshot(input: CreateSnapshotInput): Promise<VersionSnapshot> {
  const supabase = createServerClient();

  // Get the version
  const version = await getVersionById(input.versionId);
  if (!version) {
    throw new Error(`Version not found: ${input.versionId}`);
  }

  const format = input.format ?? 'json';
  const includeEmbeddings = input.includeEmbeddings ?? false;

  // Calculate expiration
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Create snapshot record
  const { data, error } = await supabase
    .from('summer_version_snapshots')
    .insert({
      version_id: input.versionId,
      collection_id: version.collectionId,
      created_by: input.userId,
      status: 'pending' as SnapshotStatus,
      format,
      document_count: version.documentCount,
      chunk_count: version.chunkCount,
      includes_embeddings: includeEmbeddings,
      expires_at: expiresAt?.toISOString() ?? null,
      metadata: input.metadata ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create snapshot: ${error?.message}`);
  }

  // Trigger async snapshot generation
  // In a real implementation, this would queue a background job
  void generateSnapshotData(data.id, version.collectionId, format, includeEmbeddings);

  return rowToVersionSnapshot(data as VersionSnapshotRow, version.version);
}

/**
 * Generate snapshot data (async background process)
 */
async function generateSnapshotData(
  snapshotId: string,
  collectionId: string,
  format: SnapshotFormat,
  includeEmbeddings: boolean
): Promise<void> {
  const supabase = createServerClient();

  try {
    // Update status to creating
    await supabase
      .from('summer_version_snapshots')
      .update({ status: 'creating' as SnapshotStatus })
      .eq('id', snapshotId);

    // Load existing metadata and version
    const { data: snapshotRow, error: snapshotError } = await supabase
      .from('summer_version_snapshots')
      .select('version_id, metadata')
      .eq('id', snapshotId)
      .single();
    if (snapshotError || !snapshotRow) {
      throw new Error(`Failed to load snapshot metadata: ${snapshotError?.message}`);
    }

    const existingMetadata = toSnapshotMetadata(snapshotRow.metadata);
    const version = await getVersionById(snapshotRow.version_id as string);

    // Fetch all documents
    const { data: documents, error: docError } = await supabase
      .from('summer_documents')
      .select('id, external_id, title, source, metadata, content_hash, current_version, created_at')
      .eq('collection_id', collectionId);

    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`);
    }

    // Fetch all chunks
    const chunkSelect = includeEmbeddings
      ? 'document_id, chunk_index, content, token_count, chunk_hash, version, metadata, embedding'
      : 'document_id, chunk_index, content, token_count, chunk_hash, version, metadata';

    const { data: chunks, error: chunkError } = await supabase
      .from('summer_chunks')
      .select(chunkSelect)
      .eq('collection_id', collectionId);

    if (chunkError) {
      throw new Error(`Failed to fetch chunks: ${chunkError.message}`);
    }

    // Build snapshot data
    const snapshotData: SnapshotPayload = {
      version: version?.version ?? 'unknown',
      exportedAt: new Date().toISOString(),
      collectionId,
      documents: (documents ?? []) as unknown as Record<string, unknown>[],
      chunks: (chunks ?? []) as unknown as Record<string, unknown>[],
      metadata: {
        documentCount: (documents ?? []).length,
        chunkCount: (chunks ?? []).length,
        includeEmbeddings,
        format,
      },
    };

    // Serialize based on format
    let serialized: string;
    switch (format) {
      case 'json':
        serialized = JSON.stringify(snapshotData, null, 2);
        break;
      case 'parquet':
      case 'sqlite':
        // For now, fall back to JSON
        // Real implementation would use proper format conversion
        serialized = JSON.stringify(snapshotData);
        break;
      default:
        serialized = JSON.stringify(snapshotData);
    }

    // Calculate checksum
    const checksum = createHash('sha256').update(serialized).digest('hex');
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');

    const generatedAt = new Date().toISOString();
    let metadata = buildSnapshotMetadata(existingMetadata, {
      generatedAt,
      format,
      includeEmbeddings,
      documentCount: (documents ?? []).length,
      chunkCount: (chunks ?? []).length,
    });

    let storageUrl: string | null = null;
    try {
      const storageResult = await uploadSnapshotToStorage(
        snapshotId,
        collectionId,
        format,
        serialized
      );
      storageUrl = storageResult.storageUrl;
      metadata = buildSnapshotMetadata(metadata, {
        generatedAt,
        format,
        includeEmbeddings,
        documentCount: (documents ?? []).length,
        chunkCount: (chunks ?? []).length,
        serialized,
        storage: storageResult.storage,
      });
    } catch (storageError) {
      const errorMessage =
        storageError instanceof Error ? storageError.message : 'Unknown storage error';
      if (sizeBytes > MAX_INLINE_SNAPSHOT_BYTES) {
        throw new Error(
          `Snapshot payload persistence failed and inline fallback is too large: ${errorMessage}`
        );
      }
      metadata = buildSnapshotMetadata(metadata, {
        generatedAt,
        format,
        includeEmbeddings,
        documentCount: (documents ?? []).length,
        chunkCount: (chunks ?? []).length,
        serialized,
        storageError: errorMessage,
      });
    }

    // Update snapshot with results
    await supabase
      .from('summer_version_snapshots')
      .update({
        status: 'completed' as SnapshotStatus,
        storage_url: storageUrl,
        size_bytes: sizeBytes,
        checksum,
        metadata,
      })
      .eq('id', snapshotId);
  } catch (err) {
    // Update status to failed
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('summer_version_snapshots')
      .update({
        status: 'failed' as SnapshotStatus,
        error: errorMessage,
      })
      .eq('id', snapshotId);
  }
}

// ============================================
// Snapshot Retrieval
// ============================================

/**
 * Get a snapshot by ID
 */
export async function getSnapshotById(snapshotId: string): Promise<VersionSnapshot | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('summer_version_snapshots')
    .select(
      `
      *,
      summer_index_versions!inner (version)
    `
    )
    .eq('id', snapshotId)
    .single();

  if (error || !data) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versionInfo = (data as any).summer_index_versions;
  return rowToVersionSnapshot(data as VersionSnapshotRow, versionInfo?.version ?? '');
}

/**
 * List snapshots for a collection
 */
export async function listSnapshots(
  collectionId: string,
  options?: {
    versionId?: string;
    status?: SnapshotStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ snapshots: VersionSnapshot[]; total: number }> {
  const supabase = createServerClient();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('summer_version_snapshots')
    .select(
      `
      *,
      summer_index_versions!inner (version)
    `,
      { count: 'exact' }
    )
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.versionId) {
    query = query.eq('version_id', options.versionId);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list snapshots: ${error.message}`);
  }

  return {
    snapshots: (data ?? []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const versionInfo = (row as any).summer_index_versions;
      return rowToVersionSnapshot(row as VersionSnapshotRow, versionInfo?.version ?? '');
    }),
    total: count ?? 0,
  };
}

// ============================================
// Snapshot Restoration
// ============================================

/**
 * Restore from a snapshot
 */
export async function restoreFromSnapshot(input: RestoreSnapshotInput): Promise<{
  success: boolean;
  newVersionId?: string;
  message: string;
}> {
  // Get snapshot
  const snapshot = await getSnapshotById(input.snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot not found: ${input.snapshotId}`);
  }

  if (snapshot.status !== 'completed') {
    throw new Error(`Snapshot is not ready for restoration: status=${snapshot.status}`);
  }

  // Get version info
  const version = await getVersionById(snapshot.versionId);
  if (!version) {
    throw new Error('Associated version not found');
  }

  const targetCollectionId = input.targetCollectionId ?? snapshot.collectionId;
  const restoreAsNew = input.restoreAsNewVersion ?? true;

  const { serialized } = await loadSerializedSnapshot(input.snapshotId);
  const payload = parseSnapshotPayload(serialized);

  if (payload.collectionId !== snapshot.collectionId) {
    throw new Error(
      `Snapshot collection mismatch: expected ${snapshot.collectionId}, got ${payload.collectionId}`
    );
  }

  if (restoreAsNew) {
    const newVersion = await createVersion({
      collectionId: targetCollectionId,
      userId: input.userId,
      changeSummary: `Restored from snapshot ${snapshot.id} (v${snapshot.version})`,
      versionType: 'patch',
      tags: ['snapshot-restore', `from-snapshot-${snapshot.id}`],
      metadata: {
        restoredFromSnapshotId: snapshot.id,
        restoredFromVersion: snapshot.version,
        restoredDocumentCount: payload.documents.length,
        restoredChunkCount: payload.chunks.length,
        restoredFormat: snapshot.format,
      },
    });

    return {
      success: true,
      newVersionId: newVersion.id,
      message: `Restored from snapshot as version ${newVersion.version}`,
    };
  }

  // Direct restoration without new version
  return {
    success: true,
    message: `Snapshot payload loaded (${payload.documents.length} docs, ${payload.chunks.length} chunks) for collection ${targetCollectionId}`,
  };
}

// ============================================
// Snapshot Cleanup
// ============================================

/**
 * Delete a snapshot
 */
export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
  const supabase = createServerClient();

  // Get snapshot to check storage URL
  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot) {
    return false;
  }

  // Delete persisted snapshot payload from storage if present
  const storage = resolveStoragePointer(snapshot.storageUrl, snapshot.metadata);
  if (storage) {
    const { error: storageError } = await supabase.storage
      .from(storage.bucket)
      .remove([storage.path]);
    if (storageError && !isStorageNotFoundError(storageError)) {
      throw new Error(`Failed to delete snapshot storage object: ${storageError.message}`);
    }
  }

  // Delete record
  const { error } = await supabase
    .from('summer_version_snapshots')
    .delete()
    .eq('id', snapshotId);

  return !error;
}

/**
 * Clean up expired snapshots
 */
export async function cleanupExpiredSnapshots(): Promise<number> {
  const supabase = createServerClient();

  // Find expired snapshots
  const { data: expired, error: findError } = await supabase
    .from('summer_version_snapshots')
    .select('id, storage_url')
    .lt('expires_at', new Date().toISOString())
    .eq('status', 'completed');

  if (findError || !expired) {
    throw new Error(`Failed to find expired snapshots: ${findError?.message}`);
  }

  // Delete each snapshot
  let deletedCount = 0;
  for (const snap of expired) {
    const deleted = await deleteSnapshot(snap.id);
    if (deleted) {
      deletedCount++;
    }
  }

  return deletedCount;
}

// ============================================
// Snapshot Export/Import
// ============================================

/**
 * Export snapshot data as downloadable format
 */
export async function exportSnapshot(
  snapshotId: string
): Promise<{ data: string; filename: string; contentType: string } | null> {
  // Get snapshot
  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot || snapshot.status !== 'completed') {
    return null;
  }

  const { serialized } = await loadSerializedSnapshot(snapshotId);
  const extension = getSnapshotExtension(snapshot.format);
  const filename = `snapshot_${snapshot.collectionId}_v${snapshot.version}_${randomUUID().slice(0, 8)}.${extension}`;

  return {
    data: serialized,
    filename,
    contentType: getSnapshotContentType(snapshot.format),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function getSnapshotExtension(format: SnapshotFormat): string {
  switch (format) {
    case 'json':
      return 'json';
    case 'parquet':
      return 'parquet';
    case 'sqlite':
      return 'sqlite';
    default:
      return 'json';
  }
}

function getSnapshotContentType(format: SnapshotFormat): string {
  switch (format) {
    case 'json':
      return 'application/json';
    case 'parquet':
      return 'application/octet-stream';
    case 'sqlite':
      return 'application/x-sqlite3';
    default:
      return 'application/octet-stream';
  }
}

function toSnapshotMetadata(
  metadata: Record<string, unknown> | null | undefined
): SnapshotMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  return { ...metadata } as SnapshotMetadata;
}

function buildSnapshotMetadata(
  metadata: SnapshotMetadata,
  options: {
    generatedAt: string;
    format: SnapshotFormat;
    includeEmbeddings: boolean;
    documentCount: number;
    chunkCount: number;
    serialized?: string;
    storage?: SnapshotStoragePointer;
    storageError?: string;
  }
): SnapshotMetadata {
  const next: SnapshotMetadata = { ...metadata };
  next._snapshotGeneratedAt = options.generatedAt;
  next._snapshotInfo = {
    format: options.format,
    includeEmbeddings: options.includeEmbeddings,
    documentCount: options.documentCount,
    chunkCount: options.chunkCount,
  };

  if (options.storage) {
    next._snapshotStorage = options.storage;
    delete next._snapshotStorageError;
  } else if (options.storageError) {
    next._snapshotStorageError = options.storageError;
  }

  if (options.serialized) {
    const sizeBytes = Buffer.byteLength(options.serialized, 'utf8');
    if (sizeBytes <= MAX_INLINE_SNAPSHOT_BYTES) {
      next._snapshotInline = {
        encoding: 'base64',
        sizeBytes,
        data: Buffer.from(options.serialized, 'utf8').toString('base64'),
      };
    }
  }

  return next;
}

function isMissingStorageBucketError(error: { message?: string | null } | null | undefined): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return (
    message.includes('bucket') &&
    (message.includes('not found') || message.includes('does not exist'))
  );
}

function isStorageNotFoundError(error: { message?: string | null } | null | undefined): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return message.includes('not found') || message.includes('does not exist');
}

async function uploadSnapshotToStorage(
  snapshotId: string,
  collectionId: string,
  format: SnapshotFormat,
  serialized: string
): Promise<{ storageUrl: string; storage: SnapshotStoragePointer }> {
  const supabase = createServerClient();
  const extension = getSnapshotExtension(format);
  const path = `collections/${collectionId}/${snapshotId}.${extension}`;
  const contentType = getSnapshotContentType(format);

  let { error } = await supabase.storage.from(SNAPSHOT_BUCKET).upload(path, serialized, {
    contentType,
    upsert: true,
  });

  if (error && isMissingStorageBucketError(error)) {
    const { error: createBucketError } = await supabase.storage.createBucket(SNAPSHOT_BUCKET, {
      public: false,
    });
    if (createBucketError && !/already exists/i.test(createBucketError.message)) {
      throw new Error(`Failed to create snapshot bucket: ${createBucketError.message}`);
    }

    const retry = await supabase.storage.from(SNAPSHOT_BUCKET).upload(path, serialized, {
      contentType,
      upsert: true,
    });
    error = retry.error;
  }

  if (error) {
    throw new Error(`Failed to upload snapshot: ${error.message}`);
  }

  return {
    storageUrl: `supabase://${SNAPSHOT_BUCKET}/${path}`,
    storage: {
      bucket: SNAPSHOT_BUCKET,
      path,
      contentType,
    },
  };
}

function resolveStoragePointer(
  storageUrl: string | undefined,
  metadata: Record<string, unknown> | undefined
): SnapshotStoragePointer | null {
  const typedMetadata = toSnapshotMetadata(metadata);
  const fromMetadata = typedMetadata._snapshotStorage;
  if (
    fromMetadata &&
    typeof fromMetadata.bucket === 'string' &&
    typeof fromMetadata.path === 'string' &&
    typeof fromMetadata.contentType === 'string'
  ) {
    return fromMetadata;
  }

  if (!storageUrl || !storageUrl.startsWith('supabase://')) {
    return null;
  }

  const normalized = storageUrl.replace('supabase://', '');
  const slashIndex = normalized.indexOf('/');
  if (slashIndex <= 0 || slashIndex >= normalized.length - 1) {
    return null;
  }

  return {
    bucket: normalized.slice(0, slashIndex),
    path: normalized.slice(slashIndex + 1),
    contentType: 'application/octet-stream',
  };
}

function parseSnapshotPayload(serialized: string): SnapshotPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Snapshot payload is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Snapshot payload is malformed');
  }

  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.collectionId !== 'string' ||
    !Array.isArray(candidate.documents) ||
    !Array.isArray(candidate.chunks)
  ) {
    throw new Error('Snapshot payload is missing required fields');
  }

  return {
    version: typeof candidate.version === 'string' ? candidate.version : 'unknown',
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
    collectionId: candidate.collectionId,
    documents: candidate.documents as Record<string, unknown>[],
    chunks: candidate.chunks as Record<string, unknown>[],
    metadata: {
      documentCount:
        typeof (candidate.metadata as Record<string, unknown> | undefined)?.documentCount === 'number'
          ? ((candidate.metadata as Record<string, unknown>).documentCount as number)
          : (candidate.documents as unknown[]).length,
      chunkCount:
        typeof (candidate.metadata as Record<string, unknown> | undefined)?.chunkCount === 'number'
          ? ((candidate.metadata as Record<string, unknown>).chunkCount as number)
          : (candidate.chunks as unknown[]).length,
      includeEmbeddings:
        typeof (candidate.metadata as Record<string, unknown> | undefined)?.includeEmbeddings ===
        'boolean'
          ? ((candidate.metadata as Record<string, unknown>).includeEmbeddings as boolean)
          : false,
      format:
        typeof (candidate.metadata as Record<string, unknown> | undefined)?.format === 'string'
          ? ((candidate.metadata as Record<string, unknown>).format as SnapshotFormat)
          : 'json',
    },
  };
}

function decodeInlineSnapshot(metadata: Record<string, unknown> | undefined): string | null {
  const typedMetadata = toSnapshotMetadata(metadata);
  const inline = typedMetadata._snapshotInline;
  if (!inline || inline.encoding !== 'base64' || typeof inline.data !== 'string') {
    return null;
  }

  try {
    return Buffer.from(inline.data, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

async function loadSerializedSnapshot(
  snapshotId: string
): Promise<{ serialized: string; format: SnapshotFormat }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('summer_version_snapshots')
    .select('format, storage_url, metadata, collection_id, includes_embeddings, version_id')
    .eq('id', snapshotId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load snapshot row: ${error?.message}`);
  }

  const format = data.format as SnapshotFormat;
  const inline = decodeInlineSnapshot(data.metadata as Record<string, unknown> | undefined);
  if (inline) {
    return { serialized: inline, format };
  }

  const storage = resolveStoragePointer(
    (data.storage_url as string | null) ?? undefined,
    data.metadata as Record<string, unknown> | undefined
  );
  if (!storage) {
    const collectionId = typeof data.collection_id === 'string' ? data.collection_id : '';
    if (!collectionId) {
      throw new Error('Snapshot payload not found and collection id is missing');
    }

    const legacySerialized = await regenerateSnapshotPayloadFromCollection({
      collectionId,
      includeEmbeddings: (data.includes_embeddings as boolean) ?? false,
      format,
      versionId: typeof data.version_id === 'string' ? data.version_id : '',
    });
    return { serialized: legacySerialized, format };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(storage.bucket)
    .download(storage.path);
  if (downloadError || !fileData) {
    throw new Error(`Failed to download snapshot payload: ${downloadError?.message}`);
  }

  const serialized = await fileData.text();
  return { serialized, format };
}

async function regenerateSnapshotPayloadFromCollection(params: {
  collectionId: string;
  includeEmbeddings: boolean;
  format: SnapshotFormat;
  versionId: string;
}): Promise<string> {
  const supabase = createServerClient();
  const version = await getVersionById(params.versionId);

  const { data: documents, error: docError } = await supabase
    .from('summer_documents')
    .select('id, external_id, title, source, metadata, content_hash, current_version, created_at')
    .eq('collection_id', params.collectionId);
  if (docError) {
    throw new Error(`Failed to regenerate snapshot documents: ${docError.message}`);
  }

  const chunkSelect = params.includeEmbeddings
    ? 'document_id, chunk_index, content, token_count, chunk_hash, version, metadata, embedding'
    : 'document_id, chunk_index, content, token_count, chunk_hash, version, metadata';

  const { data: chunks, error: chunkError } = await supabase
    .from('summer_chunks')
    .select(chunkSelect)
    .eq('collection_id', params.collectionId);
  if (chunkError) {
    throw new Error(`Failed to regenerate snapshot chunks: ${chunkError.message}`);
  }

  const snapshotData: SnapshotPayload = {
    version: version?.version ?? 'unknown',
    exportedAt: new Date().toISOString(),
    collectionId: params.collectionId,
    documents: (documents ?? []) as unknown as Record<string, unknown>[],
    chunks: (chunks ?? []) as unknown as Record<string, unknown>[],
    metadata: {
      documentCount: (documents ?? []).length,
      chunkCount: (chunks ?? []).length,
      includeEmbeddings: params.includeEmbeddings,
      format: params.format,
    },
  };

  switch (params.format) {
    case 'json':
      return JSON.stringify(snapshotData, null, 2);
    case 'parquet':
    case 'sqlite':
      return JSON.stringify(snapshotData);
    default:
      return JSON.stringify(snapshotData);
  }
}
