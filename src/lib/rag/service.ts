/**
 * Summer RAG Service
 *
 * Core service for RAG operations including collections, indexing, and retrieval.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  RAGCollection,
  RAGDocument,
  RAGChunk,
  IndexJob,
  IndexOptions,
  RetrieveRequest,
  RetrieveResult,
  RetrievedChunk,
  DocumentUpload,
  ChunkingStrategy,
  EmbeddingModel,
  DEFAULT_CHUNKING,
  getEmbeddingDimension,
  validateChunkingStrategy,
  CollectionStatus,
  DocumentStatus,
  IndexJobStatus,
} from './types';

export class RAGService {
  constructor(private supabase: SupabaseClient) {}

  // ============================================
  // Collection Management
  // ============================================

  async listCollections(
    organizationId: string,
    options?: { page?: number; pageSize?: number; status?: CollectionStatus }
  ): Promise<{ collections: RAGCollection[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('rag_collections')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(`Failed to list collections: ${error.message}`);

    return {
      collections: (data || []).map(this.mapCollection),
      total: count || 0,
    };
  }

  async getCollection(collectionId: string): Promise<RAGCollection | null> {
    const { data, error } = await this.supabase
      .from('rag_collections')
      .select('*')
      .eq('id', collectionId)
      .single();

    if (error) return null;
    return this.mapCollection(data);
  }

  async createCollection(
    organizationId: string,
    collection: {
      name: string;
      description?: string;
      embeddingModel: EmbeddingModel;
      embeddingDimension?: number;
      chunkingStrategy?: ChunkingStrategy;
      metadata?: Record<string, unknown>;
    }
  ): Promise<RAGCollection> {
    const chunkingStrategy = collection.chunkingStrategy || DEFAULT_CHUNKING;

    // Validate chunking strategy
    const validation = validateChunkingStrategy(chunkingStrategy);
    if (!validation.valid) {
      throw new Error(`Invalid chunking strategy: ${validation.errors.join(', ')}`);
    }

    const embeddingDimension = getEmbeddingDimension(
      collection.embeddingModel,
      collection.embeddingDimension
    );

    const { data, error } = await this.supabase
      .from('rag_collections')
      .insert({
        organization_id: organizationId,
        name: collection.name,
        description: collection.description,
        embedding_model: collection.embeddingModel,
        embedding_dimension: embeddingDimension,
        chunking_strategy: chunkingStrategy,
        metadata: collection.metadata,
        document_count: 0,
        chunk_count: 0,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create collection: ${error.message}`);

    return this.mapCollection(data);
  }

  async updateCollection(
    collectionId: string,
    updates: Partial<{
      name: string;
      description: string;
      chunkingStrategy: ChunkingStrategy;
      metadata: Record<string, unknown>;
    }>
  ): Promise<RAGCollection> {
    if (updates.chunkingStrategy) {
      const validation = validateChunkingStrategy(updates.chunkingStrategy);
      if (!validation.valid) {
        throw new Error(`Invalid chunking strategy: ${validation.errors.join(', ')}`);
      }
    }

    const { data, error } = await this.supabase
      .from('rag_collections')
      .update({
        name: updates.name,
        description: updates.description,
        chunking_strategy: updates.chunkingStrategy,
        metadata: updates.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collectionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update collection: ${error.message}`);

    return this.mapCollection(data);
  }

  async deleteCollection(collectionId: string): Promise<void> {
    // Delete all chunks first
    await this.supabase
      .from('rag_chunks')
      .delete()
      .eq('collection_id', collectionId);

    // Delete all documents
    await this.supabase
      .from('rag_documents')
      .delete()
      .eq('collection_id', collectionId);

    // Delete the collection
    const { error } = await this.supabase
      .from('rag_collections')
      .delete()
      .eq('id', collectionId);

    if (error) throw new Error(`Failed to delete collection: ${error.message}`);
  }

  // ============================================
  // Document Management
  // ============================================

  async listDocuments(
    collectionId: string,
    options?: { page?: number; pageSize?: number; status?: DocumentStatus }
  ): Promise<{ documents: RAGDocument[]; total: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('rag_documents')
      .select('*', { count: 'exact' })
      .eq('collection_id', collectionId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(`Failed to list documents: ${error.message}`);

    return {
      documents: (data || []).map(this.mapDocument),
      total: count || 0,
    };
  }

  async getDocument(documentId: string): Promise<RAGDocument | null> {
    const { data, error } = await this.supabase
      .from('rag_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error) return null;
    return this.mapDocument(data);
  }

  async addDocument(
    collectionId: string,
    upload: DocumentUpload
  ): Promise<RAGDocument> {
    let content = upload.content || '';

    // Handle file upload
    if (upload.file) {
      content = Buffer.from(upload.file.data, 'base64').toString('utf-8');
    }

    // Handle URL fetch (simplified - in production, use a proper fetcher)
    if (upload.url && !content) {
      // This would be handled by a background job in production
      content = `[Content to be fetched from: ${upload.url}]`;
    }

    const { data, error } = await this.supabase
      .from('rag_documents')
      .insert({
        collection_id: collectionId,
        source_type: upload.sourceType,
        source_url: upload.url,
        filename: upload.file?.name,
        mime_type: upload.file?.type,
        content,
        metadata: upload.metadata,
        chunk_count: 0,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add document: ${error.message}`);

    // Update collection document count
    await this.supabase.rpc('increment_collection_document_count', {
      collection_id: collectionId,
    });

    return this.mapDocument(data);
  }

  async deleteDocument(documentId: string): Promise<void> {
    // Get document info first
    const doc = await this.getDocument(documentId);
    if (!doc) return;

    // Delete all chunks
    await this.supabase
      .from('rag_chunks')
      .delete()
      .eq('document_id', documentId);

    // Delete the document
    const { error } = await this.supabase
      .from('rag_documents')
      .delete()
      .eq('id', documentId);

    if (error) throw new Error(`Failed to delete document: ${error.message}`);

    // Update collection counts
    await this.supabase.rpc('decrement_collection_document_count', {
      collection_id: doc.collectionId,
      chunk_count: doc.chunkCount,
    });
  }

  // ============================================
  // Indexing
  // ============================================

  async indexDocuments(
    collectionId: string,
    documentIds: string[],
    options?: IndexOptions
  ): Promise<IndexJob> {
    // Create index job
    const { data: job, error } = await this.supabase
      .from('rag_index_jobs')
      .insert({
        collection_id: collectionId,
        document_ids: documentIds,
        status: 'queued',
        progress: 0,
        total_chunks: 0,
        processed_chunks: 0,
        failed_chunks: 0,
        options: options,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create index job: ${error.message}`);

    // Update collection status
    await this.supabase
      .from('rag_collections')
      .update({ status: 'indexing' })
      .eq('id', collectionId);

    // In production, this would queue a background job
    // For now, we'll process synchronously (simplified)
    this.processIndexJob(job.id).catch(console.error);

    return this.mapIndexJob(job);
  }

  async getIndexJob(jobId: string): Promise<IndexJob | null> {
    const { data, error } = await this.supabase
      .from('rag_index_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) return null;
    return this.mapIndexJob(data);
  }

  async cancelIndexJob(jobId: string): Promise<void> {
    await this.supabase
      .from('rag_index_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'processing');
  }

  private async processIndexJob(jobId: string): Promise<void> {
    const job = await this.getIndexJob(jobId);
    if (!job || job.status === 'cancelled') return;

    try {
      // Update status to processing
      await this.supabase
        .from('rag_index_jobs')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', jobId);

      // Get collection for chunking config
      const collection = await this.getCollection(job.collectionId);
      if (!collection) throw new Error('Collection not found');

      let totalChunks = 0;
      let processedChunks = 0;
      let failedChunks = 0;

      for (const documentId of job.documentIds) {
        try {
          const doc = await this.getDocument(documentId);
          if (!doc) continue;

          // Update document status
          await this.supabase
            .from('rag_documents')
            .update({ status: 'processing' })
            .eq('id', documentId);

          // Chunk the document
          const chunks = this.chunkContent(doc.content, collection.chunkingStrategy);
          totalChunks += chunks.length;

          // Insert chunks (without embeddings - would be generated by embedding service)
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            try {
              await this.supabase.from('rag_chunks').insert({
                document_id: documentId,
                collection_id: job.collectionId,
                content: chunk.content,
                chunk_index: i,
                start_offset: chunk.startOffset,
                end_offset: chunk.endOffset,
                metadata: doc.metadata,
                // embedding would be added by a separate embedding job
              });
              processedChunks++;
            } catch (e) {
              failedChunks++;
              console.error(`Failed to insert chunk ${i}:`, e);
            }
          }

          // Update document status and chunk count
          await this.supabase
            .from('rag_documents')
            .update({ status: 'indexed', chunk_count: chunks.length })
            .eq('id', documentId);

          // Update job progress
          const progress = Math.round(
            ((job.documentIds.indexOf(documentId) + 1) / job.documentIds.length) * 100
          );
          await this.supabase
            .from('rag_index_jobs')
            .update({
              progress,
              total_chunks: totalChunks,
              processed_chunks: processedChunks,
              failed_chunks: failedChunks,
            })
            .eq('id', jobId);
        } catch (docError) {
          console.error(`Failed to process document ${documentId}:`, docError);
          await this.supabase
            .from('rag_documents')
            .update({
              status: 'failed',
              processing_error: docError instanceof Error ? docError.message : 'Unknown error',
            })
            .eq('id', documentId);
        }
      }

      // Update collection chunk count
      await this.supabase
        .from('rag_collections')
        .update({
          chunk_count: totalChunks,
          status: 'active',
        })
        .eq('id', job.collectionId);

      // Complete the job
      await this.supabase
        .from('rag_index_jobs')
        .update({
          status: failedChunks > 0 && processedChunks === 0 ? 'failed' : 'completed',
          progress: 100,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch (error) {
      await this.supabase
        .from('rag_index_jobs')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      await this.supabase
        .from('rag_collections')
        .update({ status: 'error' })
        .eq('id', job.collectionId);
    }
  }

  private chunkContent(
    content: string,
    strategy: ChunkingStrategy
  ): Array<{ content: string; startOffset: number; endOffset: number }> {
    const chunks: Array<{ content: string; startOffset: number; endOffset: number }> = [];

    if (strategy.type === 'fixed') {
      // Fixed-size chunking
      let offset = 0;
      while (offset < content.length) {
        const end = Math.min(offset + strategy.chunkSize, content.length);
        chunks.push({
          content: content.slice(offset, end),
          startOffset: offset,
          endOffset: end,
        });
        offset += strategy.chunkSize - strategy.chunkOverlap;
      }
    } else if (strategy.type === 'recursive' || strategy.type === 'semantic') {
      // Recursive text splitting with separators
      const separators = strategy.separators || ['\n\n', '\n', '. ', ' '];
      this.recursiveChunk(content, separators, strategy, 0, chunks);
    } else if (strategy.type === 'sentence') {
      // Sentence-based chunking
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
      let currentChunk = '';
      let startOffset = 0;

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > strategy.chunkSize && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            startOffset,
            endOffset: startOffset + currentChunk.length,
          });
          startOffset += currentChunk.length - strategy.chunkOverlap;
          currentChunk = currentChunk.slice(-strategy.chunkOverlap);
        }
        currentChunk += sentence;
      }

      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          startOffset,
          endOffset: content.length,
        });
      }
    } else if (strategy.type === 'paragraph') {
      // Paragraph-based chunking
      const paragraphs = content.split(/\n\n+/);
      let currentChunk = '';
      let startOffset = 0;

      for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length > strategy.chunkSize && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            startOffset,
            endOffset: startOffset + currentChunk.length,
          });
          startOffset += currentChunk.length;
          currentChunk = '';
        }
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }

      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          startOffset,
          endOffset: content.length,
        });
      }
    } else {
      // Default to fixed chunking
      let offset = 0;
      while (offset < content.length) {
        const end = Math.min(offset + strategy.chunkSize, content.length);
        chunks.push({
          content: content.slice(offset, end),
          startOffset: offset,
          endOffset: end,
        });
        offset += strategy.chunkSize - strategy.chunkOverlap;
      }
    }

    return chunks;
  }

  private recursiveChunk(
    text: string,
    separators: string[],
    strategy: ChunkingStrategy,
    baseOffset: number,
    results: Array<{ content: string; startOffset: number; endOffset: number }>
  ): void {
    if (text.length <= strategy.chunkSize) {
      results.push({
        content: text,
        startOffset: baseOffset,
        endOffset: baseOffset + text.length,
      });
      return;
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    const parts = text.split(separator);
    let currentChunk = '';
    let currentOffset = baseOffset;

    for (const part of parts) {
      const withSeparator = currentChunk ? currentChunk + separator + part : part;

      if (withSeparator.length > strategy.chunkSize && currentChunk) {
        if (remainingSeparators.length > 0 && currentChunk.length > strategy.chunkSize) {
          this.recursiveChunk(currentChunk, remainingSeparators, strategy, currentOffset, results);
        } else {
          results.push({
            content: currentChunk,
            startOffset: currentOffset,
            endOffset: currentOffset + currentChunk.length,
          });
        }
        currentOffset += currentChunk.length + separator.length;
        currentChunk = part;
      } else {
        currentChunk = withSeparator;
      }
    }

    if (currentChunk) {
      if (remainingSeparators.length > 0 && currentChunk.length > strategy.chunkSize) {
        this.recursiveChunk(currentChunk, remainingSeparators, strategy, currentOffset, results);
      } else {
        results.push({
          content: currentChunk,
          startOffset: currentOffset,
          endOffset: currentOffset + currentChunk.length,
        });
      }
    }
  }

  // ============================================
  // Retrieval
  // ============================================

  async retrieve(
    organizationId: string,
    request: RetrieveRequest
  ): Promise<RetrieveResult> {
    const startTime = Date.now();
    const topK = request.topK || 10;
    const minScore = request.minScore || 0.0;

    // Get collection IDs to search
    let collectionIds = request.collectionIds;
    if (!collectionIds || collectionIds.length === 0) {
      const { data: collections } = await this.supabase
        .from('rag_collections')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'active');
      collectionIds = (collections || []).map((c) => c.id);
    }

    if (collectionIds.length === 0) {
      return {
        chunks: [],
        query: request.query,
        totalResults: 0,
        searchTimeMs: Date.now() - startTime,
        reranked: false,
      };
    }

    // Build query
    let query = this.supabase
      .from('rag_chunks')
      .select(`
        id,
        document_id,
        collection_id,
        content,
        metadata,
        rag_documents (
          id,
          filename,
          source_url,
          source_type
        )
      `)
      .in('collection_id', collectionIds);

    // Apply filters
    if (request.filter?.documentIds) {
      query = query.in('document_id', request.filter.documentIds);
    }

    // For now, use text search (in production, use vector similarity with pgvector)
    // This is a simplified implementation
    query = query.textSearch('content', request.query, {
      type: 'websearch',
      config: 'english',
    });

    query = query.limit(topK * 2); // Get extra for filtering

    const { data: chunks, error } = await query;

    if (error) throw new Error(`Retrieval failed: ${error.message}`);

    // Map and score results
    let results: RetrievedChunk[] = (chunks || []).map((chunk) => {
      const doc = Array.isArray(chunk.rag_documents) ? chunk.rag_documents[0] : chunk.rag_documents;
      return {
        id: chunk.id,
        documentId: chunk.document_id,
        collectionId: chunk.collection_id,
        content: request.includeContent !== false ? chunk.content : '',
        score: 0.8, // Placeholder score (would come from vector similarity)
        metadata: request.includeMetadata ? chunk.metadata : undefined,
        document: doc ? {
          id: doc.id,
          filename: doc.filename,
          sourceUrl: doc.source_url,
          sourceType: doc.source_type,
        } : undefined,
      };
    });

    // Filter by min score
    results = results.filter((r) => r.score >= minScore);

    // Apply reranking if configured
    let reranked = false;
    if (request.reranker && request.reranker.model !== 'none') {
      // In production, call reranker API
      // For now, just mark as reranked
      reranked = true;
      results = results.slice(0, request.reranker.topN || topK);
    }

    // Limit to topK
    results = results.slice(0, topK);

    return {
      chunks: results,
      query: request.query,
      totalResults: results.length,
      searchTimeMs: Date.now() - startTime,
      reranked,
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private mapCollection(row: Record<string, unknown>): RAGCollection {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      embeddingModel: row.embedding_model as EmbeddingModel,
      embeddingDimension: row.embedding_dimension as number,
      chunkingStrategy: row.chunking_strategy as ChunkingStrategy,
      metadata: row.metadata as Record<string, unknown> | undefined,
      documentCount: row.document_count as number,
      chunkCount: row.chunk_count as number,
      status: row.status as CollectionStatus,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapDocument(row: Record<string, unknown>): RAGDocument {
    return {
      id: row.id as string,
      collectionId: row.collection_id as string,
      sourceType: row.source_type as RAGDocument['sourceType'],
      sourceUrl: row.source_url as string | undefined,
      filename: row.filename as string | undefined,
      mimeType: row.mime_type as string | undefined,
      content: row.content as string,
      metadata: row.metadata as Record<string, unknown> | undefined,
      chunkCount: row.chunk_count as number,
      status: row.status as DocumentStatus,
      processingError: row.processing_error as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapIndexJob(row: Record<string, unknown>): IndexJob {
    return {
      id: row.id as string,
      collectionId: row.collection_id as string,
      documentIds: row.document_ids as string[],
      status: row.status as IndexJobStatus,
      progress: row.progress as number,
      totalChunks: row.total_chunks as number,
      processedChunks: row.processed_chunks as number,
      failedChunks: row.failed_chunks as number,
      error: row.error as string | undefined,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | undefined,
    };
  }
}

export function createRAGService(supabase: SupabaseClient): RAGService {
  return new RAGService(supabase);
}
