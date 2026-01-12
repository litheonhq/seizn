import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import { semanticChunk } from './chunking/semantic';
import { autoLabelMetadata } from './metadata/label';
import type { IngestDocument } from './types';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Versioned indexing (MVP scaffold).
 *
 * Goal:
 * - When a document changes, update ONLY changed chunks, preserve version history.
 *
 * This file intentionally contains TODOs for other AIs:
 * - Diff algorithm (chunk-level) using chunk_hash
 * - Partial updates: delete/update/insert
 * - Persist history to summer_document_versions / summer_chunk_versions
 */
export async function indexDocumentVersioned(params: {
  userId: string;
  collectionId: string;
  doc: IngestDocument;
  chunking?: { maxTokens?: number; overlapTokens?: number };
}): Promise<{ documentId: string; version: number; chunkCount: number }> {
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

  // TODO: fetch existing chunks and diff by chunk_index/content hash to update partially.
  // For now: naive approach = insert all chunks with new version.
  const embeddings = await embedder.embed(
    chunks.map((c) => c.text),
    'document'
  );

  const rows = chunks.map((c, i) => ({
    user_id: params.userId,
    collection_id: params.collectionId,
    document_id: documentId,
    version: nextVersion,
    chunk_index: c.index,
    content: c.text,
    token_count: c.tokenCount,
    chunk_hash: chunkHashes[i],
    embedding: embeddings[i],
    metadata: {
      ...(params.doc.metadata ?? {}),
      ...c.metadata,
    },
  }));

  const { error: insertErr } = await supabase.from('summer_chunks').insert(rows);
  if (insertErr) throw insertErr;

  // 4) Update document version
  await supabase.from('summer_documents').update({ current_version: nextVersion }).eq('id', documentId);

  // 5) Persist history (optional)
  await supabase.from('summer_document_versions').insert({
    document_id: documentId,
    version: nextVersion,
    content_hash: contentHash,
    metadata: baseDoc.metadata ?? {},
  });

  // NOTE: chunk history can be large; only enable when needed.
  // await supabase.from('summer_chunk_versions').insert(...)

  return { documentId, version: nextVersion, chunkCount: chunks.length };
}
