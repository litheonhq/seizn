/**
 * Graph Retriever
 *
 * Combines vector search with graph traversal for enhanced retrieval.
 * Supports:
 * - Vector + Graph hybrid search
 * - Multi-hop query processing
 * - Path scoring and ranking
 */

import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding } from '@/lib/ai';
import {
  findSimilarEntities,
  traverseGraph,
  getEntityRelations,
} from '../store/graph-store';
import type {
  Entity,
  Relation,
  GraphPath,
  GraphRetrievalOptions,
  GraphRetrievalResult,
  GraphStoreConfig,
  RelationType,
} from '../types';

// ============================================
// Types
// ============================================

interface ChunkResult {
  id: string;
  content: string;
  score: number;
  vectorScore: number;
  graphScore: number;
  metadata: Record<string, unknown>;
}

interface VectorSearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

// ============================================
// Vector Search
// ============================================

async function vectorSearch(
  userId: string,
  collectionId: string,
  queryEmbedding: number[],
  topK: number,
  threshold: number = 0.5
): Promise<VectorSearchResult[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: topK,
    p_user_id: userId,
    p_collection_id: collectionId,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    content: row.content as string,
    similarity: row.similarity as number,
    metadata: (row.metadata || {}) as Record<string, unknown>,
  }));
}

// ============================================
// Entity-aware Search
// ============================================

/**
 * Extract entity mentions from query
 */
async function findQueryEntities(
  config: GraphStoreConfig,
  query: string
): Promise<Entity[]> {
  // Create query embedding
  const queryEmbedding = await createQueryEmbedding(query);

  // Find entities similar to query
  const entities = await findSimilarEntities(config, {
    embedding: queryEmbedding,
    limit: 10,
    minSimilarity: 0.6,
  });

  return entities;
}

/**
 * Calculate graph connectivity score for a chunk
 * based on how many related entities it contains
 */
async function calculateGraphScore(
  config: GraphStoreConfig,
  chunkId: string,
  queryEntities: Entity[],
  paths: GraphPath[]
): Promise<number> {
  if (queryEntities.length === 0) return 0;

  let score = 0;
  const pathEntityIds = new Set<string>();

  // Collect all entity IDs from paths
  for (const path of paths) {
    for (const node of path.nodes) {
      pathEntityIds.add(node.id);
    }
  }

  // Check how many path entities are in this chunk
  const supabase = createServerClient();
  const { data } = await supabase
    .from('graph_entities')
    .select('id')
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId)
    .contains('source_chunks', [chunkId]);

  const chunkEntityIds = new Set((data || []).map(e => e.id));

  // Score based on overlap
  for (const entityId of pathEntityIds) {
    if (chunkEntityIds.has(entityId)) {
      score += 0.2; // Boost for each matching entity
    }
  }

  // Score based on query entity presence
  for (const entity of queryEntities) {
    if (chunkEntityIds.has(entity.id)) {
      score += 0.3; // Higher boost for query-mentioned entities
    }
  }

  return Math.min(1, score);
}

// ============================================
// Hybrid Retrieval
// ============================================

/**
 * Perform hybrid vector + graph retrieval
 */
export async function retrieve(
  config: GraphStoreConfig,
  query: string,
  options: GraphRetrievalOptions = {}
): Promise<GraphRetrievalResult> {
  const startTime = Date.now();

  const {
    maxDepth = 2,
    direction = 'both',
    relationTypes,
    vectorWeight = 0.5,
    graphWeight = 0.5,
    vectorTopK = 20,
    topK = 10,
    includeEntityContext = true,
  } = options;

  // Normalize weights
  const totalWeight = vectorWeight + graphWeight;
  const normVectorWeight = vectorWeight / totalWeight;
  const normGraphWeight = graphWeight / totalWeight;

  // 1. Create query embedding
  const queryEmbedding = await createQueryEmbedding(query);

  // 2. Find entities mentioned in query
  const queryEntities = await findQueryEntities(config, query);

  // 3. Traverse graph from query entities
  let paths: GraphPath[] = [];
  let allEntities: Entity[] = [...queryEntities];
  let allRelations: Relation[] = [];

  if (queryEntities.length > 0 && normGraphWeight > 0) {
    const startEntityIds = queryEntities.map(e => e.id);
    paths = await traverseGraph(config, startEntityIds, {
      maxDepth,
      direction,
      relationTypes,
      maxNodes: 50,
    });

    // Collect unique entities and relations from paths
    const entityMap = new Map<string, Entity>();
    const relationMap = new Map<string, Relation>();

    for (const path of paths) {
      for (const node of path.nodes) {
        entityMap.set(node.id, node);
      }
      for (const edge of path.edges) {
        relationMap.set(edge.id, edge);
      }
    }

    allEntities = Array.from(entityMap.values());
    allRelations = Array.from(relationMap.values());
  }

  // 4. Vector search
  const vectorResults = await vectorSearch(
    config.userId,
    config.collectionId,
    queryEmbedding,
    vectorTopK
  );

  // 5. Score and combine results
  const chunks: ChunkResult[] = [];

  for (const result of vectorResults) {
    const vectorScore = result.similarity;
    const graphScore = normGraphWeight > 0
      ? await calculateGraphScore(config, result.id, queryEntities, paths)
      : 0;

    const combinedScore = (normVectorWeight * vectorScore) + (normGraphWeight * graphScore);

    chunks.push({
      id: result.id,
      content: result.content,
      score: combinedScore,
      vectorScore,
      graphScore,
      metadata: result.metadata,
    });
  }

  // 6. Sort by combined score and take top K
  chunks.sort((a, b) => b.score - a.score);
  const topChunks = chunks.slice(0, topK);

  // 7. Optionally enrich with entity context
  if (includeEntityContext && topChunks.length > 0) {
    const chunkIds = topChunks.map(c => c.id);

    // Get entities present in top chunks
    const supabase = createServerClient();
    const { data: chunkEntities } = await supabase
      .from('graph_entities')
      .select()
      .eq('user_id', config.userId)
      .eq('collection_id', config.collectionId)
      .overlaps('source_chunks', chunkIds);

    if (chunkEntities) {
      for (const dbEntity of chunkEntities) {
        const entity: Entity = {
          id: dbEntity.id,
          name: dbEntity.name,
          aliases: dbEntity.aliases || [],
          type: dbEntity.type,
          description: dbEntity.description || undefined,
          confidence: dbEntity.confidence,
          sourceChunks: dbEntity.source_chunks || [],
          metadata: dbEntity.metadata || {},
        };

        if (!allEntities.find(e => e.id === entity.id)) {
          allEntities.push(entity);
        }
      }
    }
  }

  return {
    chunks: topChunks,
    entities: allEntities,
    relations: allRelations,
    paths,
    latencyMs: Date.now() - startTime,
  };
}

// ============================================
// Multi-hop Query
// ============================================

/**
 * Handle multi-hop reasoning queries
 * Example: "Who founded the company that created GPT-4?"
 */
export async function multiHopRetrieve(
  config: GraphStoreConfig,
  query: string,
  hops: number = 2,
  options: GraphRetrievalOptions = {}
): Promise<GraphRetrievalResult> {
  // Override maxDepth for multi-hop
  return retrieve(config, query, {
    ...options,
    maxDepth: hops,
    graphWeight: 0.6, // Higher graph weight for multi-hop
  });
}

// ============================================
// Focused Retrieval
// ============================================

interface FocusedRetrievalOptions {
  focusEntityIds?: string[];
  focusRelationTypes?: RelationType[];
  expandContext?: boolean;
}

/**
 * Retrieve focused on specific entities
 */
export async function focusedRetrieve(
  config: GraphStoreConfig,
  query: string,
  focusOptions: FocusedRetrievalOptions,
  options: GraphRetrievalOptions = {}
): Promise<GraphRetrievalResult> {
  const {
    focusEntityIds = [],
    focusRelationTypes,
    expandContext = true,
  } = focusOptions;

  const startTime = Date.now();

  // 1. Get focus entities and their relations
  const focusEntities: Entity[] = [];
  const focusRelations: Relation[] = [];

  const supabase = createServerClient();

  if (focusEntityIds.length > 0) {
    const { data: entities } = await supabase
      .from('graph_entities')
      .select()
      .eq('user_id', config.userId)
      .eq('collection_id', config.collectionId)
      .in('id', focusEntityIds);

    if (entities) {
      for (const e of entities) {
        focusEntities.push({
          id: e.id,
          name: e.name,
          aliases: e.aliases || [],
          type: e.type,
          description: e.description || undefined,
          confidence: e.confidence,
          sourceChunks: e.source_chunks || [],
          metadata: e.metadata || {},
        });
      }
    }

    // Get relations between focus entities
    for (const entityId of focusEntityIds) {
      const relations = await getEntityRelations(config, entityId, 'both');
      const filtered = focusRelationTypes
        ? relations.filter(r => focusRelationTypes.includes(r.type))
        : relations;
      focusRelations.push(...filtered);
    }
  }

  // 2. Collect source chunks from focus entities
  const focusChunkIds = new Set<string>();
  for (const entity of focusEntities) {
    for (const chunkId of entity.sourceChunks) {
      focusChunkIds.add(chunkId);
    }
  }

  // 3. Regular hybrid retrieval
  const baseResult = await retrieve(config, query, {
    ...options,
    vectorTopK: 30,
    topK: 20,
  });

  // 4. Boost chunks that are in focus
  for (const chunk of baseResult.chunks) {
    if (focusChunkIds.has(chunk.id)) {
      chunk.score = Math.min(1, chunk.score + 0.2);
      chunk.graphScore = Math.min(1, chunk.graphScore + 0.3);
    }
  }

  // 5. Re-sort and limit
  baseResult.chunks.sort((a, b) => b.score - a.score);
  baseResult.chunks = baseResult.chunks.slice(0, options.topK || 10);

  // 6. Add focus entities to result
  for (const entity of focusEntities) {
    if (!baseResult.entities.find(e => e.id === entity.id)) {
      baseResult.entities.push(entity);
    }
  }

  // Deduplicate relations
  const relationIds = new Set(baseResult.relations.map(r => r.id));
  for (const relation of focusRelations) {
    if (!relationIds.has(relation.id)) {
      baseResult.relations.push(relation);
    }
  }

  baseResult.latencyMs = Date.now() - startTime;

  return baseResult;
}

// ============================================
// Context Builder
// ============================================

/**
 * Build context string from retrieval results
 * Useful for LLM prompts
 */
export function buildContext(result: GraphRetrievalResult): string {
  const parts: string[] = [];

  // Add entity context
  if (result.entities.length > 0) {
    parts.push('## Entities');
    for (const entity of result.entities.slice(0, 10)) {
      let line = `- ${entity.name} (${entity.type})`;
      if (entity.description) {
        line += `: ${entity.description}`;
      }
      parts.push(line);
    }
    parts.push('');
  }

  // Add relation context
  if (result.relations.length > 0) {
    parts.push('## Relationships');
    const entityMap = new Map(result.entities.map(e => [e.id, e.name]));
    for (const relation of result.relations.slice(0, 10)) {
      const source = entityMap.get(relation.sourceEntityId) || relation.sourceEntityId;
      const target = entityMap.get(relation.targetEntityId) || relation.targetEntityId;
      parts.push(`- ${source} --[${relation.type}]--> ${target}`);
    }
    parts.push('');
  }

  // Add chunk content
  if (result.chunks.length > 0) {
    parts.push('## Retrieved Content');
    for (const chunk of result.chunks) {
      parts.push(`### Chunk (score: ${chunk.score.toFixed(2)})`);
      parts.push(chunk.content);
      parts.push('');
    }
  }

  return parts.join('\n');
}
