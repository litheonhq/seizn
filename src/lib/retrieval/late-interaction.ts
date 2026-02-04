/**
 * Next-Gen Retrieval: Late-Interaction & Hybrid Search
 *
 * Implements advanced retrieval strategies:
 * - ColBERT-style late-interaction scoring
 * - Sparse-Dense hybrid with BM25
 * - Reciprocal Rank Fusion (RRF)
 * - Query expansion
 *
 * @module retrieval/late-interaction
 */

import { createServerClient } from '@/lib/supabase';
import { computeEmbedding } from '@/lib/embeddings';

// ============================================
// Types
// ============================================

export interface RetrievalConfig {
  topK: number;
  denseBias?: number;       // Weight for dense vectors (0-1), default 0.5
  sparseBias?: number;      // Weight for sparse (BM25) (0-1), default 0.5
  rrfK?: number;            // RRF constant, default 60
  lateInteraction?: boolean; // Enable ColBERT-style reranking
  queryExpansion?: boolean;  // Enable query expansion
  minScore?: number;         // Minimum score threshold
}

export interface Document {
  id: string;
  content: string;
  embedding?: number[];
  tokenEmbeddings?: number[][]; // For late-interaction
  metadata?: Record<string, unknown>;
}

export interface ScoredDocument extends Document {
  score: number;
  denseScore?: number;
  sparseScore?: number;
  lateInteractionScore?: number;
  rank?: number;
}

export interface RetrievalResult {
  documents: ScoredDocument[];
  query: string;
  expandedQueries?: string[];
  timing: {
    denseMs: number;
    sparseMs: number;
    fusionMs: number;
    rerankMs: number;
    totalMs: number;
  };
}

// ============================================
// BM25 Implementation
// ============================================

export class BM25 {
  private k1 = 1.5;
  private b = 0.75;
  private avgDocLength = 0;
  private docCount = 0;
  private termDocFreq: Map<string, number> = new Map();
  private docTermFreq: Map<string, Map<string, number>> = new Map();
  private docLengths: Map<string, number> = new Map();

  /**
   * Build BM25 index from documents
   */
  buildIndex(documents: Array<{ id: string; content: string }>): void {
    this.docCount = documents.length;
    let totalLength = 0;

    for (const doc of documents) {
      const tokens = this.tokenize(doc.content);
      this.docLengths.set(doc.id, tokens.length);
      totalLength += tokens.length;

      const termFreq = new Map<string, number>();
      const seenTerms = new Set<string>();

      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
        if (!seenTerms.has(token)) {
          this.termDocFreq.set(token, (this.termDocFreq.get(token) || 0) + 1);
          seenTerms.add(token);
        }
      }

      this.docTermFreq.set(doc.id, termFreq);
    }

    this.avgDocLength = totalLength / this.docCount;
  }

  /**
   * Score a query against indexed documents
   */
  score(query: string, docIds?: string[]): Map<string, number> {
    const queryTokens = this.tokenize(query);
    const scores = new Map<string, number>();

    const targetDocs = docIds
      ? docIds.filter((id) => this.docTermFreq.has(id))
      : Array.from(this.docTermFreq.keys());

    for (const docId of targetDocs) {
      const docTerms = this.docTermFreq.get(docId)!;
      const docLength = this.docLengths.get(docId)!;
      let score = 0;

      for (const term of queryTokens) {
        const tf = docTerms.get(term) || 0;
        if (tf === 0) continue;

        const df = this.termDocFreq.get(term) || 0;
        const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.set(docId, score);
      }
    }

    return scores;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}

// ============================================
// Late-Interaction (ColBERT-style)
// ============================================

export class LateInteractionScorer {
  /**
   * Compute MaxSim score between query and document token embeddings
   * This is the core of ColBERT's late-interaction mechanism
   */
  computeMaxSim(queryTokenEmbeddings: number[][], docTokenEmbeddings: number[][]): number {
    if (queryTokenEmbeddings.length === 0 || docTokenEmbeddings.length === 0) {
      return 0;
    }

    let totalScore = 0;

    // For each query token, find max similarity with any doc token
    for (const queryEmb of queryTokenEmbeddings) {
      let maxSim = -Infinity;

      for (const docEmb of docTokenEmbeddings) {
        const sim = this.cosineSimilarity(queryEmb, docEmb);
        if (sim > maxSim) {
          maxSim = sim;
        }
      }

      totalScore += maxSim;
    }

    // Normalize by query length
    return totalScore / queryTokenEmbeddings.length;
  }

  /**
   * Rerank documents using late-interaction scoring
   */
  async rerank(
    query: string,
    documents: ScoredDocument[],
    getTokenEmbeddings: (text: string) => Promise<number[][]>
  ): Promise<ScoredDocument[]> {
    const queryTokenEmbs = await getTokenEmbeddings(query);

    const reranked = await Promise.all(
      documents.map(async (doc) => {
        let docTokenEmbs = doc.tokenEmbeddings;
        if (!docTokenEmbs) {
          docTokenEmbs = await getTokenEmbeddings(doc.content);
        }

        const lateInteractionScore = this.computeMaxSim(queryTokenEmbs, docTokenEmbs);

        return {
          ...doc,
          lateInteractionScore,
          score: doc.score * 0.4 + lateInteractionScore * 0.6, // Blend scores
        };
      })
    );

    return reranked.sort((a, b) => b.score - a.score);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const norm = Math.sqrt(normA) * Math.sqrt(normB);
    return norm === 0 ? 0 : dotProduct / norm;
  }
}

// ============================================
// Reciprocal Rank Fusion
// ============================================

export function reciprocalRankFusion(
  rankings: Array<{ docId: string; rank: number; source: string }[]>,
  k: number = 60
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (const item of ranking) {
      const currentScore = scores.get(item.docId) || 0;
      scores.set(item.docId, currentScore + 1 / (k + item.rank));
    }
  }

  return scores;
}

// ============================================
// Query Expansion
// ============================================

export class QueryExpander {
  private synonymMap: Map<string, string[]> = new Map();

  /**
   * Expand query with synonyms and related terms
   */
  async expand(query: string): Promise<string[]> {
    const tokens = query.toLowerCase().split(/\s+/);
    const expansions: string[] = [query];

    // Simple synonym expansion
    const expandedTokens: string[][] = tokens.map((token) => {
      const synonyms = this.synonymMap.get(token);
      return synonyms ? [token, ...synonyms] : [token];
    });

    // Generate variations
    if (expandedTokens.some((t) => t.length > 1)) {
      // Create up to 3 variations
      for (let i = 0; i < Math.min(3, expandedTokens.length); i++) {
        const variation = tokens.map((token, idx) => {
          const alternatives = expandedTokens[idx];
          return alternatives[i % alternatives.length];
        });
        const varQuery = variation.join(' ');
        if (varQuery !== query && !expansions.includes(varQuery)) {
          expansions.push(varQuery);
        }
      }
    }

    return expansions;
  }

  /**
   * Add synonyms for query expansion
   */
  addSynonyms(term: string, synonyms: string[]): void {
    this.synonymMap.set(term.toLowerCase(), synonyms.map((s) => s.toLowerCase()));
  }
}

// ============================================
// Hybrid Retriever
// ============================================

export class HybridRetriever {
  private bm25: BM25;
  private lateInteraction: LateInteractionScorer;
  private queryExpander: QueryExpander;
  private supabase = createServerClient();

  constructor() {
    this.bm25 = new BM25();
    this.lateInteraction = new LateInteractionScorer();
    this.queryExpander = new QueryExpander();
  }

  /**
   * Initialize BM25 index from collection
   */
  async buildIndex(collectionId: string): Promise<void> {
    const { data: chunks } = await this.supabase
      .from('summer_chunks')
      .select('id, content')
      .eq('collection_id', collectionId);

    if (chunks) {
      this.bm25.buildIndex(chunks);
    }
  }

  /**
   * Perform hybrid retrieval with optional late-interaction reranking
   */
  async retrieve(
    query: string,
    collectionId: string,
    config: RetrievalConfig
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const timing = {
      denseMs: 0,
      sparseMs: 0,
      fusionMs: 0,
      rerankMs: 0,
      totalMs: 0,
    };

    const denseBias = config.denseBias ?? 0.5;
    const sparseBias = config.sparseBias ?? 0.5;
    const rrfK = config.rrfK ?? 60;

    // Query expansion if enabled
    let queries = [query];
    if (config.queryExpansion) {
      queries = await this.queryExpander.expand(query);
    }

    // Dense retrieval
    const denseStart = Date.now();
    const denseResults = await this.denseSearch(queries[0], collectionId, config.topK * 2);
    timing.denseMs = Date.now() - denseStart;

    // Sparse retrieval (BM25)
    const sparseStart = Date.now();
    const sparseScores = this.bm25.score(queries[0]);
    timing.sparseMs = Date.now() - sparseStart;

    // Reciprocal Rank Fusion
    const fusionStart = Date.now();

    // Create rankings
    const denseRanking = denseResults.map((doc, idx) => ({
      docId: doc.id,
      rank: idx + 1,
      source: 'dense',
    }));

    const sparseRanking = Array.from(sparseScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.topK * 2)
      .map((entry, idx) => ({
        docId: entry[0],
        rank: idx + 1,
        source: 'sparse',
      }));

    const fusedScores = reciprocalRankFusion([denseRanking, sparseRanking], rrfK);
    timing.fusionMs = Date.now() - fusionStart;

    // Merge results
    const docMap = new Map<string, ScoredDocument>();

    for (const doc of denseResults) {
      docMap.set(doc.id, {
        ...doc,
        denseScore: doc.score,
        sparseScore: sparseScores.get(doc.id) || 0,
        score: fusedScores.get(doc.id) || 0,
      });
    }

    // Add sparse-only results
    for (const [docId, sparseScore] of sparseScores) {
      if (!docMap.has(docId)) {
        // Fetch document content
        const { data: doc } = await this.supabase
          .from('summer_chunks')
          .select('id, content, metadata')
          .eq('id', docId)
          .single();

        if (doc) {
          docMap.set(docId, {
            id: doc.id,
            content: doc.content,
            metadata: doc.metadata,
            denseScore: 0,
            sparseScore,
            score: fusedScores.get(docId) || 0,
          });
        }
      }
    }

    // Sort by fused score
    let results = Array.from(docMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, config.topK * 2);

    // Apply score weights
    results = results.map((doc) => ({
      ...doc,
      score: (doc.denseScore || 0) * denseBias + (doc.sparseScore || 0) * sparseBias,
    }));

    // Late-interaction reranking if enabled
    if (config.lateInteraction && results.length > 0) {
      const rerankStart = Date.now();
      results = await this.lateInteraction.rerank(
        query,
        results.slice(0, Math.min(50, results.length)), // Rerank top 50
        this.getTokenEmbeddings.bind(this)
      );
      timing.rerankMs = Date.now() - rerankStart;
    }

    // Apply minimum score threshold
    if (config.minScore !== undefined) {
      results = results.filter((doc) => doc.score >= config.minScore!);
    }

    // Final ranking
    results = results
      .sort((a, b) => b.score - a.score)
      .slice(0, config.topK)
      .map((doc, idx) => ({ ...doc, rank: idx + 1 }));

    timing.totalMs = Date.now() - startTime;

    return {
      documents: results,
      query,
      expandedQueries: queries.length > 1 ? queries : undefined,
      timing,
    };
  }

  /**
   * Dense vector search using Supabase pgvector
   */
  private async denseSearch(
    query: string,
    collectionId: string,
    limit: number
  ): Promise<ScoredDocument[]> {
    const queryEmbedding = await computeEmbedding(query);

    const { data, error } = await this.supabase.rpc('match_summer_chunks', {
      query_embedding: queryEmbedding,
      match_count: limit,
      filter: { collection_id: collectionId },
    });

    if (error) {
      console.error('Dense search error:', error);
      return [];
    }

    return (data || []).map((row: { id: string; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      score: row.similarity,
    }));
  }

  /**
   * Get token-level embeddings for late-interaction
   * This is a simplified version - production would use a dedicated model
   */
  private async getTokenEmbeddings(text: string): Promise<number[][]> {
    // Tokenize and get embeddings for each significant token
    const tokens = text
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 32); // Limit tokens

    if (tokens.length === 0) {
      return [];
    }

    // In production, use a model that outputs token-level embeddings
    // Here we approximate by embedding each token separately
    const embeddings = await Promise.all(
      tokens.map((token) => computeEmbedding(token))
    );

    return embeddings;
  }
}

// ============================================
// Export factory functions
// ============================================

export function createHybridRetriever(): HybridRetriever {
  return new HybridRetriever();
}

export function createBM25(): BM25 {
  return new BM25();
}

export function createLateInteractionScorer(): LateInteractionScorer {
  return new LateInteractionScorer();
}

export function createQueryExpander(): QueryExpander {
  return new QueryExpander();
}
