/**
 * Fact Invalidation Service
 *
 * Manages temporal validity of memories:
 * - Auto-expire facts based on valid_to timestamp
 * - Invalidate conflicting facts when new information arrives
 * - Manual fact invalidation with reasons
 *
 * @module spring/memory-v4/fact-invalidation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface InvalidationResult {
  invalidated: number;
  archived: number;
  errors: string[];
}

export interface ConflictResolution {
  keepMemoryId: string;
  invalidateMemoryIds: string[];
  reason: string;
  autoResolved: boolean;
}

export interface InvalidationRecord {
  id: string;
  memoryId: string;
  invalidatedAt: Date;
  invalidatedBy?: string;
  reason: string;
  autoInvalidated: boolean;
}

// =============================================================================
// Fact Invalidation Service
// =============================================================================

export class FactInvalidationService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Process all expired facts for a user (or all users if not specified)
   *
   * Facts with valid_to < now() are marked as 'expired'
   */
  async processExpiredFacts(userId?: string): Promise<InvalidationResult> {
    const result: InvalidationResult = {
      invalidated: 0,
      archived: 0,
      errors: [],
    };

    try {
      // Build query
      let query = this.supabase
        .from('spring_memory_notes')
        .select('id, user_id, content')
        .eq('status', 'active')
        .not('valid_to', 'is', null)
        .lt('valid_to', new Date().toISOString());

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: expiredNotes, error: fetchError } = await query.limit(100);

      if (fetchError) {
        result.errors.push(`Fetch error: ${fetchError.message}`);
        return result;
      }

      if (!expiredNotes || expiredNotes.length === 0) {
        return result;
      }

      // Process each expired note
      for (const note of expiredNotes) {
        try {
          // Update status to expired
          const { error: updateError } = await this.supabase
            .from('spring_memory_notes')
            .update({
              status: 'expired',
              updated_at: new Date().toISOString(),
            })
            .eq('id', note.id);

          if (updateError) {
            result.errors.push(`Update ${note.id}: ${updateError.message}`);
            continue;
          }

          // Record invalidation
          await this.recordInvalidation(note.id, null, 'Expired based on valid_to timestamp', true);

          result.invalidated++;
        } catch (error) {
          result.errors.push(
            `Process ${note.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      return result;
    } catch (error) {
      result.errors.push(
        `General error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return result;
    }
  }

  /**
   * Invalidate facts that conflict with new information
   *
   * When a new fact contradicts existing facts, this method:
   * 1. Marks conflicting facts as 'superseded'
   * 2. Creates a SUPERSEDES edge from new to old
   * 3. Records the invalidation
   */
  async invalidateByNewFact(
    newMemoryId: string,
    conflictingMemoryIds: string[],
    reason: string
  ): Promise<{ invalidated: number; errors: string[] }> {
    const result = { invalidated: 0, errors: [] as string[] };

    for (const conflictId of conflictingMemoryIds) {
      try {
        // Update status
        const { error: updateError } = await this.supabase
          .from('spring_memory_notes')
          .update({
            status: 'superseded',
            superseded_by_id: newMemoryId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conflictId);

        if (updateError) {
          result.errors.push(`Update ${conflictId}: ${updateError.message}`);
          continue;
        }

        // Create SUPERSEDES edge
        await this.supabase.from('spring_memory_edges').upsert(
          {
            src_memory_id: newMemoryId,
            dst_memory_id: conflictId,
            edge_type: 'supersedes',
            weight: 1.0,
            reason,
            confidence: 1.0,
          },
          { onConflict: 'src_memory_id,dst_memory_id,edge_type' }
        );

        // Record invalidation
        await this.recordInvalidation(conflictId, newMemoryId, reason, false);

        result.invalidated++;
      } catch (error) {
        result.errors.push(
          `Invalidate ${conflictId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return result;
  }

  /**
   * Manually invalidate a fact
   */
  async invalidateFact(
    memoryId: string,
    reason: string,
    invalidatedBy?: string
  ): Promise<boolean> {
    try {
      // Update status
      const { error: updateError } = await this.supabase
        .from('spring_memory_notes')
        .update({
          status: 'invalidated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoryId);

      if (updateError) {
        console.error('Failed to invalidate fact:', updateError);
        return false;
      }

      // Record invalidation
      await this.recordInvalidation(memoryId, invalidatedBy ?? null, reason, false);

      return true;
    } catch (error) {
      console.error('Invalidate fact error:', error);
      return false;
    }
  }

  /**
   * Detect potential conflicts between a new memory and existing ones
   *
   * Uses semantic similarity and contradiction detection
   */
  async detectConflicts(
    userId: string,
    newContent: string,
    newEmbedding?: number[]
  ): Promise<ConflictResolution | null> {
    try {
      // If no embedding provided, we can't do semantic search
      if (!newEmbedding) {
        return null;
      }

      // Find similar existing facts
      const { data: similarFacts, error } = await this.supabase.rpc(
        'search_spring_memories',
        {
          p_user_id: userId,
          p_embedding: newEmbedding,
          p_match_threshold: 0.85, // High similarity threshold
          p_match_count: 5,
          p_filters: { status: ['active'], types: ['fact'] },
        }
      );

      if (error || !similarFacts || similarFacts.length === 0) {
        return null;
      }

      // Check for contradictions using simple heuristics
      // (In production, use LLM for better detection)
      const conflicting: string[] = [];

      for (const fact of similarFacts) {
        if (this.isLikelyContradiction(newContent, fact.content)) {
          conflicting.push(fact.id);
        }
      }

      if (conflicting.length === 0) {
        return null;
      }

      return {
        keepMemoryId: '', // Will be set after new memory is created
        invalidateMemoryIds: conflicting,
        reason: 'Detected potential contradiction with new information',
        autoResolved: false,
      };
    } catch (error) {
      console.error('Conflict detection error:', error);
      return null;
    }
  }

  /**
   * Archive old invalidated facts (cleanup)
   */
  async archiveOldInvalidations(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    try {
      const { data, error } = await this.supabase
        .from('spring_memory_notes')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString(),
        })
        .in('status', ['expired', 'superseded', 'invalidated'])
        .lt('updated_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        console.error('Archive error:', error);
        return 0;
      }

      return data?.length ?? 0;
    } catch (error) {
      console.error('Archive error:', error);
      return 0;
    }
  }

  /**
   * Get invalidation history for a memory
   */
  async getInvalidationHistory(memoryId: string): Promise<InvalidationRecord[]> {
    const { data, error } = await this.supabase
      .from('spring_fact_invalidations')
      .select('*')
      .eq('memory_id', memoryId)
      .order('invalidated_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((record) => ({
      id: record.id,
      memoryId: record.memory_id,
      invalidatedAt: new Date(record.invalidated_at),
      invalidatedBy: record.invalidated_by,
      reason: record.reason,
      autoInvalidated: record.auto_invalidated,
    }));
  }

  /**
   * Restore an invalidated fact
   */
  async restoreFact(memoryId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('spring_memory_notes')
        .update({
          status: 'active',
          superseded_by_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoryId);

      return !error;
    } catch (error) {
      console.error('Restore fact error:', error);
      return false;
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Record an invalidation event
   */
  private async recordInvalidation(
    memoryId: string,
    invalidatedBy: string | null,
    reason: string,
    autoInvalidated: boolean
  ): Promise<void> {
    await this.supabase.from('spring_fact_invalidations').insert({
      memory_id: memoryId,
      invalidated_by: invalidatedBy,
      reason,
      auto_invalidated: autoInvalidated,
      invalidated_at: new Date().toISOString(),
    });
  }

  /**
   * Simple heuristic to detect likely contradictions
   *
   * In production, use an LLM for better detection
   */
  private isLikelyContradiction(text1: string, text2: string): boolean {
    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();

    // Negation pattern pairs: [positive pattern, negative pattern]
    const negationPatterns: Array<[RegExp, RegExp]> = [
      [/(?:is|are|was|were) (\w+)/, /(?:is|are|was|were) not (\w+)/],
      [/(?:likes?|loves?|prefers?) (\w+)/, /(?:dislikes?|hates?|doesn't like) (\w+)/],
      [/(?:can|will|does) (\w+)/, /(?:cannot|can't|won't|doesn't) (\w+)/],
      [/always (\w+)/, /never (\w+)/],
      [/(\d+)/, /(\d+)/], // Different numbers in similar context
    ];

    for (const [pattern1, pattern2] of negationPatterns) {
      const match1 = lower1.match(pattern1);
      const match2 = lower2.match(pattern2);

      if (match1?.[1] && match2?.[1]) {
        // Check if they capture the same word (potential contradiction)
        if (match1[1] === match2[1]) {
          return true;
        }

        // Also check general word overlap for context similarity
        const words1 = new Set(lower1.split(/\s+/));
        const words2 = new Set(lower2.split(/\s+/));
        const intersection = [...words1].filter((w) => words2.has(w));
        const overlap = intersection.length / Math.min(words1.size, words2.size);

        if (overlap > 0.3) {
          return true;
        }
      }
    }

    return false;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFactInvalidationService(supabase: SupabaseClient): FactInvalidationService {
  return new FactInvalidationService(supabase);
}
