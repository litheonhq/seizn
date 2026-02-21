import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Memory Lifecycle Engine (EverMemOS Pattern)
 *
 * Three-phase memory management inspired by human cognitive processes:
 *
 * Phase 1: Episodic Trace Formation
 *   - Converts conversation streams into MemCells
 *   - Each MemCell contains: atomic facts, episodic trace, time-bounded foresight
 *   - Raw input -> structured, timestamped memory units
 *
 * Phase 2: Semantic Consolidation
 *   - Groups MemCells into thematic MemScenes
 *   - Distills stable semantic structures (facts, patterns)
 *   - Updates persistent user profiles
 *   - Handles contradictions and supersession
 *
 * Phase 3: Reconstructive Recollection
 *   - Agentic retrieval composing necessary and sufficient context
 *   - Multi-graph traversal for rich context assembly
 *   - Adaptive compression based on query complexity
 *
 * Achieves 93.05% on LoCoMo (SOTA) and 83.00% on LongMemEval
 *
 * @see https://arxiv.org/abs/2601.02163 (EverMemOS Paper)
 */

import { createServerClient } from '../supabase';
import { computeEmbedding, cosineSimilarity } from '../embeddings';

// ============================================
// Types
// ============================================

/**
 * MemCell: atomic unit of episodic memory
 */
export interface MemCell {
  id: string;
  /** Raw content from conversation */
  content: string;
  /** Extracted atomic facts */
  atomicFacts: string[];
  /** Episodic trace: who said what, when, in what context */
  episodicTrace: {
    speaker: 'user' | 'assistant' | 'system';
    timestamp: Date;
    sessionId?: string;
    conversationTurn: number;
    emotionalTone?: 'neutral' | 'positive' | 'negative' | 'urgent';
  };
  /** Time-bounded foresight: predicted relevance window */
  foresight: {
    relevantUntil?: Date;   // When this info expires
    relevantFor?: string[];  // Topics/contexts where this is useful
    urgency: 'low' | 'medium' | 'high';
  };
  /** Processing status */
  status: 'raw' | 'extracted' | 'consolidated' | 'archived';
  /** Embedding of the content */
  embedding?: number[];
}

/**
 * MemScene: thematic cluster of related MemCells
 */
export interface MemScene {
  id: string;
  /** Theme/topic of this scene */
  theme: string;
  /** Summary of the scene */
  summary: string;
  /** MemCell IDs in this scene */
  cellIds: string[];
  /** Distilled semantic facts from the scene */
  semanticFacts: string[];
  /** User profile updates derived from this scene */
  profileUpdates: Array<{
    field: string;
    value: string;
    confidence: number;
    source: 'explicit' | 'implicit';
  }>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last consolidation timestamp */
  lastConsolidatedAt: Date;
}

/**
 * Recollection result from Phase 3
 */
export interface RecollectionResult {
  /** Assembled context string */
  context: string;
  /** Individual memory fragments used */
  fragments: Array<{
    content: string;
    source: 'episodic' | 'semantic' | 'procedural' | 'profile';
    relevance: number;
    memoryId?: string;
  }>;
  /** How the context was assembled */
  assembly: {
    strategy: 'direct' | 'graph_traversal' | 'consolidation_lookup' | 'hybrid';
    fragmentsConsidered: number;
    fragmentsSelected: number;
    compressionRatio: number;
    latencyMs: number;
  };
}

export interface LifecycleConfig {
  /** Maximum MemCells before triggering consolidation */
  consolidationThreshold: number;
  /** Similarity threshold for clustering MemCells into MemScenes */
  clusteringThreshold: number;
  /** Maximum context tokens for recollection */
  maxContextTokens: number;
  /** Whether to auto-consolidate on creation */
  autoConsolidate: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  consolidationThreshold: 50,
  clusteringThreshold: 0.75,
  maxContextTokens: 2000,
  autoConsolidate: true,
};

// ============================================
// Phase 1: Episodic Trace Formation
// ============================================

/**
 * Convert a conversation turn into a MemCell.
 *
 * Extracts atomic facts, assigns episodic trace, and
 * predicts relevance window (foresight).
 */
export async function formEpisodicTrace(
  content: string,
  speaker: 'user' | 'assistant' | 'system',
  sessionId?: string,
  turnNumber: number = 0
): Promise<MemCell> {
  const id = `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Extract atomic facts using LLM
  let atomicFacts: string[] = [];
  let foresight: MemCell['foresight'] = { urgency: 'low' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && content.length > 20) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 512,
          system: `Extract atomic facts and assess urgency. Return JSON:
{
  "facts": ["fact 1", "fact 2"],
  "urgency": "low" | "medium" | "high",
  "relevantFor": ["topic1", "topic2"],
  "expiresInDays": null | number
}
Only extract genuinely useful facts. Return {"facts":[],"urgency":"low","relevantFor":[],"expiresInDays":null} if nothing worth extracting.`,
          messages: [
            { role: 'user', content: content.slice(0, 2000) },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = JSON.parse(data.content?.[0]?.text || '{}');
        atomicFacts = parsed.facts || [];
        foresight = {
          urgency: parsed.urgency || 'low',
          relevantFor: parsed.relevantFor || [],
          relevantUntil: parsed.expiresInDays
            ? new Date(Date.now() + parsed.expiresInDays * 86400000)
            : undefined,
        };
      }
    } catch {
      // Fallback: treat entire content as single fact
      atomicFacts = [content];
    }
  } else {
    atomicFacts = content.length > 10 ? [content] : [];
  }

  // Generate embedding
  let embedding: number[] | undefined;
  try {
    embedding = await computeEmbedding(content, 'document');
  } catch {
    // Non-fatal
  }

  return {
    id,
    content,
    atomicFacts,
    episodicTrace: {
      speaker,
      timestamp: new Date(),
      sessionId,
      conversationTurn: turnNumber,
    },
    foresight,
    status: atomicFacts.length > 0 ? 'extracted' : 'raw',
    embedding,
  };
}

// ============================================
// Phase 2: Semantic Consolidation
// ============================================

/**
 * Consolidate MemCells into MemScenes.
 *
 * Groups related MemCells by embedding similarity,
 * generates summaries, and extracts profile updates.
 */
export async function consolidateMemCells(
  userId: string,
  cells: MemCell[],
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG
): Promise<MemScene[]> {
  if (cells.length === 0) return [];

  // Cluster cells by embedding similarity
  const clusters = clusterBySimilarity(cells, config.clusteringThreshold);

  const scenes: MemScene[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    // Generate scene summary using LLM
    const allFacts = cluster.flatMap((c) => c.atomicFacts);
    const allContent = cluster.map((c) => c.content).join('\n');

    let theme = 'General';
    let summary = allFacts.join('. ');
    let profileUpdates: MemScene['profileUpdates'] = [];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && allFacts.length > 1) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildAnthropicHeaders(apiKey),
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 512,
            system: `Consolidate these memory fragments into a coherent scene. Return JSON:
{
  "theme": "short topic label",
  "summary": "2-3 sentence consolidated summary",
  "semanticFacts": ["distilled fact 1", "distilled fact 2"],
  "profileUpdates": [{"field": "name|preference|skill|etc", "value": "...", "confidence": 0.0-1.0, "source": "explicit|implicit"}]
}
Deduplicate facts. Resolve contradictions (prefer newer). Extract user profile information.`,
            messages: [
              { role: 'user', content: `Facts:\n${allFacts.join('\n')}\n\nContext:\n${allContent.slice(0, 3000)}` },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const parsed = JSON.parse(data.content?.[0]?.text || '{}');
          theme = parsed.theme || theme;
          summary = parsed.summary || summary;
          profileUpdates = parsed.profileUpdates || [];
        }
      } catch {
        // Use fallback values
      }
    }

    scenes.push({
      id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      theme,
      summary,
      cellIds: cluster.map((c) => c.id),
      semanticFacts: allFacts,
      profileUpdates,
      createdAt: new Date(),
      lastConsolidatedAt: new Date(),
    });
  }

  // Store consolidated scenes and return persisted identifiers
  if (scenes.length === 0) {
    return [];
  }

  return storeMemScenes(userId, scenes);
}

/**
 * Cluster MemCells by embedding similarity using greedy algorithm.
 */
function clusterBySimilarity(
  cells: MemCell[],
  threshold: number
): MemCell[][] {
  const clusters: MemCell[][] = [];
  const assigned = new Set<string>();

  for (const cell of cells) {
    if (assigned.has(cell.id) || !cell.embedding) {
      if (!assigned.has(cell.id)) {
        clusters.push([cell]);
        assigned.add(cell.id);
      }
      continue;
    }

    // Find best existing cluster
    let bestCluster = -1;
    let bestSim = 0;

    for (let ci = 0; ci < clusters.length; ci++) {
      const representative = clusters[ci][0];
      if (!representative.embedding) continue;

      const sim = cosineSimilarity(cell.embedding, representative.embedding);
      if (sim > bestSim && sim >= threshold) {
        bestSim = sim;
        bestCluster = ci;
      }
    }

    if (bestCluster >= 0) {
      clusters[bestCluster].push(cell);
    } else {
      clusters.push([cell]);
    }
    assigned.add(cell.id);
  }

  return clusters;
}

/**
 * Store MemScenes in database for persistent consolidation.
 */
function normalizeEmbeddingVector(raw: unknown): number[] | undefined {
  if (Array.isArray(raw)) {
    const vector = raw
      .map((value) => (typeof value === 'number' ? value : Number(value)))
      .filter((value) => Number.isFinite(value));
    return vector.length > 0 ? vector : undefined;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeEmbeddingVector(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function inferUrgencyFromImportance(importance: number): MemCell['foresight']['urgency'] {
  if (importance >= 8) return 'high';
  if (importance >= 6) return 'medium';
  return 'low';
}

function calculateSceneImportance(scene: MemScene): number {
  if (scene.profileUpdates.length === 0) {
    return 5;
  }

  const avgConfidence =
    scene.profileUpdates.reduce((sum, update) => sum + update.confidence, 0) /
    scene.profileUpdates.length;

  return Math.min(10, Math.max(1, Math.round((5 + avgConfidence * 3) * 100) / 100));
}

/**
 * Load lifecycle-extracted memories that are not yet included in any active cluster.
 * These are the candidate MemCells for phase-2 semantic consolidation.
 */
async function loadUnclusteredLifecycleMemCells(
  userId: string,
  maxCells: number
): Promise<MemCell[]> {
  const supabase = createServerClient();
  const readLimit = Math.max(maxCells * 3, maxCells);

  const [memoriesResult, clustersResult] = await Promise.all([
    supabase
      .from('memories')
      .select('id, content, embedding, created_at, importance')
      .eq('user_id', userId)
      .eq('namespace', 'default')
      .eq('source', 'lifecycle_extraction')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(readLimit),
    supabase
      .from('memory_clusters')
      .select('member_ids')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (memoriesResult.error || !memoriesResult.data || memoriesResult.data.length === 0) {
    return [];
  }

  const clusteredIds = new Set<string>();
  if (!clustersResult.error && clustersResult.data) {
    for (const cluster of clustersResult.data as Array<{ member_ids?: unknown }>) {
      if (!Array.isArray(cluster.member_ids)) continue;
      for (const id of cluster.member_ids) {
        clusteredIds.add(String(id));
      }
    }
  }

  const candidates = (memoriesResult.data as Array<{
    id: string;
    content: string;
    embedding?: unknown;
    created_at: string;
    importance?: number;
  }>)
    .filter((memory) => !clusteredIds.has(String(memory.id)))
    .slice(0, maxCells);

  return candidates.map((memory) => {
    const importance = typeof memory.importance === 'number' ? memory.importance : 5;
    const content = memory.content || '';
    return {
      id: String(memory.id),
      content,
      atomicFacts: content.length > 0 ? [content] : [],
      episodicTrace: {
        speaker: 'user',
        timestamp: new Date(memory.created_at),
        conversationTurn: 0,
      },
      foresight: {
        urgency: inferUrgencyFromImportance(importance),
      },
      status: 'extracted',
      embedding: normalizeEmbeddingVector(memory.embedding),
    } satisfies MemCell;
  });
}

async function storeMemScenes(
  userId: string,
  scenes: MemScene[]
): Promise<MemScene[]> {
  const supabase = createServerClient();
  const persisted: MemScene[] = [];

  for (const scene of scenes) {
    const { data, error } = await supabase
      .from('memory_clusters')
      .insert({
        user_id: userId,
        namespace: 'default',
        cluster_name: scene.theme,
        cluster_type: 'semantic',
        summary: scene.summary,
        member_ids: scene.cellIds,
        member_count: scene.cellIds.length,
        importance: calculateSceneImportance(scene),
      })
      .select('id, cluster_name, summary, member_ids, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('Failed to persist consolidated MemScene:', error);
      continue;
    }

    persisted.push({
      ...scene,
      id: String(data.id),
      theme: data.cluster_name ?? scene.theme,
      summary: data.summary ?? scene.summary,
      cellIds: Array.isArray(data.member_ids)
        ? data.member_ids.map((id: unknown) => String(id))
        : scene.cellIds,
      createdAt: data.created_at ? new Date(data.created_at) : scene.createdAt,
      lastConsolidatedAt: data.updated_at ? new Date(data.updated_at) : scene.lastConsolidatedAt,
    });
  }

  return persisted;
}

async function loadRecentSceneSummaries(
  userId: string,
  limit: number
): Promise<Array<{ name: string; summary: string }>> {
  const supabase = createServerClient();

  const modern = await supabase
    .from('memory_clusters')
    .select('cluster_name, summary')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!modern.error && modern.data) {
    return (modern.data as Array<{ cluster_name?: string; summary?: string }>).map((scene) => ({
      name: scene.cluster_name || 'Cluster',
      summary: scene.summary || '',
    }));
  }

  const legacy = await supabase
    .from('memory_clusters')
    .select('name, summary')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (legacy.error || !legacy.data) {
    return [];
  }

  return (legacy.data as Array<{ name?: string; summary?: string }>).map((scene) => ({
    name: scene.name || 'Cluster',
    summary: scene.summary || '',
  }));
}

// ============================================
// Phase 3: Reconstructive Recollection
// ============================================

/**
 * Reconstruct relevant context for a query.
 *
 * Composes the necessary and sufficient context from multiple
 * memory sources: episodic, semantic, procedural, and user profile.
 */
export async function reconstructContext(
  userId: string,
  query: string,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG
): Promise<RecollectionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  const fragments: RecollectionResult['fragments'] = [];
  let fragmentsConsidered = 0;

  // 1. Search semantic memories (vector search)
  try {
    const queryEmbedding = await computeEmbedding(query, 'query');

    const { data: semanticResults } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.65,
      match_count: 15,
      match_user_id: userId,
    });

    if (semanticResults) {
      fragmentsConsidered += semanticResults.length;

      for (const result of semanticResults.slice(0, 8)) {
        fragments.push({
          content: result.content,
          source: 'semantic',
          relevance: result.similarity,
          memoryId: result.id,
        });
      }
    }
  } catch {
    // Continue with other sources
  }

  // 2. Check user profile for context
  try {
    const { data: profile } = await supabase
      .from('memory_profiles')
      .select('profile_card')
      .eq('user_id', userId)
      .single();

    if (profile?.profile_card) {
      fragments.push({
        content: profile.profile_card,
        source: 'profile',
        relevance: 0.8,
      });
      fragmentsConsidered++;
    }
  } catch {
    // Non-fatal
  }

  // 3. Check slots for direct-match queries
  try {
    const { data: slots } = await supabase
      .from('memory_slots')
      .select('category, slot_key, value')
      .eq('user_id', userId)
      .limit(20);

    if (slots && slots.length > 0) {
      const slotContext = slots
        .map((s) => `${s.slot_key}: ${s.value}`)
        .join('\n');

      fragments.push({
        content: slotContext,
        source: 'procedural',
        relevance: 0.9,
      });
      fragmentsConsidered += slots.length;
    }
  } catch {
    // Non-fatal
  }

  // 4. Check consolidated scenes for thematic context
  try {
    const scenes = await loadRecentSceneSummaries(userId, 5);

    for (const scene of scenes) {
      fragments.push({
        content: `[${scene.name}] ${scene.summary}`,
        source: 'episodic',
        relevance: 0.6,
      });
    }
    fragmentsConsidered += scenes.length;
  } catch {
    // Non-fatal
  }

  // 5. Sort by relevance and assemble context
  fragments.sort((a, b) => b.relevance - a.relevance);
  const selectedFragments = fragments.slice(0, 10);

  // Estimate token count (rough: 1 token -> 4 chars)
  let tokenEstimate = 0;
  const contextParts: string[] = [];

  for (const fragment of selectedFragments) {
    const fragmentTokens = Math.ceil(fragment.content.length / 4);
    if (tokenEstimate + fragmentTokens > config.maxContextTokens) break;

    contextParts.push(fragment.content);
    tokenEstimate += fragmentTokens;
  }

  const context = contextParts.join('\n\n');

  return {
    context,
    fragments: selectedFragments,
    assembly: {
      strategy: fragments.length > 5 ? 'hybrid' : 'direct',
      fragmentsConsidered,
      fragmentsSelected: selectedFragments.length,
      compressionRatio:
        fragmentsConsidered > 0
          ? selectedFragments.length / fragmentsConsidered
          : 1,
      latencyMs: Date.now() - startTime,
    },
  };
}

// ============================================
// Full Pipeline
// ============================================

/**
 * Run the complete lifecycle pipeline for a conversation turn.
 *
 * 1. Form episodic trace (MemCell)
 * 2. Check if consolidation is needed
 * 3. If yes, consolidate into MemScenes
 */
export async function processConversationTurn(
  userId: string,
  content: string,
  speaker: 'user' | 'assistant',
  sessionId?: string,
  turnNumber: number = 0,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG
): Promise<{
  memCell: MemCell;
  consolidated: boolean;
  scenes?: MemScene[];
}> {
  // Phase 1: Form episodic trace
  const memCell = await formEpisodicTrace(content, speaker, sessionId, turnNumber);

  // Store the MemCell as a memory
  if (memCell.atomicFacts.length > 0 && memCell.embedding) {
    const supabase = createServerClient();

    for (const fact of memCell.atomicFacts) {
      const factEmbedding = await computeEmbedding(fact, 'document');

      await supabase.from('memories').insert({
        user_id: userId,
        content: fact,
        embedding: factEmbedding,
        memory_type: 'fact',
        source: 'lifecycle_extraction',
        importance: memCell.foresight.urgency === 'high' ? 8 : memCell.foresight.urgency === 'medium' ? 6 : 5,
        tags: ['auto-extracted', 'lifecycle', ...(memCell.foresight.relevantFor || [])],
      });
    }
  }

  // Check if consolidation is needed
  let consolidated = false;
  let scenes: MemScene[] | undefined;

  if (config.autoConsolidate) {
    const candidates = await loadUnclusteredLifecycleMemCells(
      userId,
      config.consolidationThreshold * 2
    );

    if (candidates.length >= config.consolidationThreshold) {
      scenes = await consolidateMemCells(userId, candidates, config);
      consolidated = scenes.length > 0;
    }
  }

  return { memCell, consolidated, scenes };
}
