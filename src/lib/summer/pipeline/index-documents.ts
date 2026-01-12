import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getEmbeddingProvider } from '../embedding';
import { chunkText, type ChunkingOptions } from '../utils/chunk';

export interface IndexDocumentInput {
  external_id?: string;
  title?: string;
  source?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IndexDocumentsParams {
  userId: string;
  collectionId: string;
  documents: IndexDocumentInput[];
  chunking?: ChunkingOptions;
}

export interface IndexDocumentsResult {
  documentCount: number;
  chunkCount: number;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function indexDocuments(params: IndexDocumentsParams): Promise<IndexDocumentsResult> {
  const supabase = createServerClient();
  const embedder = getEmbeddingProvider();

  let totalChunks = 0;

  for (const doc of params.documents) {
    const content = (doc.content ?? '').trim();
    if (!content) continue;

    const contentHash = sha256(content);

    const baseDocRow = {
      user_id: params.userId,
      collection_id: params.collectionId,
      external_id: doc.external_id ?? null,
      title: doc.title ?? null,
      source: doc.source ?? null,
      metadata: doc.metadata ?? {},
      content_hash: contentHash,
    };

    let documentId: string;

    if (doc.external_id) {
      // Check if document with this external_id already exists
      const { data: existing } = await supabase
        .from('summer_documents')
        .select('id')
        .eq('collection_id', params.collectionId)
        .eq('external_id', doc.external_id)
        .single();

      if (existing) {
        // Update existing document
        const { error: updateErr } = await supabase
          .from('summer_documents')
          .update({
            title: baseDocRow.title,
            source: baseDocRow.source,
            metadata: baseDocRow.metadata,
            content_hash: baseDocRow.content_hash,
          })
          .eq('id', existing.id);

        if (updateErr) throw updateErr;
        documentId = existing.id;

        // Delete old chunks for re-indexing
        await supabase.from('summer_chunks').delete().eq('document_id', documentId);
      } else {
        // Insert new document
        const { data, error } = await supabase
          .from('summer_documents')
          .insert(baseDocRow)
          .select('id')
          .single();

        if (error) throw error;
        documentId = data.id;
      }
    } else {
      const { data, error } = await supabase
        .from('summer_documents')
        .insert(baseDocRow)
        .select('id')
        .single();

      if (error) throw error;
      documentId = data.id;
    }

    // 2) Chunk
    const chunks = chunkText(content, params.chunking);
    if (chunks.length === 0) continue;

    // 3) Embed (batch)
    const embeddings = await embedder.embed(
      chunks.map((c) => c.content),
      'document'
    );

    // 4) Insert chunks
    const chunkRows = chunks.map((c, idx) => ({
      user_id: params.userId,
      collection_id: params.collectionId,
      document_id: documentId,
      chunk_index: c.index,
      content: c.content,
      token_count: c.tokenCount,
      embedding: embeddings[idx],
      metadata: {
        ...doc.metadata,
        external_id: doc.external_id ?? undefined,
        title: doc.title ?? undefined,
        source: doc.source ?? undefined,
      },
    }));

    const { error: insertErr } = await supabase.from('summer_chunks').insert(chunkRows);
    if (insertErr) throw insertErr;

    totalChunks += chunks.length;
  }

  return {
    documentCount: params.documents.length,
    chunkCount: totalChunks,
  };
}
