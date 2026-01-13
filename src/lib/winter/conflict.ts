/**
 * Seizn Winter - Memory vs RAG Conflict Resolution
 *
 * Handles conflicts between memories and documents:
 * - If memory conflicts with documents, documents win
 * - If no document grounding, lower memory confidence score
 * - Detects semantic contradictions and resolves them
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type ConflictType =
  | 'contradiction' // Direct contradiction between memory and document
  | 'outdated' // Memory contains outdated information
  | 'ungrounded' // Memory has no document support
  | 'partial_support'; // Memory is partially supported

export type ResolutionAction =
  | 'prefer_document' // Use document content
  | 'lower_confidence' // Reduce memory confidence
  | 'flag_for_review' // Mark for manual review
  | 'merge' // Combine information from both
  | 'keep_memory'; // Keep memory (no conflict)

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: ConflictType;
  conflictScore: number; // 0-1, higher = more severe
  memoryId: string;
  documentId?: string;
  documentChunkId?: string;
  explanation?: string;
}

export interface ConflictResolution {
  action: ResolutionAction;
  originalConfidence: number;
  adjustedConfidence: number;
  reasoning: string;
  preferredContent?: string; // The content that should be used
  metadata?: Record<string, unknown>;
}

export interface ResolvedMemory {
  id: string;
  content: string;
  originalContent?: string;
  confidence: number;
  originalConfidence: number;
  hasConflict: boolean;
  resolution?: ConflictResolution;
  groundingDocuments?: {
    documentId: string;
    chunkId: string;
    similarity: number;
    content: string;
  }[];
}

export interface ConflictCheckParams {
  memoryId: string;
  memoryContent: string;
  memoryConfidence: number;
  userId: string;
  collectionId?: string;
  queryEmbedding?: number[];
  similarityThreshold?: number;
  groundingRequired?: boolean;
}

// ============================================
// Configuration
// ============================================

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
const CONFLICT_CONFIDENCE_PENALTY = 0.3; // Reduce confidence by 30%
const UNGROUNDED_CONFIDENCE_PENALTY = 0.2; // Reduce confidence by 20%
const CONTRADICTION_SIMILARITY_THRESHOLD = 0.85; // High similarity with opposite meaning
const MIN_CONFIDENCE = 0.1; // Never go below 10% confidence

// ============================================
// Conflict Detection
// ============================================

/**
 * Check if a memory conflicts with documents in the RAG store
 */
export async function detectConflict(
  params: ConflictCheckParams
): Promise<ConflictDetectionResult> {
  const supabase = createServerClient();

  const {
    memoryId,
    memoryContent,
    userId,
    collectionId,
    queryEmbedding,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
  } = params;

  // If no embedding provided, we can't check for conflicts
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return {
      hasConflict: false,
      conflictScore: 0,
      memoryId,
    };
  }

  try {
    // Search for similar documents
    let query = supabase.rpc('summer_search_chunks', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_collection_id: collectionId,
      match_count: 5,
      match_threshold: similarityThreshold,
    });

    const { data: similarChunks, error } = await query;

    if (error) {
      console.error('Conflict detection search error:', error);
      return {
        hasConflict: false,
        conflictScore: 0,
        memoryId,
      };
    }

    // No similar documents found = ungrounded memory
    if (!similarChunks || similarChunks.length === 0) {
      return {
        hasConflict: true,
        conflictType: 'ungrounded',
        conflictScore: 0.3, // Low severity
        memoryId,
        explanation: 'Memory has no supporting documents in the knowledge base',
      };
    }

    // Check for contradictions using semantic analysis
    const contradictionCheck = analyzeForContradiction(
      memoryContent,
      similarChunks
    );

    if (contradictionCheck.isContradiction) {
      return {
        hasConflict: true,
        conflictType: 'contradiction',
        conflictScore: contradictionCheck.score,
        memoryId,
        documentId: contradictionCheck.documentId,
        documentChunkId: contradictionCheck.chunkId,
        explanation: contradictionCheck.explanation,
      };
    }

    // Check for partial support
    const groundingScore = calculateGroundingScore(memoryContent, similarChunks);

    if (groundingScore < 0.5) {
      return {
        hasConflict: true,
        conflictType: 'partial_support',
        conflictScore: 0.5 - groundingScore,
        memoryId,
        explanation: `Memory is only ${Math.round(groundingScore * 100)}% supported by documents`,
      };
    }

    // No conflict detected
    return {
      hasConflict: false,
      conflictScore: 0,
      memoryId,
    };
  } catch (err) {
    console.error('Conflict detection error:', err);
    return {
      hasConflict: false,
      conflictScore: 0,
      memoryId,
    };
  }
}

/**
 * Analyze if memory content contradicts document content
 */
function analyzeForContradiction(
  memoryContent: string,
  chunks: Array<{
    chunk_id: string;
    document_id: string;
    content: string;
    similarity: number;
  }>
): {
  isContradiction: boolean;
  score: number;
  documentId?: string;
  chunkId?: string;
  explanation?: string;
} {
  const memoryLower = memoryContent.toLowerCase();

  // Common negation patterns
  const negationPatterns = [
    { pattern: /\bnot\b/, negates: true },
    { pattern: /\bnever\b/, negates: true },
    { pattern: /\bno\b/, negates: true },
    { pattern: /\bdon't\b/, negates: true },
    { pattern: /\bdoesn't\b/, negates: true },
    { pattern: /\bwon't\b/, negates: true },
    { pattern: /\bcan't\b/, negates: true },
    { pattern: /\bcannot\b/, negates: true },
    { pattern: /\bfalse\b/, negates: true },
    { pattern: /\bincorrect\b/, negates: true },
    { pattern: /\bwrong\b/, negates: true },
  ];

  for (const chunk of chunks) {
    const chunkLower = chunk.content.toLowerCase();

    // High similarity but different negation = contradiction
    if (chunk.similarity > CONTRADICTION_SIMILARITY_THRESHOLD) {
      const memoryNegated = negationPatterns.some((p) =>
        p.pattern.test(memoryLower)
      );
      const chunkNegated = negationPatterns.some((p) =>
        p.pattern.test(chunkLower)
      );

      if (memoryNegated !== chunkNegated) {
        return {
          isContradiction: true,
          score: chunk.similarity,
          documentId: chunk.document_id,
          chunkId: chunk.chunk_id,
          explanation: `Memory ${memoryNegated ? 'negates' : 'affirms'} what document ${chunkNegated ? 'negates' : 'affirms'}`,
        };
      }
    }

    // Check for opposite quantifiers
    const oppositeQuantifiers = [
      { memory: /\ball\b/, doc: /\bnone\b/ },
      { memory: /\balways\b/, doc: /\bnever\b/ },
      { memory: /\beveryone\b/, doc: /\bno one\b/ },
      { memory: /\beverything\b/, doc: /\bnothing\b/ },
    ];

    for (const { memory: memPattern, doc: docPattern } of oppositeQuantifiers) {
      const memoryHas = memPattern.test(memoryLower);
      const docHas = docPattern.test(chunkLower);

      if (
        (memoryHas && docPattern.test(chunkLower)) ||
        (docHas && memPattern.test(memoryLower))
      ) {
        return {
          isContradiction: true,
          score: 0.8,
          documentId: chunk.document_id,
          chunkId: chunk.chunk_id,
          explanation: 'Memory uses opposite quantifier compared to document',
        };
      }
    }
  }

  return { isContradiction: false, score: 0 };
}

/**
 * Calculate how well a memory is grounded in documents
 */
function calculateGroundingScore(
  memoryContent: string,
  chunks: Array<{ content: string; similarity: number }>
): number {
  if (chunks.length === 0) return 0;

  // Simple keyword overlap analysis
  const memoryWords = new Set(
    memoryContent
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );

  let maxOverlap = 0;

  for (const chunk of chunks) {
    const chunkWords = new Set(
      chunk.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
    );

    const intersection = [...memoryWords].filter((w) => chunkWords.has(w));
    const overlap = intersection.length / Math.max(memoryWords.size, 1);

    // Weight by similarity
    const weightedOverlap = overlap * chunk.similarity;
    maxOverlap = Math.max(maxOverlap, weightedOverlap);
  }

  return maxOverlap;
}

// ============================================
// Conflict Resolution
// ============================================

/**
 * Resolve a detected conflict
 */
export function resolveConflict(
  conflict: ConflictDetectionResult,
  memoryContent: string,
  memoryConfidence: number,
  documentContent?: string
): ConflictResolution {
  if (!conflict.hasConflict) {
    return {
      action: 'keep_memory',
      originalConfidence: memoryConfidence,
      adjustedConfidence: memoryConfidence,
      reasoning: 'No conflict detected',
    };
  }

  switch (conflict.conflictType) {
    case 'contradiction':
      // Documents always win in contradictions
      return {
        action: 'prefer_document',
        originalConfidence: memoryConfidence,
        adjustedConfidence: Math.max(
          MIN_CONFIDENCE,
          memoryConfidence * (1 - CONFLICT_CONFIDENCE_PENALTY)
        ),
        reasoning:
          'Memory contradicts authoritative document. Document content preferred.',
        preferredContent: documentContent,
        metadata: {
          conflictType: 'contradiction',
          documentChunkId: conflict.documentChunkId,
        },
      };

    case 'outdated':
      return {
        action: 'prefer_document',
        originalConfidence: memoryConfidence,
        adjustedConfidence: Math.max(
          MIN_CONFIDENCE,
          memoryConfidence * (1 - CONFLICT_CONFIDENCE_PENALTY)
        ),
        reasoning:
          'Memory appears to contain outdated information. Document content preferred.',
        preferredContent: documentContent,
        metadata: { conflictType: 'outdated' },
      };

    case 'ungrounded':
      // Lower confidence but keep memory
      return {
        action: 'lower_confidence',
        originalConfidence: memoryConfidence,
        adjustedConfidence: Math.max(
          MIN_CONFIDENCE,
          memoryConfidence * (1 - UNGROUNDED_CONFIDENCE_PENALTY)
        ),
        reasoning:
          'Memory has no supporting documents. Confidence reduced.',
        metadata: { conflictType: 'ungrounded' },
      };

    case 'partial_support':
      // Slight confidence reduction
      const penalty = conflict.conflictScore * 0.2;
      return {
        action: 'lower_confidence',
        originalConfidence: memoryConfidence,
        adjustedConfidence: Math.max(
          MIN_CONFIDENCE,
          memoryConfidence * (1 - penalty)
        ),
        reasoning: `Memory is partially supported by documents (${Math.round((1 - conflict.conflictScore) * 100)}% grounded). Confidence adjusted.`,
        metadata: {
          conflictType: 'partial_support',
          groundingScore: 1 - conflict.conflictScore,
        },
      };

    default:
      return {
        action: 'keep_memory',
        originalConfidence: memoryConfidence,
        adjustedConfidence: memoryConfidence,
        reasoning: 'Unknown conflict type - keeping original memory',
      };
  }
}

// ============================================
// Batch Processing
// ============================================

/**
 * Process multiple memories for conflicts
 */
export async function batchResolveConflicts(
  memories: Array<{
    id: string;
    content: string;
    confidence: number;
    embedding?: number[];
  }>,
  userId: string,
  collectionId?: string
): Promise<ResolvedMemory[]> {
  const results: ResolvedMemory[] = [];

  for (const memory of memories) {
    // Detect conflict
    const conflict = await detectConflict({
      memoryId: memory.id,
      memoryContent: memory.content,
      memoryConfidence: memory.confidence,
      userId,
      collectionId,
      queryEmbedding: memory.embedding,
    });

    // Resolve if there's a conflict
    const resolution = resolveConflict(
      conflict,
      memory.content,
      memory.confidence
    );

    results.push({
      id: memory.id,
      content:
        resolution.preferredContent || memory.content,
      originalContent:
        resolution.preferredContent ? memory.content : undefined,
      confidence: resolution.adjustedConfidence,
      originalConfidence: memory.confidence,
      hasConflict: conflict.hasConflict,
      resolution: conflict.hasConflict ? resolution : undefined,
    });
  }

  return results;
}

// ============================================
// Database Update Functions
// ============================================

/**
 * Apply confidence adjustment to a memory in the database
 */
export async function applyConfidenceAdjustment(
  memoryId: string,
  newConfidence: number,
  reason: string
): Promise<void> {
  const supabase = createServerClient();

  await supabase
    .from('memories')
    .update({
      confidence: newConfidence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId);

  // Log the adjustment (if audit table exists)
  try {
    await supabase.from('audit_logs').insert({
      action: 'memory_confidence_adjusted',
      resource_type: 'memory',
      resource_id: memoryId,
      details: {
        new_confidence: newConfidence,
        reason,
      },
    });
  } catch {
    // Audit logging is optional
  }
}

/**
 * Flag a memory for manual review
 */
export async function flagForReview(
  memoryId: string,
  userId: string,
  reason: string,
  conflictDetails: ConflictDetectionResult
): Promise<void> {
  const supabase = createServerClient();

  // First, get existing tags
  const { data: existing } = await supabase
    .from('memories')
    .select('tags')
    .eq('id', memoryId)
    .eq('user_id', userId)
    .single();

  const currentTags = (existing?.tags as string[]) || [];
  const updatedTags = currentTags.includes('needs_review')
    ? currentTags
    : [...currentTags, 'needs_review'];

  // Update with new tags
  await supabase
    .from('memories')
    .update({
      tags: updatedTags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)
    .eq('user_id', userId);

  // Log the flag
  try {
    await supabase.from('audit_logs').insert({
      action: 'memory_flagged_for_review',
      resource_type: 'memory',
      resource_id: memoryId,
      user_id: userId,
      details: {
        reason,
        conflict_type: conflictDetails.conflictType,
        conflict_score: conflictDetails.conflictScore,
      },
    });
  } catch {
    // Audit logging is optional
  }
}
