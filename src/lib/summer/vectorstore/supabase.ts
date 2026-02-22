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

  private static readonly RRF_K = 60;

  private shouldFallbackHybrid(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return (
      error.code === 'PGRST203' ||
      Boolean(error.message && error.message.includes('Could not choose the best candidate function'))
    );
  }

  private parseEmbedding(value: unknown): number[] | null {
    if (Array.isArray(value)) {
      const parsed = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
      return parsed.length > 0 ? parsed : null;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const vector = parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
          return vector.length > 0 ? vector : null;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  private async fallbackVectorSearch(params: {
    userId: string;
    collectionId: string;
    queryEmbedding: number[];
    topK: number;
    threshold?: number;
  }): Promise<VectorSearchResult[]> {
    const supabase = createServerClient();
    const fetchLimit = Math.min(Math.max(params.topK * 40, 200), 2000);

    const { data, error } = await supabase
      .from('summer_chunks')
      .select('id, document_id, content, metadata, embedding')
      .eq('user_id', params.userId)
      .eq('collection_id', params.collectionId)
      .limit(fetchLimit);

    if (error) throw error;

    const threshold = params.threshold ?? 0.5;
    const scored = (data ?? [])
      .map((row: any) => {
        const embedding = this.parseEmbedding(row.embedding);
        if (!embedding) return null;
        const similarity = this.cosineSimilarity(params.queryEmbedding, embedding);
        return {
          row,
          similarity,
        };
      })
      .filter((item): item is { row: any; similarity: number } => item !== null && item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, params.topK);

    return scored.map(({ row, similarity }) => ({
      chunkId: row.id,
      documentId: row.document_id,
      text: row.content,
      metadata: row.metadata ?? {},
      similarity,
      source: 'managed_fallback',
    }));
  }

  private localHybridFuse(
    vectorResults: VectorSearchResult[],
    keywordResults: VectorSearchResult[],
    topK: number,
    vectorWeight: number,
    keywordWeight: number
  ): VectorSearchResult[] {
    const scoreMap = new Map<string, number>();
    const vectorRankMap = new Map<string, number>();
    const keywordRankMap = new Map<string, number>();
    const candidateMap = new Map<string, VectorSearchResult>();

    vectorResults.forEach((item, index) => {
      const rank = index + 1;
      vectorRankMap.set(item.chunkId, rank);
      candidateMap.set(item.chunkId, item);
      const current = scoreMap.get(item.chunkId) ?? 0;
      scoreMap.set(item.chunkId, current + vectorWeight / (SupabaseVectorStore.RRF_K + rank));
    });

    keywordResults.forEach((item, index) => {
      const rank = index + 1;
      keywordRankMap.set(item.chunkId, rank);
      if (!candidateMap.has(item.chunkId)) {
        candidateMap.set(item.chunkId, item);
      }
      const current = scoreMap.get(item.chunkId) ?? 0;
      scoreMap.set(item.chunkId, current + keywordWeight / (SupabaseVectorStore.RRF_K + rank));
    });

    return Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([chunkId, fusedScore]) => {
        const candidate = candidateMap.get(chunkId)!;
        return {
          ...candidate,
          keywordRank: keywordRankMap.get(chunkId) ?? candidate.keywordRank,
          combinedScore: fusedScore,
          source: candidate.source ?? 'managed',
        };
      });
  }

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

    if (error) {
      if (this.shouldFallbackHybrid(error)) {
        return this.fallbackVectorSearch(params);
      }
      throw error;
    }

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

    if (error) {
      if (this.shouldFallbackHybrid(error)) {
        const effectiveTopK = Math.max(4, params.topK * 2);
        const vectorWeight = params.vectorWeight ?? 0.7;
        const keywordWeight = params.keywordWeight ?? 0.3;
        const [vectorResults, keywordResults] = await Promise.all([
          this.search({
            userId: params.userId,
            collectionId: params.collectionId,
            queryEmbedding: params.queryEmbedding,
            topK: effectiveTopK,
            threshold: params.threshold,
            searchEf: params.searchEf,
          }),
          this.keywordSearch({
            userId: params.userId,
            collectionId: params.collectionId,
            queryText: params.queryText,
            topK: effectiveTopK,
          }),
        ]);

        return this.localHybridFuse(
          vectorResults,
          keywordResults,
          params.topK,
          vectorWeight,
          keywordWeight
        );
      }
      throw error;
    }

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
