/**
 * GraphRAG-Memory Connector
 *
 * Integrates GraphRAG knowledge graph with the memory system:
 * - Auto-extract entities from stored memories
 * - Create memory edges based on entity relations
 * - Use GraphRAG for enhanced memory retrieval
 *
 * @module memory/graphrag-connector
 */

import { createServerClient } from '@/lib/supabase';
import {
  extractEntities,
  extractRelations,
  createEntities,
  createRelations,
  retrieve as graphRetrieve,
  type Entity,
  type Relation,
  type ChunkInput,
  type GraphStoreConfig,
  type GraphRetrievalOptions,
  type GraphRetrievalResult,
  type EntityInput,
  type RelationInput,
} from '@/lib/graph-rag';

// ============================================
// Types
// ============================================

export interface MemoryEdgeType {
  type: 'contradiction' | 'supersedes' | 'elaboration' | 'example' | 'related' | 'derived_from';
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryGraphConfig {
  userId: string;
  namespace?: string;
  autoExtract?: boolean;
  autoCreateEdges?: boolean;
  minEntityConfidence?: number;
  minRelationConfidence?: number;
}

export interface MemoryGraphResult {
  memories: Array<{
    id: string;
    content: string;
    score: number;
    graphScore: number;
    vectorScore: number;
  }>;
  entities: Entity[];
  relations: Relation[];
  edges: MemoryEdge[];
  processingTimeMs: number;
}

export interface MemoryEdge {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  edgeType: MemoryEdgeType['type'];
  confidence: number;
  reason?: string;
  createdAt: string;
}

// ============================================
// Relation to Edge Type Mapping
// ============================================

const RELATION_TO_EDGE_MAP: Record<string, MemoryEdgeType['type']> = {
  is_a: 'related',
  part_of: 'related',
  belongs_to: 'related',
  causes: 'derived_from',
  requires: 'related',
  depends_on: 'derived_from',
  authored_by: 'related',
  affiliated_with: 'related',
  located_in: 'related',
  occurred_at: 'related',
  compares_to: 'related',
  contrasts_with: 'contradiction',
};

// ============================================
// Memory GraphRAG Connector
// ============================================

export class MemoryGraphConnector {
  private supabase = createServerClient();
  private config: MemoryGraphConfig;

  constructor(config: MemoryGraphConfig) {
    this.config = {
      autoExtract: true,
      autoCreateEdges: true,
      minEntityConfidence: 0.5,
      minRelationConfidence: 0.5,
      ...config,
    };
  }

  /**
   * Process a newly stored memory
   * - Extract entities and relations
   * - Create graph nodes
   * - Create memory edges based on relations
   */
  async processMemory(memoryId: string, content: string): Promise<{
    entities: EntityInput[];
    relations: RelationInput[];
    edges: MemoryEdge[];
  }> {
    if (!this.config.autoExtract) {
      return { entities: [], relations: [], edges: [] };
    }

    // Prepare chunk for extraction
    const chunk: ChunkInput = {
      id: memoryId,
      content,
      metadata: {
        userId: this.config.userId,
        namespace: this.config.namespace,
      },
    };

    // Extract entities
    const { entities } = await extractEntities([chunk], {
      minConfidence: this.config.minEntityConfidence,
    });

    // Extract relations
    const { relations } = await extractRelations([chunk], entities, {
      minConfidence: this.config.minRelationConfidence,
    });

    // Store in graph
    const graphConfig: GraphStoreConfig = {
      userId: this.config.userId,
      collectionId: this.config.namespace || 'default',
    };

    await createEntities(graphConfig, entities);
    await createRelations(graphConfig, relations);

    // Create memory edges based on relations
    const edges: MemoryEdge[] = [];

    if (this.config.autoCreateEdges && relations.length > 0) {
      const createdEdges = await this.createEdgesFromRelations(memoryId, relations);
      edges.push(...createdEdges);
    }

    return { entities, relations, edges };
  }

  /**
   * Create memory edges based on GraphRAG relations
   */
  private async createEdgesFromRelations(
    sourceMemoryId: string,
    relations: RelationInput[]
  ): Promise<MemoryEdge[]> {
    const edges: MemoryEdge[] = [];

    for (const relation of relations) {
      // Find memories containing the related entities
      const { data: relatedMemories } = await this.supabase
        .from('memories')
        .select('id, content')
        .eq('user_id', this.config.userId)
        .or(`content.ilike.%${relation.sourceEntityId}%,content.ilike.%${relation.targetEntityId}%`)
        .neq('id', sourceMemoryId)
        .limit(5);

      if (!relatedMemories) continue;

      for (const relatedMemory of relatedMemories) {
        const edgeType = RELATION_TO_EDGE_MAP[relation.type] || 'related';

        // Check if edge already exists
        const { data: existingEdge } = await this.supabase
          .from('memory_edges')
          .select('id')
          .eq('source_memory_id', sourceMemoryId)
          .eq('target_memory_id', relatedMemory.id)
          .single();

        if (existingEdge) continue;

        // Create the edge
        const { data: newEdge, error } = await this.supabase
          .from('memory_edges')
          .insert({
            source_memory_id: sourceMemoryId,
            target_memory_id: relatedMemory.id,
            edge_type: edgeType,
            confidence: relation.confidence || 0.5,
            reason: `GraphRAG relation: ${relation.type}`,
            metadata: {
              relationId: relation.sourceEntityId + ':' + relation.targetEntityId,
              relationType: relation.type,
              evidence: relation.evidence,
            },
          })
          .select()
          .single();

        if (!error && newEdge) {
          edges.push({
            id: newEdge.id,
            sourceMemoryId: newEdge.source_memory_id,
            targetMemoryId: newEdge.target_memory_id,
            edgeType: newEdge.edge_type,
            confidence: newEdge.confidence,
            reason: newEdge.reason,
            createdAt: newEdge.created_at,
          });
        }
      }
    }

    return edges;
  }

  /**
   * Retrieve memories using GraphRAG augmentation
   */
  async retrieve(
    query: string,
    options?: Partial<GraphRetrievalOptions>
  ): Promise<MemoryGraphResult> {
    const startTime = Date.now();

    const graphConfig: GraphStoreConfig = {
      userId: this.config.userId,
      collectionId: this.config.namespace || 'default',
    };

    // Use GraphRAG retrieval
    const graphResult = await graphRetrieve(graphConfig, query, {
      maxDepth: 2,
      vectorWeight: 0.5,
      graphWeight: 0.5,
      topK: 10,
      includeEntityContext: true,
      ...options,
    });

    // Get memory IDs from graph chunks
    const chunkIds = graphResult.chunks.map((c) => c.id);

    // Fetch full memory records
    const { data: memories } = await this.supabase
      .from('memories')
      .select('*')
      .in('id', chunkIds);

    // Fetch memory edges
    const { data: edgesData } = await this.supabase
      .from('memory_edges')
      .select('*')
      .or(`source_memory_id.in.(${chunkIds.join(',')}),target_memory_id.in.(${chunkIds.join(',')})`);

    const edges: MemoryEdge[] = (edgesData || []).map((e) => ({
      id: e.id,
      sourceMemoryId: e.source_memory_id,
      targetMemoryId: e.target_memory_id,
      edgeType: e.edge_type,
      confidence: e.confidence,
      reason: e.reason,
      createdAt: e.created_at,
    }));

    // Map chunks to memories with scores
    const memoryResults = graphResult.chunks.map((chunk) => {
      const memory = memories?.find((m) => m.id === chunk.id);
      return {
        id: chunk.id,
        content: memory?.content || chunk.content,
        score: chunk.score,
        graphScore: chunk.graphScore,
        vectorScore: chunk.vectorScore,
      };
    });

    return {
      memories: memoryResults,
      entities: graphResult.entities,
      relations: graphResult.relations,
      edges,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find related memories using graph traversal
   */
  async findRelatedMemories(
    memoryId: string,
    maxDepth: number = 2
  ): Promise<{
    memories: Array<{ id: string; content: string; distance: number; path: string[] }>;
    edges: MemoryEdge[];
  }> {
    const visited = new Set<string>();
    const results: Array<{ id: string; content: string; distance: number; path: string[] }> = [];
    const allEdges: MemoryEdge[] = [];

    // BFS traversal
    const queue: Array<{ id: string; distance: number; path: string[] }> = [
      { id: memoryId, distance: 0, path: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.distance > maxDepth) continue;
      visited.add(current.id);

      // Fetch connected edges
      const { data: edges } = await this.supabase
        .from('memory_edges')
        .select('*')
        .or(`source_memory_id.eq.${current.id},target_memory_id.eq.${current.id}`);

      if (!edges) continue;

      for (const edge of edges) {
        allEdges.push({
          id: edge.id,
          sourceMemoryId: edge.source_memory_id,
          targetMemoryId: edge.target_memory_id,
          edgeType: edge.edge_type,
          confidence: edge.confidence,
          reason: edge.reason,
          createdAt: edge.created_at,
        });

        const nextId = edge.source_memory_id === current.id
          ? edge.target_memory_id
          : edge.source_memory_id;

        if (!visited.has(nextId)) {
          queue.push({
            id: nextId,
            distance: current.distance + 1,
            path: [...current.path, current.id],
          });
        }
      }

      // Fetch memory content (skip source memory)
      if (current.id !== memoryId) {
        const { data: memory } = await this.supabase
          .from('memories')
          .select('content')
          .eq('id', current.id)
          .single();

        if (memory) {
          results.push({
            id: current.id,
            content: memory.content,
            distance: current.distance,
            path: current.path,
          });
        }
      }
    }

    // Deduplicate edges
    const uniqueEdges = Array.from(
      new Map(allEdges.map((e) => [e.id, e])).values()
    );

    return {
      memories: results.sort((a, b) => a.distance - b.distance),
      edges: uniqueEdges,
    };
  }

  /**
   * Get memory graph statistics
   */
  async getGraphStats(): Promise<{
    totalMemories: number;
    totalEdges: number;
    totalEntities: number;
    totalRelations: number;
    edgesByType: Record<string, number>;
    averageEdgesPerMemory: number;
  }> {
    const [memoriesCount, edgesCount, entitiesCount, relationsCount, edgeTypes] = await Promise.all([
      this.supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.config.userId),
      this.supabase
        .from('memory_edges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.config.userId),
      this.supabase
        .from('graph_entities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.config.userId),
      this.supabase
        .from('graph_relations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.config.userId),
      this.supabase
        .from('memory_edges')
        .select('edge_type')
        .eq('user_id', this.config.userId),
    ]);

    const totalMemories = memoriesCount.count || 0;
    const totalEdges = edgesCount.count || 0;
    const totalEntities = entitiesCount.count || 0;
    const totalRelations = relationsCount.count || 0;

    // Count edges by type
    const edgesByType: Record<string, number> = {};
    for (const row of edgeTypes.data || []) {
      edgesByType[row.edge_type] = (edgesByType[row.edge_type] || 0) + 1;
    }

    return {
      totalMemories,
      totalEdges,
      totalEntities,
      totalRelations,
      edgesByType,
      averageEdgesPerMemory: totalMemories > 0 ? totalEdges / totalMemories : 0,
    };
  }

  /**
   * Rebuild graph edges from existing memories
   * Use for initial migration or after bulk import
   */
  async rebuildGraphEdges(batchSize: number = 100): Promise<{
    processedMemories: number;
    createdEdges: number;
    errors: number;
  }> {
    let processedMemories = 0;
    let createdEdges = 0;
    let errors = 0;
    let offset = 0;

    while (true) {
      const { data: memories, error } = await this.supabase
        .from('memories')
        .select('id, content')
        .eq('user_id', this.config.userId)
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true });

      if (error || !memories || memories.length === 0) break;

      for (const memory of memories) {
        try {
          const result = await this.processMemory(memory.id, memory.content);
          processedMemories++;
          createdEdges += result.edges.length;
        } catch {
          errors++;
        }
      }

      offset += batchSize;

      // Allow other requests to process
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { processedMemories, createdEdges, errors };
  }
}

// ============================================
// Factory Function
// ============================================

export function createMemoryGraphConnector(config: MemoryGraphConfig): MemoryGraphConnector {
  return new MemoryGraphConnector(config);
}
