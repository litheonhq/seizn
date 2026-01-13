/**
 * Seizn Summer - Similarity Calculations
 *
 * Provides vector similarity functions for semantic cache matching.
 * Primary method: Cosine similarity for normalized embeddings.
 */

import type { SimilarityResult, BatchSimilarityResult, CacheEntry } from './types';

// ===========================================
// Cosine Similarity
// ===========================================

/**
 * Calculate cosine similarity between two vectors.
 *
 * Formula: cos(theta) = (A . B) / (|A| * |B|)
 *
 * @param vectorA - First vector
 * @param vectorB - Second vector
 * @returns Similarity score between 0 and 1
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(
      `Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`
    );
  }

  if (vectorA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  // Clamp to [0, 1] to handle floating point precision issues
  const similarity = dotProduct / magnitude;
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Calculate cosine similarity for pre-normalized vectors (faster).
 * Use this when vectors are known to be unit vectors.
 *
 * @param vectorA - First normalized vector
 * @param vectorB - Second normalized vector
 * @returns Similarity score between 0 and 1
 */
export function cosineSimilarityNormalized(
  vectorA: number[],
  vectorB: number[]
): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(
      `Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`
    );
  }

  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  return Math.max(0, Math.min(1, dotProduct));
}

// ===========================================
// Vector Normalization
// ===========================================

/**
 * Normalize a vector to unit length.
 *
 * @param vector - Input vector
 * @returns Unit vector
 */
export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));

  if (norm === 0) {
    return vector.map(() => 0);
  }

  return vector.map((v) => v / norm);
}

/**
 * Check if a vector is approximately normalized.
 *
 * @param vector - Input vector
 * @param tolerance - Tolerance for norm check (default 0.001)
 * @returns true if vector is normalized
 */
export function isNormalized(vector: number[], tolerance = 0.001): boolean {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return Math.abs(norm - 1) < tolerance;
}

// ===========================================
// Batch Similarity Operations
// ===========================================

/**
 * Find the most similar entry from a list of cache entries.
 *
 * @param queryEmbedding - Query embedding vector
 * @param entries - List of cache entries to compare
 * @param threshold - Minimum similarity threshold for a hit
 * @returns Best matching result or null if none above threshold
 */
export function findMostSimilar(
  queryEmbedding: number[],
  entries: CacheEntry[],
  threshold: number
): SimilarityResult | null {
  if (entries.length === 0) {
    return null;
  }

  let bestMatch: SimilarityResult | null = null;
  let bestSimilarity = 0;

  for (const entry of entries) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = {
        entryId: entry.id,
        similarity,
        isHit: similarity >= threshold,
        cachedQuery: entry.query,
        entry: similarity >= threshold ? entry : undefined,
      };
    }
  }

  return bestMatch;
}

/**
 * Find top N most similar entries from cache.
 *
 * @param queryEmbedding - Query embedding vector
 * @param entries - List of cache entries to compare
 * @param topN - Number of results to return
 * @param threshold - Minimum similarity threshold
 * @returns Array of similarity results sorted by score descending
 */
export function findTopNSimilar(
  queryEmbedding: number[],
  entries: CacheEntry[],
  topN: number,
  threshold: number
): SimilarityResult[] {
  const results: SimilarityResult[] = [];

  for (const entry of entries) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);

    results.push({
      entryId: entry.id,
      similarity,
      isHit: similarity >= threshold,
      cachedQuery: entry.query,
      entry: similarity >= threshold ? entry : undefined,
    });
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topN);
}

/**
 * Batch similarity comparison for multiple queries.
 *
 * @param queries - Array of query embeddings
 * @param entries - Cache entries to compare against
 * @param threshold - Similarity threshold
 * @param topN - Number of top matches to return per query
 * @returns Array of batch similarity results
 */
export function batchSimilaritySearch(
  queries: { query: string; embedding: number[] }[],
  entries: CacheEntry[],
  threshold: number,
  topN = 1
): BatchSimilarityResult[] {
  const results: BatchSimilarityResult[] = [];

  for (const { query, embedding } of queries) {
    const startTime = Date.now();

    const topMatches = findTopNSimilar(embedding, entries, topN, threshold);
    const bestMatch = topMatches.length > 0 ? topMatches[0] : null;

    results.push({
      query,
      embedding,
      bestMatch: bestMatch?.isHit ? bestMatch : null,
      topMatches,
      comparisonTimeMs: Date.now() - startTime,
    });
  }

  return results;
}

// ===========================================
// Distance Metrics (Alternatives)
// ===========================================

/**
 * Calculate Euclidean distance between two vectors.
 * Lower is more similar.
 *
 * @param vectorA - First vector
 * @param vectorB - Second vector
 * @returns Euclidean distance
 */
export function euclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(
      `Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Convert Euclidean distance to similarity score.
 * Uses exponential decay: sim = exp(-distance)
 *
 * @param distance - Euclidean distance
 * @returns Similarity score between 0 and 1
 */
export function euclideanToSimilarity(distance: number): number {
  return Math.exp(-distance);
}

/**
 * Calculate dot product between two vectors.
 *
 * @param vectorA - First vector
 * @param vectorB - Second vector
 * @returns Dot product
 */
export function dotProduct(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(
      `Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`
    );
  }

  let product = 0;
  for (let i = 0; i < vectorA.length; i++) {
    product += vectorA[i] * vectorB[i];
  }

  return product;
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Calculate average similarity of a list of scores.
 *
 * @param similarities - Array of similarity scores
 * @returns Average similarity
 */
export function averageSimilarity(similarities: number[]): number {
  if (similarities.length === 0) {
    return 0;
  }

  const sum = similarities.reduce((acc, s) => acc + s, 0);
  return sum / similarities.length;
}

/**
 * Check if two embeddings are semantically similar.
 *
 * @param embeddingA - First embedding
 * @param embeddingB - Second embedding
 * @param threshold - Similarity threshold (default 0.95)
 * @returns true if similar
 */
export function areSimilar(
  embeddingA: number[],
  embeddingB: number[],
  threshold = 0.95
): boolean {
  return cosineSimilarity(embeddingA, embeddingB) >= threshold;
}

/**
 * Validate embedding vector dimensions.
 *
 * @param embedding - Embedding vector to validate
 * @param expectedDim - Expected dimension (optional)
 * @throws Error if embedding is invalid
 */
export function validateEmbedding(
  embedding: number[],
  expectedDim?: number
): void {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }

  if (embedding.length === 0) {
    throw new Error('Embedding cannot be empty');
  }

  if (expectedDim !== undefined && embedding.length !== expectedDim) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDim}, got ${embedding.length}`
    );
  }

  for (let i = 0; i < embedding.length; i++) {
    if (typeof embedding[i] !== 'number' || isNaN(embedding[i])) {
      throw new Error(`Invalid embedding value at index ${i}`);
    }
  }
}
