/**
 * Seizn Summer - Document Indexer
 *
 * Complete indexing pipeline:
 * 1. Validate input documents
 * 2. Chunk documents using selected strategy
 * 3. Generate embeddings (batched)
 * 4. Store in vector database
 * 5. Return indexing results
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getEmbeddingProvider } from './embedding';
import { VoyageEmbeddingProvider } from './embedding/voyage';
import { chunkDocument } from './chunker';
import type {
  IndexDocumentInput,
  IndexingOptions,
  IndexDocumentResult,
  IndexResponse,
  ProcessedChunk,
  EmbeddingModel,
  EmbeddingProvider,
} from './types';

// ============================================
// Constants
// ============================================

const MAX_BATCH_SIZE = 128; // Max documents to embed in one batch
const MAX_CONCURRENT_EMBEDS = 4; // Parallel embedding batches

// ============================================
// Main Indexing Function
// ============================================

export interface IndexDocumentsParams {
  userId: string;
  collectionId: string;
  documents: IndexDocumentInput[];
  options?: IndexingOptions;
}

/**
 * Index documents into the vector store
 *
 * Pipeline:
 * 1. Validate documents
 * 2. Chunk documents
 * 3. Batch embed chunks
 * 4. Store in database
 */
export async function indexDocumentsV2(params: IndexDocumentsParams): Promise<IndexResponse> {
  const startTime = Date.now();
  const { userId, collectionId, documents, options = {} } = params;

  if (!documents || documents.length === 0) {
    return {
      success: true,
      indexed_count: 0,
      chunks_created: 0,
      duration_ms: Date.now() - startTime,
      results: [],
    };
  }

  const supabase = createServerClient();
  const embedder = getEmbeddingProviderForModel(options.embedding_model);

  const results: IndexDocumentResult[] = [];
  let totalChunksCreated = 0;
  let indexedCount = 0;

  // Process documents in batches
  for (let i = 0; i < documents.length; i += MAX_BATCH_SIZE) {
    const batch = documents.slice(i, i + MAX_BATCH_SIZE);
    const batchResults = await processBatch({
      batch,
      userId,
      collectionId,
      options,
      embedder,
      supabase,
    });

    results.push(...batchResults.results);
    totalChunksCreated += batchResults.chunksCreated;
    indexedCount += batchResults.indexedCount;
  }

  return {
    success: true,
    indexed_count: indexedCount,
    chunks_created: totalChunksCreated,
    duration_ms: Date.now() - startTime,
    results,
  };
}

// ============================================
// Batch Processing
// ============================================

interface BatchProcessParams {
  batch: IndexDocumentInput[];
  userId: string;
  collectionId: string;
  options: IndexingOptions;
  embedder: EmbeddingProvider;
  supabase: ReturnType<typeof createServerClient>;
}

interface BatchResult {
  results: IndexDocumentResult[];
  chunksCreated: number;
  indexedCount: number;
}

async function processBatch(params: BatchProcessParams): Promise<BatchResult> {
  const { batch, userId, collectionId, options, embedder, supabase } = params;
  const results: IndexDocumentResult[] = [];
  let chunksCreated = 0;
  let indexedCount = 0;

  // Prepare all documents: validate, check duplicates, chunk
  const preparedDocs: Array<{
    doc: IndexDocumentInput;
    chunks: ProcessedChunk[];
    contentHash: string;
    existingDocId?: string;
    status: 'process' | 'skip' | 'error';
    error?: string;
  }> = [];

  for (const doc of batch) {
    const content = (doc.content ?? '').trim();

    // Validate content
    if (!content) {
      preparedDocs.push({
        doc,
        chunks: [],
        contentHash: '',
        status: 'error',
        error: 'Empty content',
      });
      continue;
    }

    const contentHash = sha256(content);

    // Check for existing document
    let existingDocId: string | undefined;
    if (doc.id) {
      const { data: existing } = await supabase
        .from('summer_documents')
        .select('id, content_hash')
        .eq('collection_id', collectionId)
        .eq('external_id', doc.id)
        .single();

      if (existing) {
        existingDocId = existing.id;

        // Skip if content unchanged and skip_duplicates enabled
        if (options.skip_duplicates && existing.content_hash === contentHash) {
          preparedDocs.push({
            doc,
            chunks: [],
            contentHash,
            existingDocId,
            status: 'skip',
          });
          continue;
        }
      }
    }

    // Chunk the document
    const chunks = chunkDocument(content, options);

    preparedDocs.push({
      doc,
      chunks,
      contentHash,
      existingDocId,
      status: 'process',
    });
  }

  // Collect all chunks for embedding
  const allChunks: Array<{
    preparedIndex: number;
    chunkIndex: number;
    content: string;
  }> = [];

  preparedDocs.forEach((prepared, preparedIndex) => {
    if (prepared.status === 'process') {
      prepared.chunks.forEach((chunk, chunkIndex) => {
        allChunks.push({
          preparedIndex,
          chunkIndex,
          content: chunk.content,
        });
      });
    }
  });

  // Batch embed all chunks
  const embeddings = await batchEmbed(
    allChunks.map((c) => c.content),
    embedder
  );

  // Map embeddings back to chunks
  const embeddingMap = new Map<string, number[]>();
  allChunks.forEach((chunk, idx) => {
    const key = `${chunk.preparedIndex}-${chunk.chunkIndex}`;
    embeddingMap.set(key, embeddings[idx]);
  });

  // Store documents and chunks
  for (let preparedIndex = 0; preparedIndex < preparedDocs.length; preparedIndex++) {
    const prepared = preparedDocs[preparedIndex];

    if (prepared.status === 'skip') {
      results.push({
        document_id: prepared.existingDocId!,
        external_id: prepared.doc.id,
        chunk_count: 0,
        status: 'skipped',
      });
      continue;
    }

    if (prepared.status === 'error') {
      results.push({
        document_id: '',
        external_id: prepared.doc.id,
        chunk_count: 0,
        status: 'error',
        error: prepared.error,
      });
      continue;
    }

    try {
      // Upsert document
      let documentId: string;

      if (prepared.existingDocId) {
        // Update existing document
        const { error: updateError } = await supabase
          .from('summer_documents')
          .update({
            title: prepared.doc.title ?? null,
            source: prepared.doc.source ?? null,
            metadata: prepared.doc.metadata ?? {},
            content_hash: prepared.contentHash,
            updated_at: new Date().toISOString(),
          })
          .eq('id', prepared.existingDocId);

        if (updateError) throw updateError;
        documentId = prepared.existingDocId;

        // Delete old chunks
        await supabase.from('summer_chunks').delete().eq('document_id', documentId);
      } else {
        // Insert new document
        const { data: newDoc, error: insertError } = await supabase
          .from('summer_documents')
          .insert({
            user_id: userId,
            collection_id: collectionId,
            external_id: prepared.doc.id ?? null,
            title: prepared.doc.title ?? null,
            source: prepared.doc.source ?? null,
            metadata: prepared.doc.metadata ?? {},
            content_hash: prepared.contentHash,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        documentId = newDoc.id;
      }

      // Insert chunks with embeddings
      if (prepared.chunks.length > 0) {
        const chunkRows = prepared.chunks.map((chunk, chunkIndex) => {
          const key = `${preparedIndex}-${chunkIndex}`;
          return {
            user_id: userId,
            collection_id: collectionId,
            document_id: documentId,
            chunk_index: chunk.index,
            content: chunk.content,
            token_count: chunk.token_count,
            embedding: embeddingMap.get(key),
            metadata: {
              ...prepared.doc.metadata,
              start_offset: chunk.start_offset,
              end_offset: chunk.end_offset,
              external_id: prepared.doc.id,
              title: prepared.doc.title,
              source: prepared.doc.source,
            },
          };
        });

        const { error: chunkError } = await supabase.from('summer_chunks').insert(chunkRows);
        if (chunkError) throw chunkError;

        chunksCreated += prepared.chunks.length;
      }

      indexedCount++;
      results.push({
        document_id: documentId,
        external_id: prepared.doc.id,
        chunk_count: prepared.chunks.length,
        status: prepared.existingDocId ? 'updated' : 'created',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        document_id: prepared.existingDocId ?? '',
        external_id: prepared.doc.id,
        chunk_count: 0,
        status: 'error',
        error: errorMessage,
      });
    }
  }

  return {
    results,
    chunksCreated,
    indexedCount,
  };
}

// ============================================
// Embedding Utilities
// ============================================

/**
 * Get embedding provider for the specified model
 */
function getEmbeddingProviderForModel(model?: EmbeddingModel): EmbeddingProvider {
  // For now, all models use Voyage
  // In the future, this can be expanded to support other providers
  const voyageModel = model ?? 'voyage-3';

  return new VoyageEmbeddingProvider({
    model: voyageModel,
    dimensions: getEmbeddingDimensions(voyageModel),
  });
}

/**
 * Get embedding dimensions for the model
 */
function getEmbeddingDimensions(model: string): number {
  const dimensionMap: Record<string, number> = {
    'voyage-3': 1024,
    'voyage-3-lite': 512,
    'voyage-code-3': 1024,
    'voyage-finance-2': 1024,
  };
  return dimensionMap[model] ?? 1024;
}

/**
 * Batch embed texts with concurrency control
 */
async function batchEmbed(
  texts: string[],
  embedder: EmbeddingProvider
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Split into batches for parallel processing
  const batchSize = Math.ceil(texts.length / MAX_CONCURRENT_EMBEDS);
  const batches: string[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }

  // Process batches in parallel
  const results = await Promise.all(
    batches.map((batch) => embedder.embed(batch, 'document'))
  );

  // Flatten results
  return results.flat();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate SHA-256 hash of content for duplicate detection
 */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ============================================
// Exports
// ============================================

export {
  indexDocumentsV2 as indexDocuments,
  getEmbeddingProviderForModel,
  getEmbeddingDimensions,
  sha256,
};
