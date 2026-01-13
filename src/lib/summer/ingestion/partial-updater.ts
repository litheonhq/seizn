/**
 * Partial Document Updater
 *
 * Enables incremental updates to documents without full re-ingestion.
 * Tracks changes at chunk level and updates only affected embeddings.
 */

import { createServerClient } from '@/lib/supabase';
import { createHash } from 'crypto';

export interface ChunkChange {
  type: 'added' | 'modified' | 'deleted' | 'unchanged';
  chunkId?: string;
  oldHash?: string;
  newHash?: string;
  content?: string;
  position: number;
  similarity?: number; // For modified chunks, how similar to original
}

export interface DocumentDiff {
  documentId: string;
  collectionId: string;
  totalChunks: number;
  changes: ChunkChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
  };
  estimatedCost: {
    embeddingTokens: number;
    vectorUpdates: number;
  };
}

export interface PartialUpdateOptions {
  similarityThreshold?: number; // Below this, consider chunk modified (0-1)
  preserveChunkIds?: boolean; // Keep original chunk IDs when possible
  dryRun?: boolean; // Only compute diff, don't apply
  forceReembed?: boolean; // Re-embed all chunks regardless of changes
  batchSize?: number; // Chunks per batch for embedding
}

export interface PartialUpdateResult {
  success: boolean;
  documentId: string;
  applied: DocumentDiff;
  errors: string[];
  timing: {
    diffMs: number;
    embedMs: number;
    updateMs: number;
    totalMs: number;
  };
}

const DEFAULT_OPTIONS: PartialUpdateOptions = {
  similarityThreshold: 0.95,
  preserveChunkIds: true,
  dryRun: false,
  forceReembed: false,
  batchSize: 50,
};

/**
 * Compute content hash for a chunk
 */
export function computeChunkHash(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex').slice(0, 16);
}

/**
 * Compute simple similarity between two strings using Jaccard index on words
 */
export function computeTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(Boolean));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = words1.size + words2.size - intersection;
  return intersection / union;
}

/**
 * Compute diff between old and new chunks
 */
export function computeChunkDiff(
  oldChunks: Array<{ id: string; content: string; hash?: string; position: number }>,
  newChunks: Array<{ content: string; position: number }>,
  options: PartialUpdateOptions = DEFAULT_OPTIONS
): ChunkChange[] {
  const changes: ChunkChange[] = [];
  const threshold = options.similarityThreshold ?? 0.95;

  // Build hash maps for quick lookup
  const oldByHash = new Map<string, (typeof oldChunks)[0]>();
  const oldByPosition = new Map<number, (typeof oldChunks)[0]>();

  for (const chunk of oldChunks) {
    const hash = chunk.hash ?? computeChunkHash(chunk.content);
    oldByHash.set(hash, chunk);
    oldByPosition.set(chunk.position, chunk);
  }

  const matchedOldIds = new Set<string>();

  // Process new chunks
  for (const newChunk of newChunks) {
    const newHash = computeChunkHash(newChunk.content);

    // Check for exact match by hash
    const exactMatch = oldByHash.get(newHash);
    if (exactMatch) {
      matchedOldIds.add(exactMatch.id);
      changes.push({
        type: 'unchanged',
        chunkId: exactMatch.id,
        oldHash: newHash,
        newHash,
        position: newChunk.position,
        similarity: 1,
      });
      continue;
    }

    // Check for similar chunk at same position
    const positionMatch = oldByPosition.get(newChunk.position);
    if (positionMatch && !matchedOldIds.has(positionMatch.id)) {
      const similarity = computeTextSimilarity(positionMatch.content, newChunk.content);

      if (similarity >= threshold) {
        // Considered unchanged
        matchedOldIds.add(positionMatch.id);
        changes.push({
          type: 'unchanged',
          chunkId: positionMatch.id,
          oldHash: positionMatch.hash ?? computeChunkHash(positionMatch.content),
          newHash,
          position: newChunk.position,
          similarity,
        });
      } else {
        // Modified
        matchedOldIds.add(positionMatch.id);
        changes.push({
          type: 'modified',
          chunkId: options.preserveChunkIds ? positionMatch.id : undefined,
          oldHash: positionMatch.hash ?? computeChunkHash(positionMatch.content),
          newHash,
          content: newChunk.content,
          position: newChunk.position,
          similarity,
        });
      }
      continue;
    }

    // Check for similar chunk at any position (content moved)
    let bestMatch: { chunk: (typeof oldChunks)[0]; similarity: number } | null = null;

    for (const oldChunk of oldChunks) {
      if (matchedOldIds.has(oldChunk.id)) continue;

      const similarity = computeTextSimilarity(oldChunk.content, newChunk.content);
      if (similarity > (bestMatch?.similarity ?? 0) && similarity >= 0.5) {
        bestMatch = { chunk: oldChunk, similarity };
      }
    }

    if (bestMatch && bestMatch.similarity >= threshold) {
      // Content moved but unchanged
      matchedOldIds.add(bestMatch.chunk.id);
      changes.push({
        type: 'unchanged',
        chunkId: bestMatch.chunk.id,
        oldHash: bestMatch.chunk.hash ?? computeChunkHash(bestMatch.chunk.content),
        newHash,
        position: newChunk.position,
        similarity: bestMatch.similarity,
      });
    } else if (bestMatch && bestMatch.similarity >= 0.3) {
      // Content modified
      matchedOldIds.add(bestMatch.chunk.id);
      changes.push({
        type: 'modified',
        chunkId: options.preserveChunkIds ? bestMatch.chunk.id : undefined,
        oldHash: bestMatch.chunk.hash ?? computeChunkHash(bestMatch.chunk.content),
        newHash,
        content: newChunk.content,
        position: newChunk.position,
        similarity: bestMatch.similarity,
      });
    } else {
      // New chunk
      changes.push({
        type: 'added',
        newHash,
        content: newChunk.content,
        position: newChunk.position,
      });
    }
  }

  // Mark unmatched old chunks as deleted
  for (const oldChunk of oldChunks) {
    if (!matchedOldIds.has(oldChunk.id)) {
      changes.push({
        type: 'deleted',
        chunkId: oldChunk.id,
        oldHash: oldChunk.hash ?? computeChunkHash(oldChunk.content),
        position: oldChunk.position,
      });
    }
  }

  // Sort by position
  return changes.sort((a, b) => a.position - b.position);
}

/**
 * Create a document diff for partial update
 */
export async function createDocumentDiff(
  collectionId: string,
  documentId: string,
  newChunks: Array<{ content: string; position: number }>,
  options: PartialUpdateOptions = DEFAULT_OPTIONS
): Promise<DocumentDiff> {
  const supabase = createServerClient();

  // Fetch existing chunks
  const { data: existingChunks, error } = await supabase
    .from('summer_chunks')
    .select('id, content, content_hash, position')
    .eq('document_id', documentId)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch existing chunks: ${error.message}`);
  }

  const oldChunks = (existingChunks ?? []).map((c) => ({
    id: c.id,
    content: c.content,
    hash: c.content_hash,
    position: c.position,
  }));

  const changes = computeChunkDiff(oldChunks, newChunks, options);

  // Compute summary
  const summary = {
    added: changes.filter((c) => c.type === 'added').length,
    modified: changes.filter((c) => c.type === 'modified').length,
    deleted: changes.filter((c) => c.type === 'deleted').length,
    unchanged: changes.filter((c) => c.type === 'unchanged').length,
  };

  // Estimate cost
  const chunksToEmbed = changes.filter((c) => c.type === 'added' || c.type === 'modified');
  const estimatedTokens = chunksToEmbed.reduce((sum, c) => {
    return sum + Math.ceil((c.content?.length ?? 0) / 4);
  }, 0);

  return {
    documentId,
    collectionId,
    totalChunks: newChunks.length,
    changes,
    summary,
    estimatedCost: {
      embeddingTokens: estimatedTokens,
      vectorUpdates: summary.added + summary.modified + summary.deleted,
    },
  };
}

/**
 * Apply partial update to document
 */
export async function applyPartialUpdate(
  diff: DocumentDiff,
  embedder: (texts: string[]) => Promise<number[][]>,
  options: PartialUpdateOptions = DEFAULT_OPTIONS
): Promise<PartialUpdateResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (options.dryRun) {
    return {
      success: true,
      documentId: diff.documentId,
      applied: diff,
      errors: [],
      timing: {
        diffMs: 0,
        embedMs: 0,
        updateMs: 0,
        totalMs: Date.now() - startTime,
      },
    };
  }

  const supabase = createServerClient();
  const diffEndTime = Date.now();

  // Collect chunks that need embedding
  const chunksToEmbed = diff.changes
    .filter((c) => c.type === 'added' || c.type === 'modified')
    .filter((c) => c.content);

  // Batch embed
  const embedStartTime = Date.now();
  const embeddings: Map<number, number[]> = new Map();

  if (chunksToEmbed.length > 0) {
    const batchSize = options.batchSize ?? 50;

    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      const batch = chunksToEmbed.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content!);

      try {
        const batchEmbeddings = await embedder(texts);

        for (let j = 0; j < batch.length; j++) {
          embeddings.set(batch[j].position, batchEmbeddings[j]);
        }
      } catch (error) {
        errors.push(`Embedding batch ${i / batchSize + 1} failed: ${error}`);
      }
    }
  }

  const embedEndTime = Date.now();
  const updateStartTime = Date.now();

  // Apply changes
  // 1. Delete removed chunks
  const deletedIds = diff.changes
    .filter((c) => c.type === 'deleted' && c.chunkId)
    .map((c) => c.chunkId!);

  if (deletedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('summer_chunks')
      .delete()
      .in('id', deletedIds);

    if (deleteError) {
      errors.push(`Failed to delete chunks: ${deleteError.message}`);
    }
  }

  // 2. Update modified chunks
  for (const change of diff.changes.filter((c) => c.type === 'modified')) {
    if (!change.chunkId || !change.content) continue;

    const embedding = embeddings.get(change.position);
    if (!embedding) {
      errors.push(`Missing embedding for modified chunk at position ${change.position}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('summer_chunks')
      .update({
        content: change.content,
        content_hash: change.newHash,
        embedding,
        position: change.position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', change.chunkId);

    if (updateError) {
      errors.push(`Failed to update chunk ${change.chunkId}: ${updateError.message}`);
    }
  }

  // 3. Insert new chunks
  const newChunks = diff.changes.filter((c) => c.type === 'added' && c.content);

  if (newChunks.length > 0) {
    const inserts = newChunks
      .map((change) => {
        const embedding = embeddings.get(change.position);
        if (!embedding) {
          errors.push(`Missing embedding for new chunk at position ${change.position}`);
          return null;
        }

        return {
          document_id: diff.documentId,
          collection_id: diff.collectionId,
          content: change.content,
          content_hash: change.newHash,
          embedding,
          position: change.position,
        };
      })
      .filter(Boolean);

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('summer_chunks')
        .insert(inserts);

      if (insertError) {
        errors.push(`Failed to insert new chunks: ${insertError.message}`);
      }
    }
  }

  // 4. Update document metadata
  const { error: docError } = await supabase
    .from('summer_documents')
    .update({
      chunk_count: diff.totalChunks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', diff.documentId);

  if (docError) {
    errors.push(`Failed to update document metadata: ${docError.message}`);
  }

  const updateEndTime = Date.now();

  return {
    success: errors.length === 0,
    documentId: diff.documentId,
    applied: diff,
    errors,
    timing: {
      diffMs: diffEndTime - startTime,
      embedMs: embedEndTime - embedStartTime,
      updateMs: updateEndTime - updateStartTime,
      totalMs: Date.now() - startTime,
    },
  };
}

/**
 * Check if document needs update based on content hash
 */
export async function checkDocumentNeedsUpdate(
  collectionId: string,
  documentId: string,
  newContentHash: string
): Promise<{ needsUpdate: boolean; currentHash?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('summer_documents')
    .select('content_hash')
    .eq('id', documentId)
    .eq('collection_id', collectionId)
    .single();

  if (error || !data) {
    return { needsUpdate: true };
  }

  return {
    needsUpdate: data.content_hash !== newContentHash,
    currentHash: data.content_hash,
  };
}

/**
 * Compute document content hash from chunks
 */
export function computeDocumentHash(chunks: Array<{ content: string }>): string {
  const combined = chunks.map((c) => c.content).join('\n---\n');
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Get update statistics for a collection
 */
export async function getCollectionUpdateStats(
  collectionId: string
): Promise<{
  totalDocuments: number;
  documentsWithChanges: number;
  totalChunks: number;
  chunksUpdatedLast24h: number;
  avgChunksPerDocument: number;
}> {
  const supabase = createServerClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get document stats
  const { data: docStats } = await supabase
    .from('summer_documents')
    .select('id, chunk_count, updated_at')
    .eq('collection_id', collectionId);

  const documents = docStats ?? [];
  const totalDocuments = documents.length;
  const documentsWithChanges = documents.filter(
    (d) => new Date(d.updated_at) > new Date(oneDayAgo)
  ).length;
  const totalChunks = documents.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0);
  const avgChunksPerDocument = totalDocuments > 0 ? totalChunks / totalDocuments : 0;

  // Get chunk update stats
  const { count: chunksUpdatedLast24h } = await supabase
    .from('summer_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId)
    .gte('updated_at', oneDayAgo);

  return {
    totalDocuments,
    documentsWithChanges,
    totalChunks,
    chunksUpdatedLast24h: chunksUpdatedLast24h ?? 0,
    avgChunksPerDocument: Math.round(avgChunksPerDocument * 10) / 10,
  };
}
