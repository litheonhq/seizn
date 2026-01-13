/**
 * Diff Engine
 *
 * Analyzes differences between index versions at document and chunk levels.
 */

import { createServerClient } from '@/lib/supabase';
import {
  VersionDiff,
  DocumentDiff,
  ChunkDiff,
  DiffChangeType,
  IndexVersion,
} from './types';
import { getVersionById } from './version-manager';

// ============================================
// Internal Types
// ============================================

interface DocumentSnapshot {
  id: string;
  title: string | null;
  contentHash: string;
  version: number;
}

interface ChunkSnapshot {
  documentId: string;
  chunkIndex: number;
  chunkHash: string;
  content: string;
  version: number;
}

// ============================================
// Document-Level Diff
// ============================================

/**
 * Get document snapshots for a specific version's timeframe
 */
async function getDocumentSnapshots(
  collectionId: string,
  version: IndexVersion
): Promise<Map<string, DocumentSnapshot>> {
  const supabase = createServerClient();

  // Get documents that were created/updated before or at this version's time
  const { data, error } = await supabase
    .from('summer_documents')
    .select('id, title, content_hash, current_version')
    .eq('collection_id', collectionId)
    .lte('created_at', version.createdAt.toISOString());

  if (error) {
    throw new Error(`Failed to get document snapshots: ${error.message}`);
  }

  const snapshots = new Map<string, DocumentSnapshot>();
  for (const doc of data ?? []) {
    snapshots.set(doc.id, {
      id: doc.id,
      title: doc.title,
      contentHash: doc.content_hash ?? '',
      version: doc.current_version ?? 1,
    });
  }

  return snapshots;
}

/**
 * Compare document sets between two versions
 */
function compareDocuments(
  sourceSnaps: Map<string, DocumentSnapshot>,
  targetSnaps: Map<string, DocumentSnapshot>
): DocumentDiff[] {
  const diffs: DocumentDiff[] = [];
  const processedIds = new Set<string>();

  // Check source documents
  for (const [id, sourceDoc] of sourceSnaps) {
    processedIds.add(id);
    const targetDoc = targetSnaps.get(id);

    if (!targetDoc) {
      // Document was removed
      diffs.push({
        documentId: id,
        title: sourceDoc.title ?? undefined,
        changeType: 'removed',
        previousHash: sourceDoc.contentHash,
        chunksChanged: 0, // Will be calculated later
      });
    } else if (sourceDoc.contentHash !== targetDoc.contentHash) {
      // Document was modified
      diffs.push({
        documentId: id,
        title: targetDoc.title ?? undefined,
        changeType: 'modified',
        previousHash: sourceDoc.contentHash,
        currentHash: targetDoc.contentHash,
        chunksChanged: 0, // Will be calculated later
      });
    } else {
      // Document unchanged
      diffs.push({
        documentId: id,
        title: sourceDoc.title ?? undefined,
        changeType: 'unchanged',
        previousHash: sourceDoc.contentHash,
        currentHash: targetDoc.contentHash,
        chunksChanged: 0,
      });
    }
  }

  // Check for new documents in target
  for (const [id, targetDoc] of targetSnaps) {
    if (!processedIds.has(id)) {
      diffs.push({
        documentId: id,
        title: targetDoc.title ?? undefined,
        changeType: 'added',
        currentHash: targetDoc.contentHash,
        chunksChanged: 0, // Will be calculated later
      });
    }
  }

  return diffs;
}

// ============================================
// Chunk-Level Diff
// ============================================

/**
 * Get chunk snapshots for a document
 */
async function getChunkSnapshots(
  documentId: string,
  maxVersion: number
): Promise<ChunkSnapshot[]> {
  const supabase = createServerClient();

  // Get the most recent chunks up to the specified version
  const { data, error } = await supabase
    .from('summer_chunks')
    .select('document_id, chunk_index, chunk_hash, content, version')
    .eq('document_id', documentId)
    .lte('version', maxVersion)
    .order('chunk_index', { ascending: true });

  if (error) {
    throw new Error(`Failed to get chunk snapshots: ${error.message}`);
  }

  // Keep only the latest version of each chunk
  const chunkMap = new Map<number, ChunkSnapshot>();
  for (const chunk of data ?? []) {
    const existing = chunkMap.get(chunk.chunk_index);
    if (!existing || chunk.version > existing.version) {
      chunkMap.set(chunk.chunk_index, {
        documentId: chunk.document_id,
        chunkIndex: chunk.chunk_index,
        chunkHash: chunk.chunk_hash ?? '',
        content: chunk.content ?? '',
        version: chunk.version,
      });
    }
  }

  return Array.from(chunkMap.values()).sort((a, b) => a.chunkIndex - b.chunkIndex);
}

/**
 * Compare chunks between two version states
 */
function compareChunks(
  sourceChunks: ChunkSnapshot[],
  targetChunks: ChunkSnapshot[]
): ChunkDiff[] {
  const diffs: ChunkDiff[] = [];
  const sourceMap = new Map(sourceChunks.map((c) => [c.chunkIndex, c]));
  const targetMap = new Map(targetChunks.map((c) => [c.chunkIndex, c]));
  const allIndices = new Set([...sourceMap.keys(), ...targetMap.keys()]);

  for (const index of Array.from(allIndices).sort((a, b) => a - b)) {
    const source = sourceMap.get(index);
    const target = targetMap.get(index);

    if (!source && target) {
      // Chunk added
      diffs.push({
        chunkIndex: index,
        changeType: 'added',
        currentContent: target.content,
        currentHash: target.chunkHash,
      });
    } else if (source && !target) {
      // Chunk removed
      diffs.push({
        chunkIndex: index,
        changeType: 'removed',
        previousContent: source.content,
        previousHash: source.chunkHash,
      });
    } else if (source && target) {
      if (source.chunkHash !== target.chunkHash) {
        // Chunk modified
        diffs.push({
          chunkIndex: index,
          changeType: 'modified',
          previousContent: source.content,
          currentContent: target.content,
          previousHash: source.chunkHash,
          currentHash: target.chunkHash,
        });
      }
      // If hashes match, chunk is unchanged - don't include in diff
    }
  }

  return diffs;
}

// ============================================
// Full Diff Generation
// ============================================

/**
 * Generate a complete diff between two versions
 */
export async function generateVersionDiff(
  sourceVersionId: string,
  targetVersionId: string,
  options?: {
    includeChunkDiffs?: boolean;
    maxChunkDiffsPerDocument?: number;
  }
): Promise<VersionDiff> {
  // Get both versions
  const [sourceVersion, targetVersion] = await Promise.all([
    getVersionById(sourceVersionId),
    getVersionById(targetVersionId),
  ]);

  if (!sourceVersion) {
    throw new Error(`Source version not found: ${sourceVersionId}`);
  }

  if (!targetVersion) {
    throw new Error(`Target version not found: ${targetVersionId}`);
  }

  if (sourceVersion.collectionId !== targetVersion.collectionId) {
    throw new Error('Versions belong to different collections');
  }

  const collectionId = sourceVersion.collectionId;

  // Get document snapshots for both versions
  const [sourceDocSnaps, targetDocSnaps] = await Promise.all([
    getDocumentSnapshots(collectionId, sourceVersion),
    getDocumentSnapshots(collectionId, targetVersion),
  ]);

  // Compare documents
  const documentDiffs = compareDocuments(sourceDocSnaps, targetDocSnaps);

  // Calculate chunk diffs for modified/added/removed documents
  const includeChunks = options?.includeChunkDiffs ?? false;
  const maxChunks = options?.maxChunkDiffsPerDocument ?? 100;

  let totalChunksAdded = 0;
  let totalChunksRemoved = 0;
  let totalChunksModified = 0;

  for (const docDiff of documentDiffs) {
    if (docDiff.changeType === 'unchanged') {
      continue;
    }

    // Get chunk snapshots for both versions
    const sourceDoc = sourceDocSnaps.get(docDiff.documentId);
    const targetDoc = targetDocSnaps.get(docDiff.documentId);

    const sourceChunks = sourceDoc
      ? await getChunkSnapshots(docDiff.documentId, sourceDoc.version)
      : [];
    const targetChunks = targetDoc
      ? await getChunkSnapshots(docDiff.documentId, targetDoc.version)
      : [];

    // Compare chunks
    const chunkDiffs = compareChunks(sourceChunks, targetChunks);

    // Count changes
    for (const cd of chunkDiffs) {
      switch (cd.changeType) {
        case 'added':
          totalChunksAdded++;
          break;
        case 'removed':
          totalChunksRemoved++;
          break;
        case 'modified':
          totalChunksModified++;
          break;
      }
    }

    docDiff.chunksChanged = chunkDiffs.length;

    // Include chunk-level diffs if requested
    if (includeChunks && chunkDiffs.length > 0) {
      docDiff.chunkDiffs = chunkDiffs.slice(0, maxChunks);
    }
  }

  // Calculate summary
  const summary = {
    documentsAdded: documentDiffs.filter((d) => d.changeType === 'added').length,
    documentsRemoved: documentDiffs.filter((d) => d.changeType === 'removed').length,
    documentsModified: documentDiffs.filter((d) => d.changeType === 'modified').length,
    documentsUnchanged: documentDiffs.filter((d) => d.changeType === 'unchanged').length,
    totalChunksAdded,
    totalChunksRemoved,
    totalChunksModified,
  };

  return {
    sourceVersionId,
    sourceVersion: sourceVersion.version,
    targetVersionId,
    targetVersion: targetVersion.version,
    collectionId,
    generatedAt: new Date(),
    summary,
    documents: documentDiffs.filter((d) => d.changeType !== 'unchanged'),
  };
}

// ============================================
// Diff Summary
// ============================================

/**
 * Get a quick summary of changes between versions without full diff
 */
export async function getQuickDiffSummary(
  sourceVersionId: string,
  targetVersionId: string
): Promise<{
  sourceVersion: string;
  targetVersion: string;
  documentCountDelta: number;
  chunkCountDelta: number;
  hasChanges: boolean;
}> {
  const [source, target] = await Promise.all([
    getVersionById(sourceVersionId),
    getVersionById(targetVersionId),
  ]);

  if (!source || !target) {
    throw new Error('Version not found');
  }

  const documentCountDelta = target.documentCount - source.documentCount;
  const chunkCountDelta = target.chunkCount - source.chunkCount;

  return {
    sourceVersion: source.version,
    targetVersion: target.version,
    documentCountDelta,
    chunkCountDelta,
    hasChanges: documentCountDelta !== 0 || chunkCountDelta !== 0,
  };
}

// ============================================
// Change Detection
// ============================================

/**
 * Detect what type of version increment is appropriate based on changes
 */
export function detectVersionType(diff: VersionDiff): 'major' | 'minor' | 'patch' {
  const { summary } = diff;

  // Major: significant structural changes (>20% documents changed)
  const totalDocuments =
    summary.documentsAdded +
    summary.documentsRemoved +
    summary.documentsModified +
    summary.documentsUnchanged;

  const changedDocuments =
    summary.documentsAdded + summary.documentsRemoved + summary.documentsModified;

  if (totalDocuments > 0 && changedDocuments / totalDocuments > 0.2) {
    return 'major';
  }

  // Minor: some documents added/removed
  if (summary.documentsAdded > 0 || summary.documentsRemoved > 0) {
    return 'minor';
  }

  // Patch: only modifications
  return 'patch';
}
