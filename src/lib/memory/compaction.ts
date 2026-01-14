/**
 * Memory Compaction System (Phase 3)
 *
 * Reduces storage and improves search performance through:
 * - Clustering similar memories
 * - Generating cluster summaries
 * - Archiving old/low-importance memories
 *
 * Benefits:
 * - Memory growth is sub-linear (log scale)
 * - Warm index stays small and fast
 * - Cold storage preserves full history
 */

import { createServerClient } from '@/lib/supabase';
import { createEmbedding, createQueryEmbedding } from '@/lib/ai';
import Anthropic from '@anthropic-ai/sdk';

// Cluster interface
export interface MemoryCluster {
  id: string;
  userId: string;
  namespace: string;
  clusterName: string;
  clusterType: 'topic' | 'temporal' | 'semantic';
  summary: string;
  memberIds: string[];
  memberCount: number;
  importance: number;
  isArchived: boolean;
  createdAt: string;
}

// Compaction options
export interface CompactionOptions {
  minAgeDays?: number;
  maxImportance?: number;
  minClusterSize?: number;
  maxCandidates?: number;
  model?: 'haiku' | 'sonnet';
}

// Compaction result
export interface CompactionResult {
  clustersCreated: number;
  memoriesArchived: number;
  errors: string[];
}

/**
 * Get memories that are candidates for compaction
 */
export async function getCompactionCandidates(
  userId: string,
  namespace: string = 'default',
  options: CompactionOptions = {}
): Promise<
  Array<{
    id: string;
    content: string;
    memory_type: string;
    importance: number;
    created_at: string;
    embedding: number[];
  }>
> {
  const {
    minAgeDays = 30,
    maxImportance = 3,
    maxCandidates = 100,
  } = options;

  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_compaction_candidates', {
    p_user_id: userId,
    p_namespace: namespace,
    p_min_age_days: minAgeDays,
    p_max_importance: maxImportance,
    p_limit: maxCandidates,
  });

  if (error) {
    console.error('Get compaction candidates error:', error);
    return [];
  }

  return data || [];
}

/**
 * Cluster similar memories using embeddings
 */
export async function clusterMemories(
  memories: Array<{
    id: string;
    content: string;
    memory_type: string;
    embedding: number[];
  }>,
  similarityThreshold: number = 0.8
): Promise<string[][]> {
  if (memories.length === 0) return [];

  // Simple greedy clustering based on cosine similarity
  const clusters: string[][] = [];
  const assigned = new Set<string>();

  for (const memory of memories) {
    if (assigned.has(memory.id)) continue;

    const cluster = [memory.id];
    assigned.add(memory.id);

    // Find similar memories
    for (const other of memories) {
      if (assigned.has(other.id)) continue;

      const similarity = cosineSimilarity(memory.embedding, other.embedding);
      if (similarity >= similarityThreshold) {
        cluster.push(other.id);
        assigned.add(other.id);
      }
    }

    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate a summary for a cluster of memories
 */
export async function generateClusterSummary(
  memories: Array<{ content: string; memory_type: string; importance: number }>,
  model: 'haiku' | 'sonnet' = 'haiku'
): Promise<{ name: string; summary: string }> {
  if (memories.length === 0) {
    return { name: 'Empty Cluster', summary: '' };
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const memoriesText = memories
    .map(
      (m, i) =>
        `${i + 1}. [${m.memory_type}] (importance: ${m.importance}) ${m.content}`
    )
    .join('\n');

  const prompt = `Analyze these related memories and create:
1. A short cluster name (2-5 words)
2. A comprehensive summary (max 500 chars)

MEMORIES:
${memoriesText}

Respond in JSON:
{
  "name": "Cluster Name Here",
  "summary": "Comprehensive summary of all memories..."
}`;

  try {
    const response = await anthropic.messages.create({
      model: model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { name: 'Unnamed Cluster', summary: '' };
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { name: 'Unnamed Cluster', summary: content.text.slice(0, 500) };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      name: parsed.name || 'Unnamed Cluster',
      summary: parsed.summary || '',
    };
  } catch (error) {
    console.error('Cluster summary generation error:', error);
    return { name: 'Unnamed Cluster', summary: '' };
  }
}

/**
 * Create a cluster in the database
 */
export async function createCluster(
  userId: string,
  namespace: string,
  clusterName: string,
  clusterType: 'topic' | 'temporal' | 'semantic',
  summary: string,
  memberIds: string[],
  avgImportance: number
): Promise<MemoryCluster | null> {
  const supabase = createServerClient();

  // Generate embedding for summary
  let embedding: number[] | null = null;
  try {
    embedding = await createEmbedding(summary);
  } catch (error) {
    console.error('Cluster embedding error:', error);
  }

  const { data, error } = await supabase
    .from('memory_clusters')
    .insert({
      user_id: userId,
      namespace,
      cluster_name: clusterName,
      cluster_type: clusterType,
      summary,
      summary_embedding: embedding,
      member_ids: memberIds,
      member_count: memberIds.length,
      importance: avgImportance,
    })
    .select()
    .single();

  if (error) {
    console.error('Create cluster error:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    namespace: data.namespace,
    clusterName: data.cluster_name,
    clusterType: data.cluster_type,
    summary: data.summary,
    memberIds: data.member_ids,
    memberCount: data.member_count,
    importance: data.importance,
    isArchived: data.is_archived,
    createdAt: data.created_at,
  };
}

/**
 * Archive memories after clustering
 */
export async function archiveMemories(
  memoryIds: string[],
  clusterId: string
): Promise<number> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('archive_memories', {
    p_memory_ids: memoryIds,
    p_cluster_id: clusterId,
    p_archive_reason: 'compaction',
  });

  if (error) {
    console.error('Archive memories error:', error);
    return 0;
  }

  return data || 0;
}

/**
 * Run compaction for a user/namespace
 */
export async function runCompaction(
  userId: string,
  namespace: string = 'default',
  options: CompactionOptions = {}
): Promise<CompactionResult> {
  const result: CompactionResult = {
    clustersCreated: 0,
    memoriesArchived: 0,
    errors: [],
  };

  const { minClusterSize = 3, model = 'haiku' } = options;

  try {
    // 1. Get compaction candidates
    const candidates = await getCompactionCandidates(userId, namespace, options);
    if (candidates.length < minClusterSize) {
      return result;
    }

    // 2. Cluster memories
    const clusters = await clusterMemories(candidates);

    // 3. Process each cluster
    for (const memberIds of clusters) {
      if (memberIds.length < minClusterSize) {
        // Skip small clusters
        continue;
      }

      // Get memory contents
      const members = candidates.filter((c) => memberIds.includes(c.id));
      const avgImportance =
        members.reduce((sum, m) => sum + m.importance, 0) / members.length;

      // Generate summary
      const { name, summary } = await generateClusterSummary(
        members.map((m) => ({
          content: m.content,
          memory_type: m.memory_type,
          importance: m.importance,
        })),
        model
      );

      if (!summary) {
        result.errors.push(`Failed to generate summary for cluster: ${name}`);
        continue;
      }

      // Create cluster
      const cluster = await createCluster(
        userId,
        namespace,
        name,
        'semantic',
        summary,
        memberIds,
        avgImportance
      );

      if (!cluster) {
        result.errors.push(`Failed to create cluster: ${name}`);
        continue;
      }

      result.clustersCreated++;

      // Archive memories
      const archivedCount = await archiveMemories(memberIds, cluster.id);
      result.memoriesArchived += archivedCount;
    }

    return result;
  } catch (error) {
    console.error('Compaction error:', error);
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    return result;
  }
}

/**
 * Search clusters for relevant summaries
 */
export async function searchClusters(
  userId: string,
  query: string,
  namespace: string = 'default',
  limit: number = 5,
  threshold: number = 0.6
): Promise<
  Array<{
    id: string;
    clusterName: string;
    summary: string;
    memberCount: number;
    importance: number;
    similarity: number;
  }>
> {
  const supabase = createServerClient();

  // Generate query embedding
  const queryEmbedding = await createQueryEmbedding(query);

  const { data, error } = await supabase.rpc('search_clusters', {
    p_query_embedding: queryEmbedding,
    p_user_id: userId,
    p_namespace: namespace,
    p_match_count: limit,
    p_match_threshold: threshold,
  });

  if (error) {
    console.error('Search clusters error:', error);
    return [];
  }

  return (data || []).map(
    (c: {
      id: string;
      cluster_name: string;
      summary: string;
      member_count: number;
      importance: number;
      similarity: number;
    }) => ({
      id: c.id,
      clusterName: c.cluster_name,
      summary: c.summary,
      memberCount: c.member_count,
      importance: c.importance,
      similarity: c.similarity,
    })
  );
}

/**
 * Get cluster statistics for a user
 */
export async function getClusterStats(
  userId: string,
  namespace: string = 'default'
): Promise<{
  totalClusters: number;
  totalArchived: number;
  avgClusterSize: number;
}> {
  const supabase = createServerClient();

  const { data: clusters, error: clustersError } = await supabase
    .from('memory_clusters')
    .select('member_count')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .eq('is_archived', false);

  const { count: archivedCount, error: archivedError } = await supabase
    .from('memory_archive')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('namespace', namespace);

  if (clustersError || archivedError) {
    return { totalClusters: 0, totalArchived: 0, avgClusterSize: 0 };
  }

  const totalClusters = clusters?.length || 0;
  const avgClusterSize =
    totalClusters > 0
      ? clusters.reduce((sum, c) => sum + c.member_count, 0) / totalClusters
      : 0;

  return {
    totalClusters,
    totalArchived: archivedCount || 0,
    avgClusterSize: Math.round(avgClusterSize * 10) / 10,
  };
}
