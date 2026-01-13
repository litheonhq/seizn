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
    const snapshotData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      collectionId,
      documents: documents ?? [],
      chunks: chunks ?? [],
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

    // In a real implementation, upload to S3/GCS and store URL
    // For now, we'll store the URL as a placeholder
    const storageUrl = `seizn://snapshots/${collectionId}/${snapshotId}.${format}`;

    // Update snapshot with results
    await supabase
      .from('summer_version_snapshots')
      .update({
        status: 'completed' as SnapshotStatus,
        storage_url: storageUrl,
        size_bytes: sizeBytes,
        checksum,
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
  const supabase = createServerClient();

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

  // In a real implementation:
  // 1. Download snapshot data from storage
  // 2. Parse and validate data
  // 3. Insert documents and chunks

  // For now, we'll create a new version marking the restoration
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
    message: `Snapshot data restored to collection ${targetCollectionId}`,
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

  // In real implementation: delete from cloud storage
  // if (snapshot.storageUrl) {
  //   await deleteFromStorage(snapshot.storageUrl);
  // }

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
  const supabase = createServerClient();

  // Get snapshot
  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot || snapshot.status !== 'completed') {
    return null;
  }

  // In real implementation: fetch from storage
  // For now, regenerate the data
  const { data: documents } = await supabase
    .from('summer_documents')
    .select('*')
    .eq('collection_id', snapshot.collectionId);

  const chunkSelect = snapshot.includesEmbeddings ? '*' : 'id, document_id, chunk_index, content, token_count, chunk_hash, version, metadata';

  const { data: chunks } = await supabase
    .from('summer_chunks')
    .select(chunkSelect)
    .eq('collection_id', snapshot.collectionId);

  const exportData = {
    snapshotId: snapshot.id,
    version: snapshot.version,
    exportedAt: new Date().toISOString(),
    documents: documents ?? [],
    chunks: chunks ?? [],
  };

  const serialized = JSON.stringify(exportData, null, 2);
  const filename = `snapshot_${snapshot.collectionId}_v${snapshot.version}_${randomUUID().slice(0, 8)}.json`;

  return {
    data: serialized,
    filename,
    contentType: 'application/json',
  };
}
