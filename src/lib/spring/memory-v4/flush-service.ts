/**
 * Memory Flush Service
 *
 * Shared flush pipeline used by:
 * - POST /api/memories/flush (sync mode)
 * - spring_jobs "consolidate" worker (async mode)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createIngestionService } from '@/lib/spring/memory-v4/ingestion-service';
import { createLinkGeneratorService } from '@/lib/spring/memory-v4/link-generator';
import { updateProfile } from '@/lib/memory/profile';

export interface FlushOptions {
  /** Process candidates (promote to active) */
  processCandidates?: boolean;
  /** Generate missing embeddings */
  generateEmbeddings?: boolean;
  /** Generate links between memories */
  generateLinks?: boolean;
  /** Update user profile */
  updateProfile?: boolean;
  /** Maximum items to process per category */
  maxItems?: number;
}

export interface FlushResult {
  success: boolean;
  processed: {
    candidates: { promoted: number; denied: number; errors: number };
    embeddings: { generated: number; errors: number };
    links: { created: number; errors: number };
    profile: { updated: boolean };
  };
  errors: string[];
  processingMs: number;
}

export async function runMemoryFlush(
  supabase: SupabaseClient,
  userId: string,
  options: FlushOptions = {}
): Promise<FlushResult> {
  const {
    processCandidates = true,
    generateEmbeddings = true,
    generateLinks = true,
    updateProfile: shouldUpdateProfile = true,
    maxItems = 50,
  } = options;

  const startTime = Date.now();
  const errors: string[] = [];

  const result: FlushResult = {
    success: true,
    processed: {
      candidates: { promoted: 0, denied: 0, errors: 0 },
      embeddings: { generated: 0, errors: 0 },
      links: { created: 0, errors: 0 },
      profile: { updated: false },
    },
    errors: [],
    processingMs: 0,
  };

  // 1) Process candidates
  if (processCandidates) {
    try {
      const ingestionService = createIngestionService(supabase);
      const { data: candidates } = await supabase
        .from('spring_memory_notes')
        .select('id, content, note_type, tags')
        .eq('user_id', userId)
        .eq('status', 'candidate')
        .order('created_at', { ascending: true })
        .limit(maxItems);

      if (candidates && candidates.length > 0) {
        for (const candidate of candidates) {
          try {
            const evaluation = await ingestionService.evaluateIngestion(
              userId,
              candidate.content,
              {
                noteType: candidate.note_type,
                categories: candidate.tags,
              }
            );

            if (evaluation.action === 'deny') {
              await supabase
                .from('spring_memory_notes')
                .update({ status: 'denied', updated_at: new Date().toISOString() })
                .eq('id', candidate.id);
              result.processed.candidates.denied++;
            } else {
              await supabase
                .from('spring_memory_notes')
                .update({
                  status: 'active',
                  confidence: evaluation.confidence,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', candidate.id);
              result.processed.candidates.promoted++;
            }
          } catch (error) {
            result.processed.candidates.errors++;
            errors.push(
              `Candidate ${candidate.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }
    } catch (error) {
      errors.push(
        `Candidates processing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // 2) Generate embeddings
  if (generateEmbeddings) {
    try {
      const { data: withoutEmbeddings } = await supabase
        .from('spring_memory_notes')
        .select('id, content')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('embedding', null)
        .limit(maxItems);

      if (withoutEmbeddings && withoutEmbeddings.length > 0) {
        const { createEmbedding } = await import('@/lib/ai');

        for (const note of withoutEmbeddings) {
          try {
            const embedding = await createEmbedding(note.content);

            await supabase
              .from('spring_memory_notes')
              .update({
                embedding,
                updated_at: new Date().toISOString(),
              })
              .eq('id', note.id);

            result.processed.embeddings.generated++;
          } catch (error) {
            result.processed.embeddings.errors++;
            errors.push(
              `Embedding ${note.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }
    } catch (error) {
      errors.push(
        `Embeddings generation: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // 3) Generate links
  if (generateLinks) {
    try {
      const linkGenerator = createLinkGeneratorService(supabase);
      const { data: recentMemories } = await supabase
        .from('spring_memory_notes')
        .select('id, content')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(maxItems);

      if (recentMemories && recentMemories.length > 0) {
        for (const memory of recentMemories) {
          try {
            const { count } = await supabase
              .from('spring_memory_edges')
              .select('*', { count: 'exact', head: true })
              .or(`src_memory_id.eq.${memory.id},dst_memory_id.eq.${memory.id}`);

            if (!count || count === 0) {
              const linkResult = await linkGenerator.generateLinks(memory.id, memory.content, userId);
              result.processed.links.created += linkResult.linksCreated;
            }
          } catch (error) {
            result.processed.links.errors++;
            errors.push(`Links ${memory.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    } catch (error) {
      errors.push(`Links generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 4) Update profile
  if (shouldUpdateProfile) {
    try {
      const profile = await updateProfile(userId);
      result.processed.profile.updated = !!profile;
    } catch (error) {
      errors.push(`Profile update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  result.processingMs = Date.now() - startTime;
  result.errors = errors;
  result.success = errors.length === 0;

  return result;
}
