/**
 * Semantic Update Service
 *
 * Provides intelligent memory update operations that analyze
 * relationships and apply changes semantically.
 * Implements Mem0-style "Update Memory" pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import type {
  SemanticUpdateRequest,
  SemanticUpdateResult,
  UpdateCandidate,
  UpdateClassification,
  SearchFiltersV3,
} from './types';
import { createSearchServiceV3, SearchServiceV3 } from './search-service';

// =============================================================================
// Semantic Update Service
// =============================================================================

export class SemanticUpdateService {
  private anthropic: Anthropic;
  private searchService: SearchServiceV3;

  constructor(private supabase: SupabaseClient) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.searchService = createSearchServiceV3(supabase);
  }

  /**
   * Perform semantic update - find and update related memories
   */
  async semanticUpdate(
    userId: string,
    request: SemanticUpdateRequest
  ): Promise<SemanticUpdateResult> {
    const startTime = Date.now();

    // Step 1: Find candidate memories to update
    const searchResults = await this.searchService.search(userId, {
      query: request.statement,
      filters: request.filters,
      mode: 'hybrid',
      topK: 20,
      rerank: true,
    });

    if (searchResults.results.length === 0) {
      return {
        statement: request.statement,
        candidates: [],
        appliedChanges: [],
        dryRun: request.dryRun ?? true,
        processingMs: Date.now() - startTime,
      };
    }

    // Step 2: Analyze each candidate for relationship to the new statement
    const candidates = await this.analyzeUpdateCandidates(
      request.statement,
      searchResults.results.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
      }))
    );

    // Filter to actionable candidates
    const actionableCandidates = candidates.filter(
      (c) => c.classification !== 'no_change'
    );

    // Step 3: Apply changes if not dry run
    const appliedChanges: Array<{
      noteId: string;
      action: UpdateClassification;
      edgeId?: string;
    }> = [];

    if (!request.dryRun && request.autoApply) {
      for (const candidate of actionableCandidates) {
        try {
          const result = await this.applyUpdate(userId, request.statement, candidate);
          if (result) {
            appliedChanges.push(result);
          }
        } catch (error) {
          console.error(`Failed to apply update to ${candidate.noteId}:`, error);
        }
      }
    }

    return {
      statement: request.statement,
      candidates: actionableCandidates,
      appliedChanges,
      dryRun: request.dryRun ?? true,
      processingMs: Date.now() - startTime,
    };
  }

  /**
   * Analyze candidates to determine relationship to new statement
   */
  private async analyzeUpdateCandidates(
    newStatement: string,
    candidates: Array<{ id: string; content: string; type: string }>
  ): Promise<UpdateCandidate[]> {
    const results: UpdateCandidate[] = [];

    // Batch analyze for efficiency
    const batchSize = 10;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchResults = await this.analyzeBatch(newStatement, batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Analyze a batch of candidates
   */
  private async analyzeBatch(
    newStatement: string,
    candidates: Array<{ id: string; content: string; type: string }>
  ): Promise<UpdateCandidate[]> {
    const prompt = `Analyze how this new information relates to existing memories.

NEW STATEMENT: "${newStatement}"

EXISTING MEMORIES:
${candidates.map((c, i) => `[${i}] (${c.type}) ${c.content}`).join('\n\n')}

For each memory, determine the relationship:
- "update": The new statement provides updated/corrected information for the same topic
- "merge": The new statement can be combined with the existing memory
- "supersede": The new statement completely replaces the existing memory
- "contradict": The new statement conflicts with the existing memory
- "no_change": The new statement is unrelated or doesn't affect this memory

Return a JSON array with objects:
{
  "index": number,
  "classification": "update" | "merge" | "supersede" | "contradict" | "no_change",
  "confidence": number (0-1),
  "suggestedContent": string (only if classification is update/merge),
  "explanation": string (brief reason)
}

Only return valid JSON array.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const analyses: Array<{
        index: number;
        classification: UpdateClassification;
        confidence: number;
        suggestedContent?: string;
        explanation: string;
      }> = JSON.parse(content.text);

      return analyses.map((a) => ({
        noteId: candidates[a.index].id,
        content: candidates[a.index].content,
        classification: a.classification,
        confidence: a.confidence,
        suggestedContent: a.suggestedContent,
        explanation: a.explanation,
      }));
    } catch (error) {
      console.error('Batch analysis failed:', error);
      // Return no_change for all on failure
      return candidates.map((c) => ({
        noteId: c.id,
        content: c.content,
        classification: 'no_change' as UpdateClassification,
        confidence: 0,
        explanation: 'Analysis failed',
      }));
    }
  }

  /**
   * Apply an update to a memory
   */
  private async applyUpdate(
    userId: string,
    newStatement: string,
    candidate: UpdateCandidate
  ): Promise<{ noteId: string; action: UpdateClassification; edgeId?: string } | null> {
    switch (candidate.classification) {
      case 'update':
      case 'merge': {
        // Update the existing note content
        const { error } = await this.supabase
          .from('spring_memory_notes')
          .update({
            content: candidate.suggestedContent || candidate.content,
            updated_at: new Date().toISOString(),
          })
          .eq('id', candidate.noteId)
          .eq('user_id', userId);

        if (error) throw error;

        return {
          noteId: candidate.noteId,
          action: candidate.classification,
        };
      }

      case 'supersede': {
        // Create new note and mark old as superseded
        const { data: newNote, error: createError } = await this.supabase
          .from('spring_memory_notes')
          .insert({
            user_id: userId,
            content: newStatement,
            type: 'fact',
            status: 'active',
            scope: 'user',
            privacy_class: 'internal',
          })
          .select()
          .single();

        if (createError) throw createError;

        // Mark old note as superseded
        await this.supabase
          .from('spring_memory_notes')
          .update({ status: 'superseded' })
          .eq('id', candidate.noteId);

        // Create supersedes edge
        const { data: edge } = await this.supabase
          .from('spring_memory_edges')
          .insert({
            source_note_id: newNote.id,
            target_note_id: candidate.noteId,
            edge_type: 'supersedes',
            weight: candidate.confidence,
          })
          .select()
          .single();

        return {
          noteId: candidate.noteId,
          action: 'supersede',
          edgeId: edge?.id,
        };
      }

      case 'contradict': {
        // Create contradiction edge
        const { data: newNote, error: createError } = await this.supabase
          .from('spring_memory_notes')
          .insert({
            user_id: userId,
            content: newStatement,
            type: 'fact',
            status: 'active',
            scope: 'user',
            privacy_class: 'internal',
          })
          .select()
          .single();

        if (createError) throw createError;

        // Mark old note as contradicted
        await this.supabase
          .from('spring_memory_notes')
          .update({ status: 'contradicted' })
          .eq('id', candidate.noteId);

        // Create contradicts edge
        const { data: edge } = await this.supabase
          .from('spring_memory_edges')
          .insert({
            source_note_id: newNote.id,
            target_note_id: candidate.noteId,
            edge_type: 'contradicts',
            weight: candidate.confidence,
          })
          .select()
          .single();

        return {
          noteId: candidate.noteId,
          action: 'contradict',
          edgeId: edge?.id,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Batch update multiple memories
   */
  async batchUpdate(
    userId: string,
    updates: Array<{ noteId: string; content?: string; type?: string; tags?: string[] }>
  ): Promise<{ updated: number; failed: number; errors: string[] }> {
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const update of updates) {
      try {
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (update.content) updateData.content = update.content;
        if (update.type) updateData.type = update.type;
        if (update.tags) updateData.tags = update.tags;

        const { error } = await this.supabase
          .from('spring_memory_notes')
          .update(updateData)
          .eq('id', update.noteId)
          .eq('user_id', userId);

        if (error) {
          failed++;
          errors.push(`${update.noteId}: ${error.message}`);
        } else {
          updated++;
        }
      } catch (error) {
        failed++;
        errors.push(`${update.noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { updated, failed, errors };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSemanticUpdateService(supabase: SupabaseClient): SemanticUpdateService {
  return new SemanticUpdateService(supabase);
}
