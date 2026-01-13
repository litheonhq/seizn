/**
 * Version Manager
 *
 * Handles version lifecycle: creation, retrieval, comparison, and rollback.
 */

import { createServerClient } from '@/lib/supabase';
import {
  IndexVersion,
  IndexVersionRow,
  CreateVersionInput,
  RestoreVersionInput,
  SemanticVersion,
  VersionType,
  formatSemanticVersion,
  rowToIndexVersion,
} from './types';

// ============================================
// Version Creation
// ============================================

/**
 * Calculate the next version based on version type
 */
function incrementVersion(current: SemanticVersion, type: VersionType): SemanticVersion {
  switch (type) {
    case 'major':
      return { major: current.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: current.major, minor: current.minor + 1, patch: 0 };
    case 'patch':
    default:
      return { major: current.major, minor: current.minor, patch: current.patch + 1 };
  }
}

/**
 * Get the current active version for a collection
 */
export async function getCurrentVersion(collectionId: string): Promise<IndexVersion | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('summer_index_versions')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToIndexVersion(data as IndexVersionRow);
}

/**
 * Get collection statistics for version creation
 */
async function getCollectionStats(collectionId: string): Promise<{
  documentCount: number;
  chunkCount: number;
  embeddingDimensions: number;
  embeddingProvider: string;
  embeddingModel: string;
}> {
  const supabase = createServerClient();

  // Get collection info
  const { data: collection, error: collectionError } = await supabase
    .from('summer_collections')
    .select('embedding_provider, embedding_model, embedding_dimensions')
    .eq('id', collectionId)
    .single();

  if (collectionError || !collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Count documents
  const { count: documentCount, error: docError } = await supabase
    .from('summer_documents')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  if (docError) {
    throw new Error(`Failed to count documents: ${docError.message}`);
  }

  // Count chunks
  const { count: chunkCount, error: chunkError } = await supabase
    .from('summer_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  if (chunkError) {
    throw new Error(`Failed to count chunks: ${chunkError.message}`);
  }

  return {
    documentCount: documentCount ?? 0,
    chunkCount: chunkCount ?? 0,
    embeddingDimensions: collection.embedding_dimensions ?? 1024,
    embeddingProvider: collection.embedding_provider ?? 'voyage',
    embeddingModel: collection.embedding_model ?? 'voyage-3',
  };
}

/**
 * Create a new version for a collection
 */
export async function createVersion(input: CreateVersionInput): Promise<IndexVersion> {
  const supabase = createServerClient();

  // Get current version
  const currentVersion = await getCurrentVersion(input.collectionId);

  // Calculate new version
  const newSemanticVersion = currentVersion
    ? incrementVersion(currentVersion.semanticVersion, input.versionType ?? 'patch')
    : { major: 1, minor: 0, patch: 0 };

  const versionString = formatSemanticVersion(newSemanticVersion);

  // Get collection stats
  const stats = await getCollectionStats(input.collectionId);

  // Deactivate current version
  if (currentVersion) {
    await supabase
      .from('summer_index_versions')
      .update({ is_active: false })
      .eq('id', currentVersion.id);
  }

  // Create new version
  const { data, error } = await supabase
    .from('summer_index_versions')
    .insert({
      collection_id: input.collectionId,
      version: versionString,
      version_major: newSemanticVersion.major,
      version_minor: newSemanticVersion.minor,
      version_patch: newSemanticVersion.patch,
      created_by: input.userId,
      change_summary: input.changeSummary,
      document_count: stats.documentCount,
      chunk_count: stats.chunkCount,
      embedding_dimensions: stats.embeddingDimensions,
      embedding_provider: stats.embeddingProvider,
      embedding_model: stats.embeddingModel,
      previous_version_id: currentVersion?.id ?? null,
      is_active: true,
      tags: input.tags ?? null,
      metadata: input.metadata ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create version: ${error?.message}`);
  }

  return rowToIndexVersion(data as IndexVersionRow);
}

// ============================================
// Version Retrieval
// ============================================

/**
 * Get a version by ID
 */
export async function getVersionById(versionId: string): Promise<IndexVersion | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('summer_index_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToIndexVersion(data as IndexVersionRow);
}

/**
 * List all versions for a collection
 */
export async function listVersions(
  collectionId: string,
  options?: {
    limit?: number;
    offset?: number;
    includeInactive?: boolean;
  }
): Promise<{ versions: IndexVersion[]; total: number }> {
  const supabase = createServerClient();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('summer_index_versions')
    .select('*', { count: 'exact' })
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!options?.includeInactive) {
    // By default, include all versions but sort active first
    query = query.order('is_active', { ascending: false });
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list versions: ${error.message}`);
  }

  return {
    versions: (data ?? []).map((row) => rowToIndexVersion(row as IndexVersionRow)),
    total: count ?? 0,
  };
}

/**
 * Get version history (chain from current to first)
 */
export async function getVersionHistory(
  collectionId: string,
  maxDepth: number = 10
): Promise<IndexVersion[]> {
  const supabase = createServerClient();
  const history: IndexVersion[] = [];

  // Start with current version
  let currentVersion = await getCurrentVersion(collectionId);

  while (currentVersion && history.length < maxDepth) {
    history.push(currentVersion);

    if (!currentVersion.previousVersionId) {
      break;
    }

    const { data, error } = await supabase
      .from('summer_index_versions')
      .select('*')
      .eq('id', currentVersion.previousVersionId)
      .single();

    if (error || !data) {
      break;
    }

    currentVersion = rowToIndexVersion(data as IndexVersionRow);
  }

  return history;
}

// ============================================
// Version Rollback
// ============================================

/**
 * Restore a previous version (rollback)
 *
 * This creates a NEW version that copies the state from the target version.
 * It does NOT delete any versions.
 */
export async function restoreVersion(input: RestoreVersionInput): Promise<IndexVersion> {
  const supabase = createServerClient();

  // Get the version to restore
  const targetVersion = await getVersionById(input.versionId);
  if (!targetVersion) {
    throw new Error(`Version not found: ${input.versionId}`);
  }

  // Get current version
  const currentVersion = await getCurrentVersion(targetVersion.collectionId);
  if (!currentVersion) {
    throw new Error('No current version found');
  }

  // Don't restore if already active
  if (targetVersion.isActive) {
    throw new Error('Target version is already active');
  }

  // Calculate new version (always increment patch for rollbacks)
  const newSemanticVersion = incrementVersion(currentVersion.semanticVersion, 'patch');
  const versionString = formatSemanticVersion(newSemanticVersion);

  // Create restoration summary
  const changeSummary = input.reason
    ? `Restored from v${targetVersion.version}: ${input.reason}`
    : `Restored from v${targetVersion.version}`;

  // Deactivate current version
  await supabase
    .from('summer_index_versions')
    .update({ is_active: false })
    .eq('id', currentVersion.id);

  // Create new version based on restored version's stats
  const { data, error } = await supabase
    .from('summer_index_versions')
    .insert({
      collection_id: targetVersion.collectionId,
      version: versionString,
      version_major: newSemanticVersion.major,
      version_minor: newSemanticVersion.minor,
      version_patch: newSemanticVersion.patch,
      created_by: input.userId,
      change_summary: changeSummary,
      document_count: targetVersion.documentCount,
      chunk_count: targetVersion.chunkCount,
      embedding_dimensions: targetVersion.embeddingDimensions,
      embedding_provider: targetVersion.embeddingProvider,
      embedding_model: targetVersion.embeddingModel,
      previous_version_id: currentVersion.id,
      is_active: true,
      tags: ['rollback', `restored-from-${targetVersion.version}`],
      metadata: {
        restored_from_version_id: targetVersion.id,
        restored_from_version: targetVersion.version,
        restoration_reason: input.reason ?? null,
      },
    })
    .select('*')
    .single();

  if (error || !data) {
    // Reactivate current version on failure
    await supabase
      .from('summer_index_versions')
      .update({ is_active: true })
      .eq('id', currentVersion.id);
    throw new Error(`Failed to restore version: ${error?.message}`);
  }

  return rowToIndexVersion(data as IndexVersionRow);
}

// ============================================
// Version Comparison
// ============================================

/**
 * Check if collection has access for user
 */
export async function verifyCollectionAccess(
  collectionId: string,
  userId: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('summer_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  return !error && !!data;
}

/**
 * Get two versions for comparison
 */
export async function getVersionPair(
  sourceId: string,
  targetId: string
): Promise<{ source: IndexVersion; target: IndexVersion } | null> {
  const [source, target] = await Promise.all([
    getVersionById(sourceId),
    getVersionById(targetId),
  ]);

  if (!source || !target) {
    return null;
  }

  // Ensure they belong to the same collection
  if (source.collectionId !== target.collectionId) {
    throw new Error('Versions belong to different collections');
  }

  return { source, target };
}

// ============================================
// Version Cleanup
// ============================================

/**
 * Delete old versions (keep N most recent)
 */
export async function pruneVersions(
  collectionId: string,
  keepCount: number = 10
): Promise<number> {
  const supabase = createServerClient();

  // Get all versions ordered by creation time
  const { data: versions, error: listError } = await supabase
    .from('summer_index_versions')
    .select('id')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });

  if (listError || !versions) {
    throw new Error(`Failed to list versions: ${listError?.message}`);
  }

  // Keep the N most recent
  const toDelete = versions.slice(keepCount);

  if (toDelete.length === 0) {
    return 0;
  }

  const idsToDelete = toDelete.map((v) => v.id);

  // Delete old versions
  const { error: deleteError } = await supabase
    .from('summer_index_versions')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    throw new Error(`Failed to delete versions: ${deleteError.message}`);
  }

  return idsToDelete.length;
}
