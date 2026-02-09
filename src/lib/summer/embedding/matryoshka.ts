/**
 * Matryoshka Embedding Utilities
 *
 * Supports dimension truncation (Matryoshka Representation Learning) and
 * binary quantization for dramatic storage/speed improvements.
 *
 * - Matryoshka: any prefix of an embedding is itself a valid embedding
 *   (e.g. truncate 1024-dim → 256-dim with minimal quality loss)
 * - Binary quantization: convert float32 → 1-bit per dimension
 *   (32x storage reduction, 40x search speedup via Hamming distance)
 *
 * Two-stage search pattern:
 *   1. Coarse: binary-quantized 256-dim → top 1000 candidates (Hamming)
 *   2. Fine:   full 1024-dim re-rank top candidates (cosine similarity)
 *
 * @see https://arxiv.org/abs/2205.13147 (Matryoshka Representation Learning)
 */

// ============================================
// Types
// ============================================

export interface MatryoshkaConfig {
  /** Full embedding dimension (source) */
  fullDimension: number;
  /** Truncated dimension for coarse search */
  truncatedDimension: number;
  /** Number of candidates to retrieve in coarse pass */
  coarseCandidates: number;
  /** Final top-K after re-ranking */
  finalTopK: number;
  /** Minimum cosine similarity threshold for final results */
  threshold: number;
}

export interface BinaryVector {
  /** Packed bits as Uint8Array (1 bit per dimension) */
  bits: Uint8Array;
  /** Original dimension count */
  dimensions: number;
}

export interface TwoStageSearchResult {
  id: string;
  /** Hamming distance from coarse search (lower = more similar) */
  hammingDistance: number;
  /** Cosine similarity from fine re-rank (higher = more similar) */
  cosineSimilarity: number;
  /** Original metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_MATRYOSHKA_CONFIG: MatryoshkaConfig = {
  fullDimension: 1024,
  truncatedDimension: 256,
  coarseCandidates: 1000,
  finalTopK: 10,
  threshold: 0.7,
};

// ============================================
// Matryoshka Truncation
// ============================================

/**
 * Truncate an embedding to the first `targetDim` dimensions.
 *
 * For Matryoshka-trained models, the first K dimensions form a valid
 * lower-dimensional embedding. This preserves semantic meaning while
 * reducing storage and search cost.
 */
export function truncateEmbedding(
  embedding: number[],
  targetDim: number
): number[] {
  if (targetDim >= embedding.length) return embedding;
  return embedding.slice(0, targetDim);
}

/**
 * Truncate a batch of embeddings.
 */
export function truncateEmbeddings(
  embeddings: number[][],
  targetDim: number
): number[][] {
  return embeddings.map((e) => truncateEmbedding(e, targetDim));
}

/**
 * L2-normalize a vector (unit length). Required before binary quantization
 * and for accurate cosine similarity via dot product.
 */
export function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

// ============================================
// Binary Quantization
// ============================================

/**
 * Convert a float embedding to binary (1-bit per dimension).
 *
 * Each dimension is mapped to 1 if positive, 0 if non-positive.
 * The result is packed into a Uint8Array (8 dimensions per byte).
 *
 * Storage: 1024 dims × 4 bytes = 4096 bytes → 1024 bits = 128 bytes (32x reduction)
 */
export function toBinaryVector(embedding: number[]): BinaryVector {
  const numBytes = Math.ceil(embedding.length / 8);
  const bits = new Uint8Array(numBytes);

  for (let i = 0; i < embedding.length; i++) {
    if (embedding[i] > 0) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8); // MSB first
      bits[byteIndex] |= 1 << bitIndex;
    }
  }

  return { bits, dimensions: embedding.length };
}

/**
 * Convert a BinaryVector back to a pseudo-float representation.
 * Used for compatibility with cosine similarity functions.
 * Each bit becomes +1 (set) or -1 (unset).
 */
export function fromBinaryVector(bv: BinaryVector): number[] {
  const result = new Array<number>(bv.dimensions);
  for (let i = 0; i < bv.dimensions; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    result[i] = (bv.bits[byteIndex] & (1 << bitIndex)) !== 0 ? 1 : -1;
  }
  return result;
}

/**
 * Compute Hamming distance between two binary vectors.
 *
 * Hamming distance = number of differing bits.
 * Lower distance = more similar.
 * This is extremely fast — just XOR + popcount.
 */
export function hammingDistance(a: BinaryVector, b: BinaryVector): number {
  if (a.dimensions !== b.dimensions) {
    throw new Error(`Dimension mismatch: ${a.dimensions} vs ${b.dimensions}`);
  }

  let distance = 0;
  for (let i = 0; i < a.bits.length; i++) {
    // XOR gives bits that differ, then count them
    let xor = a.bits[i] ^ b.bits[i];
    // Brian Kernighan's popcount
    while (xor) {
      xor &= xor - 1;
      distance++;
    }
  }
  return distance;
}

/**
 * Convert Hamming distance to a similarity score in [0, 1].
 *
 * similarity = 1 - (hammingDistance / totalDimensions)
 */
export function hammingToSimilarity(distance: number, dimensions: number): number {
  return 1 - distance / dimensions;
}

/**
 * Serialize BinaryVector to a hex string for database storage.
 */
export function binaryVectorToHex(bv: BinaryVector): string {
  return Array.from(bv.bits)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deserialize a hex string back to BinaryVector.
 */
export function hexToBinaryVector(hex: string, dimensions: number): BinaryVector {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return { bits: bytes, dimensions };
}

// ============================================
// Two-Stage Search Engine
// ============================================

/**
 * In-memory index for binary-quantized vectors.
 * Used for the coarse search phase.
 */
export class BinaryVectorIndex {
  private vectors: Array<{ id: string; binary: BinaryVector; full: number[]; metadata?: Record<string, unknown> }> = [];

  /** Number of indexed vectors */
  get size(): number {
    return this.vectors.length;
  }

  /**
   * Add a vector to the index.
   * Stores both the binary (for coarse search) and full (for re-rank).
   */
  add(
    id: string,
    fullEmbedding: number[],
    truncatedDim: number,
    metadata?: Record<string, unknown>
  ): void {
    const truncated = truncateEmbedding(fullEmbedding, truncatedDim);
    const normalized = l2Normalize(truncated);
    const binary = toBinaryVector(normalized);

    this.vectors.push({
      id,
      binary,
      full: fullEmbedding,
      metadata,
    });
  }

  /**
   * Remove a vector from the index by ID.
   */
  remove(id: string): boolean {
    const idx = this.vectors.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    this.vectors.splice(idx, 1);
    return true;
  }

  /**
   * Two-stage search:
   * 1. Coarse: Hamming distance on binary-quantized truncated embeddings
   * 2. Fine: Cosine similarity on full embeddings for top candidates
   */
  search(
    queryEmbedding: number[],
    config: MatryoshkaConfig = DEFAULT_MATRYOSHKA_CONFIG
  ): TwoStageSearchResult[] {
    if (this.vectors.length === 0) return [];

    // Stage 1: Binary coarse search on truncated embeddings
    const truncatedQuery = truncateEmbedding(queryEmbedding, config.truncatedDimension);
    const normalizedQuery = l2Normalize(truncatedQuery);
    const binaryQuery = toBinaryVector(normalizedQuery);

    const coarseResults = this.vectors
      .map((v) => ({
        ...v,
        hammingDist: hammingDistance(binaryQuery, v.binary),
      }))
      .sort((a, b) => a.hammingDist - b.hammingDist)
      .slice(0, config.coarseCandidates);

    // Stage 2: Full cosine similarity re-rank
    const normalizedFullQuery = l2Normalize(queryEmbedding);

    const fineResults = coarseResults
      .map((candidate) => {
        const normalizedFull = l2Normalize(candidate.full);
        let dot = 0;
        for (let i = 0; i < normalizedFullQuery.length; i++) {
          dot += normalizedFullQuery[i] * normalizedFull[i];
        }
        const similarity = Math.max(0, Math.min(1, dot));

        return {
          id: candidate.id,
          hammingDistance: candidate.hammingDist,
          cosineSimilarity: similarity,
          metadata: candidate.metadata,
        };
      })
      .filter((r) => r.cosineSimilarity >= config.threshold)
      .sort((a, b) => b.cosineSimilarity - a.cosineSimilarity)
      .slice(0, config.finalTopK);

    return fineResults;
  }

  /** Clear all vectors from the index */
  clear(): void {
    this.vectors = [];
  }
}

// ============================================
// Embedding Pipeline Helpers
// ============================================

/**
 * Process a full embedding into storage-optimized representations.
 *
 * Returns both the truncated embedding (for DB vector column) and
 * the binary-quantized hex (for fast coarse search column).
 */
export function processEmbeddingForStorage(
  fullEmbedding: number[],
  config: Pick<MatryoshkaConfig, 'truncatedDimension'> = { truncatedDimension: 256 }
): {
  /** Full embedding (original) */
  full: number[];
  /** Truncated embedding for primary vector search */
  truncated: number[];
  /** Binary quantized hex for coarse filtering */
  binaryHex: string;
  /** Dimensions of the binary vector */
  binaryDimensions: number;
} {
  const truncated = truncateEmbedding(fullEmbedding, config.truncatedDimension);
  const normalized = l2Normalize(truncated);
  const binary = toBinaryVector(normalized);

  return {
    full: fullEmbedding,
    truncated,
    binaryHex: binaryVectorToHex(binary),
    binaryDimensions: config.truncatedDimension,
  };
}

/**
 * Estimate storage savings from Matryoshka + Binary Quantization.
 */
export function estimateStorageSavings(
  vectorCount: number,
  fullDimension: number = 1024
): {
  originalBytes: number;
  truncatedBytes: number;
  binaryBytes: number;
  truncationSavingsPercent: number;
  binarySavingsPercent: number;
  totalSavingsPercent: number;
} {
  const bytesPerFloat = 4; // float32
  const originalBytes = vectorCount * fullDimension * bytesPerFloat;
  const truncatedDim = 256;
  const truncatedBytes = vectorCount * truncatedDim * bytesPerFloat;
  const binaryBytes = vectorCount * Math.ceil(truncatedDim / 8);

  return {
    originalBytes,
    truncatedBytes,
    binaryBytes,
    truncationSavingsPercent: ((1 - truncatedBytes / originalBytes) * 100),
    binarySavingsPercent: ((1 - binaryBytes / originalBytes) * 100),
    totalSavingsPercent: ((1 - binaryBytes / originalBytes) * 100),
  };
}
