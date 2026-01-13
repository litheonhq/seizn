/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase';
import type { VectorStore, VectorSearchResult } from '../types';

/**
 * Managed vector store implementation using Supabase Postgres + pgvector.
 *
 * Requires DB functions from 021_summer_schema.sql:
 * - summer_search_chunks
 * - summer_keyword_search_chunks
 * - summer_hybrid_search_chunks
 */
export class SupabaseVectorStore implements VectorStore {
  public readonly id = 'supabase_pgvector';

  async search(params: {
    userId: string;
    collectionId: string;
    queryEmbedding: number[];
    topK: number;
    threshold?: number;
    searchEf?: number;
  }): Promise<VectorSearchResult[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('summer_search_chunks', {
      query_embedding: params.queryEmbedding,
      match_user_id: params.userId,
      match_collection_id: params.collectionId,
      match_count: params.topK,
      match_threshold: params.threshold ?? 0.5,
      search_ef: params.searchEf ?? 40,
    });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      text: row.content,
      metadata: row.metadata ?? {},
      similarity: row.similarity,
      source: 'managed',
    }));
  }

  async keywordSearch(params: {
    userId: string;
    collectionId: string;
    queryText: string;
    topK: number;
  }): Promise<VectorSearchResult[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('summer_keyword_search_chunks', {
      query_text: params.queryText,
      match_user_id: params.userId,
      match_collection_id: params.collectionId,
      match_count: params.topK,
    });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      text: row.content,
      metadata: row.metadata ?? {},
      similarity: 0,
      keywordRank: row.rank,
      combinedScore: row.rank,
      source: 'managed',
    }));
  }

  async hybridSearch(params: {
    userId: string;
    collectionId: string;
    queryText: string;
    queryEmbedding: number[];
    topK: number;
    threshold?: number;
    keywordWeight?: number;
    vectorWeight?: number;
    searchEf?: number;
  }): Promise<VectorSearchResult[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('summer_hybrid_search_chunks', {
      query_text: params.queryText,
      query_embedding: params.queryEmbedding,
      match_user_id: params.userId,
      match_collection_id: params.collectionId,
      match_count: params.topK,
      match_threshold: params.threshold ?? 0.5,
      keyword_weight: params.keywordWeight ?? 0.3,
      vector_weight: params.vectorWeight ?? 0.7,
      search_ef: params.searchEf ?? 40,
    });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      text: row.content,
      metadata: row.metadata ?? {},
      similarity: row.similarity ?? 0,
      keywordRank: row.keyword_rank ?? 0,
      combinedScore: row.combined_score ?? 0,
      source: 'managed',
    }));
  }
}
