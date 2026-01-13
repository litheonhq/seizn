import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import { semanticChunk } from './chunking/semantic';
import { autoLabelMetadata } from './metadata/label';
import type { IngestDocument, SemanticChunk } from './types';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

interface ExistingChunk {
  id: string;
  chunk_index: number;
  chunk_hash: string;
  content: string;
  embedding: number[];
}

interface ChunkDiffResult {
  toInsert: { chunk: SemanticChunk; hash: string }[];
  toUpdate: { existingId: string; chunk: SemanticChunk; hash: string }[];
  toDelete: string[];
  unchanged: { existingId: string; chunk: SemanticChunk; hash: string; embedding: number[] }[];
}

/**
 * Computes a diff between existing chunks and new chunks.
 * Uses chunk_hash for content comparison.
 *
 * Algorithm:
 * 1. First, try to match by chunk_hash (content identical = reuse embedding)
 * 2. Then, match remaining by chunk_index (position-based update)
 * 3. Unmatched new chunks -> insert
 * 4. Unmatched existing chunks -> delete
 */
function diffChunks(
  existingChunks: ExistingChunk[],
  newChunks: SemanticChunk[],
  newChunkHashes: string[]
): ChunkDiffResult {
  const existingByHash = new Map<string, ExistingChunk>();
  const existingByIndex = new Map<number, ExistingChunk>();

  for (const chunk of existingChunks) {
    if (chunk.chunk_hash) {
      existingByHash.set(chunk.chunk_hash, chunk);
    }
    existingByIndex.set(chunk.chunk_index, chunk);
  }

  const toInsert: ChunkDiffResult['toInsert'] = [];
  const toUpdate: ChunkDiffResult['toUpdate'] = [];
  const unchanged: ChunkDiffResult['unchanged'] = [];
  const matchedExistingIds = new Set<string>();

  for (let i = 0; i < newChunks.length; i++) {
    const chunk = newChunks[i];
    const hash = newChunkHashes[i];

    // First, check if there is an existing chunk with the same hash (content unchanged)
    const existingByContent = existingByHash.get(hash);
    if (existingByContent && !matchedExistingIds.has(existingByContent.id)) {
      matchedExistingIds.add(existingByContent.id);
      unchanged.push({
        existingId: existingByContent.id,
        chunk,
        hash,
        embedding: existingByContent.embedding,
      });
      continue;
    }

    // Check if there is an existing chunk at the same index
    const existingAtIndex = existingByIndex.get(chunk.index);
    if (existingAtIndex && !matchedExistingIds.has(existingAtIndex.id)) {
      // Same index but different content -> update
      matchedExistingIds.add(existingAtIndex.id);
      toUpdate.push({
        existingId: existingAtIndex.id,
        chunk,
        hash,
      });
      continue;
    }

    // No match -> insert new chunk
    toInsert.push({ chunk, hash });
  }

  // Find chunks to delete (existing chunks not matched)
  const toDelete: string[] = [];
  for (const existing of existingChunks) {
    if (!matchedExistingIds.has(existing.id)) {
      toDelete.push(existing.id);
    }
  }

  return { toInsert, toUpdate, toDelete, unchanged };
}

/**
 * Versioned indexing with partial update optimization.
 *
 * Goal:
 * - When a document changes, update ONLY changed chunks, preserve version history.
 * - Minimize embedding API calls by reusing embeddings for unchanged chunks.
 *
 * Performance:
 * - 1000 chunks with 10 changes -> only 10 embedding API calls (not 1000)
 */
export async function indexDocumentVersioned(params: {
  userId: string;
  collectionId: string;
  doc: IngestDocument;
  chunking?: { maxTokens?: number; overlapTokens?: number };
}): Promise<{
  documentId: string;
  version: number;
  chunkCount: number;
  stats?: {
    inserted: number;
    updated: number;
    deleted: number;
    unchanged: number;
    embeddingsComputed: number;
  };
}> {
  const supabase = createServerClient();
  const embedder = getEmbeddingProvider();

  const content = (params.doc.content ?? '').trim();
  if (!content) {
    throw new Error('Empty document content');
  }

  const contentHash = sha256(content);

  // 1) Upsert document
  const baseDoc = {
    user_id: params.userId,
    collection_id: params.collectionId,
    external_id: params.doc.external_id ?? null,
    title: params.doc.title ?? null,
    source: params.doc.source ?? null,
    metadata: {
      ...(params.doc.metadata ?? {}),
      ...autoLabelMetadata(content.slice(0, 20000)),
    },
    content_hash: contentHash,
  };

  const { data: docRow, error: docErr } = params.doc.external_id
    ? await supabase
        .from('summer_documents')
        .upsert(baseDoc, { onConflict: 'collection_id,external_id' })
        .select('id, current_version, content_hash')
        .single()
    : await supabase
        .from('summer_documents')
        .insert(baseDoc)
        .select('id, current_version, content_hash')
        .single();

  if (docErr) throw docErr;

  const documentId = String(docRow.id);
  const currentVersion = Number(docRow.current_version ?? 1);
  const previousHash = String(docRow.content_hash ?? '');

  // 2) If unchanged, short-circuit
  if (previousHash === contentHash) {
    return { documentId, version: currentVersion, chunkCount: 0 };
  }

  const nextVersion = currentVersion + 1;

  // 3) Chunk + hash per chunk
  const chunks = semanticChunk(content, params.chunking);
  const chunkHashes = chunks.map((c) => sha256(c.text));

  // 4) Fetch existing chunks for this document (current version)
  const { data: existingChunksRaw, error: fetchErr } = await supabase
    .from('summer_chunks')
    .select('id, chunk_index, chunk_hash, content, embedding')
    .eq('document_id', documentId)
    .eq('version', currentVersion)
    .order('chunk_index', { ascending: true });

  if (fetchErr) throw fetchErr;

  const existingChunks: ExistingChunk[] = (existingChunksRaw ?? []).map((c) => ({
    id: String(c.id),
    chunk_index: Number(c.chunk_index),
    chunk_hash: String(c.chunk_hash ?? ''),
    content: String(c.content ?? ''),
    embedding: c.embedding as number[],
  }));

  // 5) Compute diff
  const diff = diffChunks(existingChunks, chunks, chunkHashes);

  // 6) Compute embeddings ONLY for chunks that need them (insert + update)
  const chunksNeedingEmbeddings = [
    ...diff.toInsert.map((item) => item.chunk.text),
    ...diff.toUpdate.map((item) => item.chunk.text),
  ];

  let newEmbeddings: number[][] = [];
  if (chunksNeedingEmbeddings.length > 0) {
    newEmbeddings = await embedder.embed(chunksNeedingEmbeddings, 'document');
  }

  // Split embeddings between inserts and updates
  const insertEmbeddings = newEmbeddings.slice(0, diff.toInsert.length);
  const updateEmbeddings = newEmbeddings.slice(diff.toInsert.length);

  // 7) Batch operations

  // 7a) Insert new chunks
  if (diff.toInsert.length > 0) {
    const insertRows = diff.toInsert.map((item, i) => ({
      user_id: params.userId,
      collection_id: params.collectionId,
      document_id: documentId,
      version: nextVersion,
      chunk_index: item.chunk.index,
      content: item.chunk.text,
      token_count: item.chunk.tokenCount,
      chunk_hash: item.hash,
      embedding: insertEmbeddings[i],
      metadata: {
        ...(params.doc.metadata ?? {}),
        ...item.chunk.metadata,
      },
    }));

    const { error: insertErr } = await supabase.from('summer_chunks').insert(insertRows);
    if (insertErr) throw insertErr;
  }

  // 7b) Update existing chunks (content changed, same index)
  for (let i = 0; i < diff.toUpdate.length; i++) {
    const item = diff.toUpdate[i];
    const { error: updateErr } = await supabase
      .from('summer_chunks')
      .update({
        version: nextVersion,
        content: item.chunk.text,
        token_count: item.chunk.tokenCount,
        chunk_hash: item.hash,
        embedding: updateEmbeddings[i],
        metadata: {
          ...(params.doc.metadata ?? {}),
          ...item.chunk.metadata,
        },
      })
      .eq('id', item.existingId);

    if (updateErr) throw updateErr;
  }

  // 7c) Update unchanged chunks (bump version, keep embedding)
  for (const item of diff.unchanged) {
    const { error: updateErr } = await supabase
      .from('summer_chunks')
      .update({
        version: nextVersion,
        chunk_index: item.chunk.index, // Update index in case it shifted
        metadata: {
          ...(params.doc.metadata ?? {}),
          ...item.chunk.metadata,
        },
      })
      .eq('id', item.existingId);

    if (updateErr) throw updateErr;
  }

  // 7d) Delete obsolete chunks
  if (diff.toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from('summer_chunks')
      .delete()
      .in('id', diff.toDelete);

    if (deleteErr) throw deleteErr;
  }

  // 8) Update document version
  await supabase
    .from('summer_documents')
    .update({ current_version: nextVersion })
    .eq('id', documentId);

  // 9) Persist version history
  await supabase.from('summer_document_versions').insert({
    document_id: documentId,
    version: nextVersion,
    content_hash: contentHash,
    metadata: {
      ...(baseDoc.metadata ?? {}),
      diff_stats: {
        inserted: diff.toInsert.length,
        updated: diff.toUpdate.length,
        deleted: diff.toDelete.length,
        unchanged: diff.unchanged.length,
      },
    },
  });

  const totalChunks = diff.toInsert.length + diff.toUpdate.length + diff.unchanged.length;

  return {
    documentId,
    version: nextVersion,
    chunkCount: totalChunks,
    stats: {
      inserted: diff.toInsert.length,
      updated: diff.toUpdate.length,
      deleted: diff.toDelete.length,
      unchanged: diff.unchanged.length,
      embeddingsComputed: chunksNeedingEmbeddings.length,
    },
  };
}
