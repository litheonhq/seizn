/**
 * Memory Deduplication
 *
 * Checks for near-duplicate memories before inserting.
 * Uses vector similarity to find existing memories with > 0.95 cosine similarity.
 */

import { createServerClient } from '@/lib/supabase';

export interface DuplicateResult {
  id: string;
  content: string;
  similarity: number;
}

/**
 * Find a near-duplicate memory for the given embedding.
 * Returns the closest match if similarity >= threshold, otherwise null.
 */
export async function findDuplicate(
  userId: string,
  embedding: number[],
  namespace: string = 'default',
  threshold: number = 0.95
): Promise<DuplicateResult | null> {
  const supabase = createServerClient();

  const { data } = await supabase.rpc('search_memories', {
    query_embedding: embedding,
    match_user_id: userId,
    match_count: 1,
    match_threshold: threshold,
    match_namespace: namespace === 'default' ? null : namespace,
  });

  if (data && data.length > 0 && data[0].similarity >= threshold) {
    return {
      id: data[0].id,
      content: data[0].content,
      similarity: data[0].similarity,
    };
  }

  return null;
}
