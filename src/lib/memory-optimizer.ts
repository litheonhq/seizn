// AI-powered Memory Optimization System
// Runs silently in the background to improve memory quality

import { createServerClient } from './supabase';

interface Memory {
  id: string;
  user_id: string;
  content: string;
  embedding: number[];
  memory_type: string;
  importance: number;
  access_count: number;
  last_accessed_at: string;
  created_at: string;
}

interface SimilarMemoryPair {
  memory1: Memory;
  memory2: Memory;
  similarity: number;
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Find similar memory pairs for a user
export async function findSimilarMemories(
  userId: string,
  threshold: number = 0.85
): Promise<SimilarMemoryPair[]> {
  const supabase = createServerClient();

  // Get all active memories for user
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, user_id, content, embedding, memory_type, importance, access_count, last_accessed_at, created_at')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(500); // Limit for performance

  if (error || !memories) {
    console.error('Error fetching memories:', error);
    return [];
  }

  const similarPairs: SimilarMemoryPair[] = [];

  // Compare each pair of memories
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const similarity = cosineSimilarity(
        memories[i].embedding,
        memories[j].embedding
      );

      if (similarity >= threshold) {
        similarPairs.push({
          memory1: memories[i],
          memory2: memories[j],
          similarity,
        });
      }
    }
  }

  // Sort by similarity (highest first)
  return similarPairs.sort((a, b) => b.similarity - a.similarity);
}

// Merge similar memories using LLM
export async function mergeMemories(
  memory1: Memory,
  memory2: Memory
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      system: `You are a memory consolidation assistant. Merge two similar memories into one concise, comprehensive memory.
- Keep the most important information from both
- Use third person ("The user...")
- Be concise (1-2 sentences max)
- Output ONLY the merged memory text, nothing else`,
      messages: [
        {
          role: 'user',
          content: `Merge these two memories:\n\nMemory 1: ${memory1.content}\n\nMemory 2: ${memory2.content}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

// Execute memory merge in database
export async function executeMerge(
  userId: string,
  memory1Id: string,
  memory2Id: string,
  mergedContent: string,
  newEmbedding: number[]
): Promise<boolean> {
  const supabase = createServerClient();

  // Start transaction-like operation
  // 1. Update memory1 with merged content
  const { error: updateError } = await supabase
    .from('memories')
    .update({
      content: mergedContent,
      embedding: newEmbedding,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memory1Id)
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error updating memory:', updateError);
    return false;
  }

  // 2. Soft delete memory2
  const { error: deleteError } = await supabase
    .from('memories')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      merged_into: memory1Id, // Track merge history
    })
    .eq('id', memory2Id)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Error deleting merged memory:', deleteError);
    return false;
  }

  return true;
}

// Calculate importance score based on access patterns
export function calculateImportanceScore(memory: Memory): number {
  const now = new Date();
  const createdAt = new Date(memory.created_at);
  const lastAccessed = memory.last_accessed_at
    ? new Date(memory.last_accessed_at)
    : createdAt;

  // Factors:
  // 1. Access frequency (access_count)
  // 2. Recency of last access
  // 3. Age of memory

  const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

  // Base importance from access count (log scale)
  const accessScore = Math.log10(Math.max(1, memory.access_count || 1)) * 2;

  // Recency bonus (decays over time)
  const recencyScore = Math.max(0, 3 - (daysSinceAccess / 30)); // Max 3 points, decays over 90 days

  // Age penalty for never-accessed old memories
  const agePenalty = (memory.access_count || 0) === 0 && daysSinceCreation > 30
    ? Math.min(2, daysSinceCreation / 60)
    : 0;

  // Combine scores (base importance + calculated adjustments)
  const calculatedImportance = memory.importance + accessScore + recencyScore - agePenalty;

  // Clamp to valid range [1, 10]
  return Math.max(1, Math.min(10, Math.round(calculatedImportance)));
}

// Plan-based decay days configuration
// Free: 60 days, Plus: 120 days, Pro/Enterprise: configurable
const PLAN_DECAY_DAYS: Record<string, number> = {
  free: 60,
  plus: 120,
  pro: 180,
  enterprise: 365,
};

// Get user's decay settings
async function getUserDecaySettings(userId: string): Promise<{
  decayEnabled: boolean;
  decayDays: number | null;
}> {
  const supabase = createServerClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan, memory_decay_enabled, memory_decay_days')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { decayEnabled: true, decayDays: 60 }; // Default to free plan
  }

  const plan = profile.plan || 'free';

  // Pro/Enterprise can disable decay
  if (['pro', 'enterprise'].includes(plan) && profile.memory_decay_enabled === false) {
    return { decayEnabled: false, decayDays: null };
  }

  // Custom days for Pro+ (if set)
  if (['pro', 'enterprise'].includes(plan) && profile.memory_decay_days) {
    return { decayEnabled: true, decayDays: profile.memory_decay_days };
  }

  // Plan default
  return { decayEnabled: true, decayDays: PLAN_DECAY_DAYS[plan] || 60 };
}

// Apply decay to unused memories (forgetting curve)
export async function applyMemoryDecay(userId: string): Promise<number> {
  const supabase = createServerClient();

  // Get user's decay settings
  const { decayEnabled, decayDays } = await getUserDecaySettings(userId);

  // If decay is disabled (Pro+ option), skip
  if (!decayEnabled || decayDays === null) {
    return 0;
  }

  // Calculate cutoff date based on plan
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - decayDays);

  const { data: staleMemories, error: fetchError } = await supabase
    .from('memories')
    .select('id, importance, access_count, last_accessed_at, created_at')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .lt('last_accessed_at', cutoffDate.toISOString())
    .gt('importance', 1); // Don't decay already-low importance

  if (fetchError || !staleMemories) {
    console.error('Error fetching stale memories:', fetchError);
    return 0;
  }

  let decayedCount = 0;

  for (const memory of staleMemories) {
    const newImportance = Math.max(1, memory.importance - 1);

    if (newImportance !== memory.importance) {
      const { error: updateError } = await supabase
        .from('memories')
        .update({ importance: newImportance })
        .eq('id', memory.id);

      if (!updateError) {
        decayedCount++;
      }
    }
  }

  return decayedCount;
}

// Update importance scores based on access patterns
export async function updateImportanceScores(userId: string): Promise<number> {
  const supabase = createServerClient();

  const { data: memories, error: fetchError } = await supabase
    .from('memories')
    .select('id, importance, access_count, last_accessed_at, created_at')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (fetchError || !memories) {
    console.error('Error fetching memories:', fetchError);
    return 0;
  }

  let updatedCount = 0;

  for (const memory of memories) {
    const newImportance = calculateImportanceScore(memory as Memory);

    if (newImportance !== memory.importance) {
      const { error: updateError } = await supabase
        .from('memories')
        .update({ importance: newImportance })
        .eq('id', memory.id);

      if (!updateError) {
        updatedCount++;
      }
    }
  }

  return updatedCount;
}

// Track memory access (call this when memory is retrieved)
export async function trackMemoryAccess(memoryId: string): Promise<void> {
  const supabase = createServerClient();

  await supabase.rpc('increment_memory_access', { memory_id: memoryId });
}

// Main optimization function - runs all optimizations for a user
export async function optimizeUserMemories(userId: string): Promise<{
  similarPairsFound: number;
  importanceUpdated: number;
  decayed: number;
}> {
  // 1. Find similar memories (for potential merge suggestions)
  const similarPairs = await findSimilarMemories(userId, 0.9);

  // 2. Update importance scores
  const importanceUpdated = await updateImportanceScores(userId);

  // 3. Apply decay to stale memories
  const decayed = await applyMemoryDecay(userId);

  return {
    similarPairsFound: similarPairs.length,
    importanceUpdated,
    decayed,
  };
}
