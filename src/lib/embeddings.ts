/**
 * Seizn - Embeddings Utility Module
 *
 * Provides a simple interface for computing embeddings.
 * Wraps the underlying embedding provider (Voyage, OpenAI, etc.)
 *
 * @module embeddings
 */

import { getEmbeddingProvider } from '@/lib/summer/embedding';

// ============================================
// Embedding Functions
// ============================================

/**
 * Compute embedding for a single text
 */
export async function computeEmbedding(text: string, inputType: 'document' | 'query' = 'document'): Promise<number[]> {
  const provider = getEmbeddingProvider();
  const result = await provider.embed([text], inputType);
  return result[0] || [];
}

/**
 * Compute embeddings for multiple texts
 */
export async function computeEmbeddings(texts: string[], inputType: 'document' | 'query' = 'document'): Promise<number[][]> {
  const provider = getEmbeddingProvider();
  return provider.embed(texts, inputType);
}

// ============================================
// Similarity Functions
// ============================================

/**
 * Calculate cosine similarity between two vectors
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
 * Calculate Euclidean distance between two vectors
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
 * Normalize a vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));

  if (norm === 0) {
    return vector.map(() => 0);
  }

  return vector.map((v) => v / norm);
}

/**
 * Compute semantic similarity between two texts
 */
export async function semanticSimilarity(textA: string, textB: string): Promise<number> {
  const embeddings = await computeEmbeddings([textA, textB]);
  return cosineSimilarity(embeddings[0], embeddings[1]);
}

// ============================================
// Aliases for backward compatibility
// ============================================

/** @deprecated Use computeEmbedding instead */
export const generateEmbedding = computeEmbedding;

/** @deprecated Use computeEmbeddings instead */
export const generateEmbeddings = computeEmbeddings;
