import type { RerankProvider, RerankResult, RerankDocument } from '../types';

/**
 * BM25 parameters
 */
const K1 = 1.2; // Term saturation
const B = 0.75; // Length normalization

/**
 * Simple tokenizer - splits on whitespace and punctuation, lowercases
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Calculate term frequency in document
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

/**
 * Calculate BM25 score for a single document against query
 */
function bm25Score(params: {
  queryTokens: string[];
  docTokens: string[];
  docTf: Map<string, number>;
  avgDocLen: number;
  idf: Map<string, number>;
}): number {
  const { queryTokens, docTokens, docTf, avgDocLen, idf } = params;
  const docLen = docTokens.length;

  let score = 0;
  for (const term of queryTokens) {
    const tf = docTf.get(term) ?? 0;
    if (tf === 0) continue;

    const idfValue = idf.get(term) ?? 0;
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + B * (docLen / avgDocLen));

    score += idfValue * (numerator / denominator);
  }

  return score;
}

/**
 * Local BM25 Reranker - no external API required
 *
 * This is a simple, domain-agnostic implementation.
 * For domain-specific reranking, subclass and override the tokenize method
 * or add domain-specific term weighting.
 */
export class LocalBM25RerankProvider implements RerankProvider {
  public readonly id = 'local-bm25';

  /**
   * Domain-specific stop words (can be extended)
   */
  private readonly stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'of', 'at', 'by', 'for', 'with',
    'about', 'to', 'from', 'in', 'on', 'and', 'or', 'not', 'but', 'if', 'then',
    'this', 'that', 'these', 'those', 'it', 'its', 'as', 'so', 'such',
  ]);

  /**
   * Domain-specific boost terms (relevance multiplier)
   */
  private readonly boostTerms: Map<string, number>;

  constructor(options?: { boostTerms?: Record<string, number> }) {
    this.boostTerms = new Map(Object.entries(options?.boostTerms ?? {}));
  }

  /**
   * Filter tokens, removing stop words
   */
  private filterTokens(tokens: string[]): string[] {
    return tokens.filter((t) => !this.stopWords.has(t) && t.length > 1);
  }

  /**
   * Apply domain-specific boost to query terms
   */
  private applyBoost(tokens: string[]): string[] {
    const boosted: string[] = [];
    for (const token of tokens) {
      const boost = this.boostTerms.get(token) ?? 1;
      // Repeat token for boost effect in BM25
      for (let i = 0; i < boost; i++) {
        boosted.push(token);
      }
    }
    return boosted;
  }

  async rerank(
    query: string,
    documents: RerankDocument[],
    options?: { topN?: number }
  ): Promise<RerankResult[]> {
    if (documents.length === 0) return [];

    const topN = options?.topN ?? documents.length;

    // Tokenize query with boost
    const rawQueryTokens = this.filterTokens(tokenize(query));
    const queryTokens = this.applyBoost(rawQueryTokens);

    // Tokenize all documents
    const docData = documents.map((doc) => {
      const tokens = this.filterTokens(tokenize(doc.text));
      return { doc, tokens, tf: termFrequency(tokens) };
    });

    // Calculate average document length
    const totalLen = docData.reduce((sum, d) => sum + d.tokens.length, 0);
    const avgDocLen = totalLen / docData.length;

    // Calculate IDF for query terms
    const idf = new Map<string, number>();
    const N = docData.length;

    for (const term of new Set(queryTokens)) {
      const docsWithTerm = docData.filter((d) => d.tf.has(term)).length;
      // IDF with smoothing
      const idfValue = Math.log(1 + (N - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
      idf.set(term, Math.max(0, idfValue));
    }

    // Score each document
    const results: RerankResult[] = docData.map((d, idx) => {
      const score = bm25Score({
        queryTokens,
        docTokens: d.tokens,
        docTf: d.tf,
        avgDocLen,
        idf,
      });

      return {
        id: d.doc.id,
        score,
        index: idx,
      };
    });

    // Sort by score descending and take topN
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }
}
