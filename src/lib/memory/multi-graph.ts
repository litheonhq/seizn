import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Multi-Graph Memory Engine (MAGMA Pattern)
 *
 * Represents each memory item across four orthogonal graph dimensions:
 *
 * 1. Temporal Graph -> immutable timeline of events (answers "when")
 *    - Edges: BEFORE, AFTER, DURING, CONCURRENT
 *
 * 2. Causal Graph -> cause-and-effect relationships (answers "why")
 *    - Edges: CAUSES, PREVENTS, ENABLES, REQUIRES
 *
 * 3. Entity Graph -> tracks people/places/things (object permanence)
 *    - Edges: IS_A, PART_OF, BELONGS_TO, RELATED_TO
 *
 * 4. Semantic Graph -> conceptual similarity (answers "what relates")
 *    - Edges: SIMILAR_TO, CONTRASTS_WITH, ELABORATES, REFERENCES
 *
 * The multi-graph approach provides 45.5% higher reasoning accuracy
 * on long-context benchmarks and 95% token reduction.
 *
 * @see https://arxiv.org/abs/2601.03236 (MAGMA Paper)
 */

import { createServerClient } from '../supabase';

// ============================================
// Types
// ============================================

export type GraphDimension = 'temporal' | 'causal' | 'entity' | 'semantic';

export type TemporalEdgeType = 'before' | 'after' | 'during' | 'concurrent';
export type CausalEdgeType = 'causes' | 'prevents' | 'enables' | 'requires' | 'depends_on';
export type EntityEdgeType = 'is_a' | 'part_of' | 'belongs_to' | 'contains' | 'related_to' | 'works_for';
export type SemanticEdgeType = 'similar_to' | 'contrasts_with' | 'elaborates' | 'references' | 'derived';

export type MultiGraphEdgeType =
  | TemporalEdgeType
  | CausalEdgeType
  | EntityEdgeType
  | SemanticEdgeType;

export interface MultiGraphEdge {
  sourceMemoryId: string;
  targetMemoryId: string;
  dimension: GraphDimension;
  edgeType: MultiGraphEdgeType;
  weight: number;         // 0-1 confidence
  metadata?: {
    /** For temporal: timestamp of the relationship */
    validFrom?: string;
    validTo?: string;
    /** For causal: strength of causation */
    causalStrength?: number;
    /** For entity: entity names involved */
    entities?: string[];
    /** Free-form context */
    context?: string;
  };
}

export interface MultiGraphNode {
  memoryId: string;
  content: string;
  /** Graph-specific attributes */
  temporal?: {
    eventTime?: Date;
    duration?: number; // minutes
    isRecurring?: boolean;
  };
  causal?: {
    isEffect?: boolean;
    isCause?: boolean;
    causalDepth?: number; // how many hops from root cause
  };
  entity?: {
    entityNames: string[];
    entityTypes: string[];
  };
  semantic?: {
    topics: string[];
    semanticCluster?: string;
  };
}

export interface GraphTraversalResult {
  /** Starting node */
  origin: string;
  /** Traversed nodes with their context */
  nodes: Array<{
    memoryId: string;
    content: string;
    dimension: GraphDimension;
    edgeType: MultiGraphEdgeType;
    depth: number;
    pathWeight: number; // product of edge weights along path
  }>;
  /** Total dimensions traversed */
  dimensionsUsed: GraphDimension[];
}

export interface MultiGraphQuery {
  /** Starting memory ID or query text */
  query: string;
  /** Which graph dimensions to traverse */
  dimensions?: GraphDimension[];
  /** Maximum traversal depth per dimension */
  maxDepth?: number;
  /** Minimum edge weight threshold */
  minWeight?: number;
  /** Maximum total results */
  limit?: number;
}

// Dimension -> valid edge types mapping
const DIMENSION_EDGES: Record<GraphDimension, readonly string[]> = {
  temporal: ['before', 'after', 'during', 'concurrent'] as const,
  causal: ['causes', 'prevents', 'enables', 'requires', 'depends_on'] as const,
  entity: ['is_a', 'part_of', 'belongs_to', 'contains', 'related_to', 'works_for'] as const,
  semantic: ['similar_to', 'contrasts_with', 'elaborates', 'references', 'derived'] as const,
};

// ============================================
// Multi-Graph Service
// ============================================

export class MultiGraphService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Add an edge to the multi-graph.
   *
   * Validates that the edge type matches the declared dimension.
   */
  async addEdge(edge: MultiGraphEdge): Promise<{ id: string } | null> {
    // Validate dimension-edge type consistency
    const validEdges = DIMENSION_EDGES[edge.dimension];
    if (!validEdges.includes(edge.edgeType)) {
      throw new Error(
        `Edge type "${edge.edgeType}" is not valid for dimension "${edge.dimension}". Valid types: ${validEdges.join(', ')}`
      );
    }

    const supabase = createServerClient();

    // Map to the existing memory_edges table
    const dbEdgeType = `${edge.dimension}:${edge.edgeType}`;

    const { data, error } = await supabase
      .from('memory_edges')
      .upsert(
        {
          source_memory_id: edge.sourceMemoryId,
          target_memory_id: edge.targetMemoryId,
          edge_type: dbEdgeType,
          weight: edge.weight,
          metadata: {
            dimension: edge.dimension,
            original_type: edge.edgeType,
            ...(edge.metadata || {}),
          },
        },
        { onConflict: 'source_memory_id,target_memory_id,edge_type' }
      )
      .select('id')
      .single();

    if (error) {
      console.error('[MultiGraph] Error adding edge:', error);
      return null;
    }

    return data;
  }

  /**
   * Add multiple edges in batch.
   */
  async addEdges(edges: MultiGraphEdge[]): Promise<number> {
    let count = 0;
    for (const edge of edges) {
      const result = await this.addEdge(edge);
      if (result) count++;
    }
    return count;
  }

  /**
   * Traverse the multi-graph from a starting memory.
   *
   * Performs BFS across specified dimensions, collecting
   * related memories with path weights.
   */
  async traverse(
    startMemoryId: string,
    options: Omit<MultiGraphQuery, 'query'> = {}
  ): Promise<GraphTraversalResult> {
    const {
      dimensions = ['temporal', 'causal', 'entity', 'semantic'],
      maxDepth = 2,
      minWeight = 0.3,
      limit = 20,
    } = options;

    const supabase = createServerClient();
    const visited = new Set<string>([startMemoryId]);
    const result: GraphTraversalResult = {
      origin: startMemoryId,
      nodes: [],
      dimensionsUsed: [],
    };

    // BFS queue: [memoryId, depth, pathWeight]
    const queue: Array<[string, number, number]> = [[startMemoryId, 0, 1.0]];

    while (queue.length > 0 && result.nodes.length < limit) {
      const [currentId, depth, pathWeight] = queue.shift()!;

      if (depth >= maxDepth) continue;

      // Build dimension filter
      const dimensionPrefixes = dimensions.map((d) => `${d}:`);

      // Query edges from current node
      const { data: edges, error } = await supabase
        .from('memory_edges')
        .select(`
          id,
          target_memory_id,
          source_memory_id,
          edge_type,
          weight,
          metadata
        `)
        .or(`source_memory_id.eq.${currentId},target_memory_id.eq.${currentId}`)
        .gte('weight', minWeight);

      if (error || !edges) continue;

      for (const edge of edges) {
        // Filter by dimension
        const matchesDimension = dimensionPrefixes.some((p) =>
          edge.edge_type.startsWith(p)
        );
        if (!matchesDimension) continue;

        // Get the other end of the edge
        const neighborId =
          edge.source_memory_id === currentId
            ? edge.target_memory_id
            : edge.source_memory_id;

        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        // Parse dimension and type from edge_type
        const [dimension, edgeType] = edge.edge_type.split(':') as [
          GraphDimension,
          MultiGraphEdgeType,
        ];

        // Get memory content
        const { data: memory } = await supabase
          .from('memories')
          .select('content')
          .eq('id', neighborId)
          .eq('user_id', this.userId)
          .eq('is_deleted', false)
          .single();

        if (!memory) continue;

        const newPathWeight = pathWeight * edge.weight;

        result.nodes.push({
          memoryId: neighborId,
          content: memory.content,
          dimension,
          edgeType,
          depth: depth + 1,
          pathWeight: newPathWeight,
        });

        if (!result.dimensionsUsed.includes(dimension)) {
          result.dimensionsUsed.push(dimension);
        }

        // Add to queue for further traversal
        queue.push([neighborId, depth + 1, newPathWeight]);
      }
    }

    // Sort by path weight (strongest connections first)
    result.nodes.sort((a, b) => b.pathWeight - a.pathWeight);

    return result;
  }

  /**
   * Auto-extract graph edges from a memory's content using LLM.
   *
   * Analyzes the memory content and existing graph to identify
   * temporal, causal, entity, and semantic relationships.
   */
  async autoExtractEdges(
    memoryId: string,
    memoryContent: string,
    existingMemories: Array<{ id: string; content: string }>
  ): Promise<MultiGraphEdge[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    // Limit context to prevent huge prompts
    const context = existingMemories
      .slice(0, 20)
      .map((m) => `[${m.id}] ${m.content.slice(0, 200)}`)
      .join('\n');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          system: `You are a knowledge graph analyst. Given a new memory and existing memories, identify relationships across four dimensions.

Return ONLY a JSON array of edge objects:
{
  "targetId": "<existing memory ID>",
  "dimension": "temporal" | "causal" | "entity" | "semantic",
  "edgeType": "<valid type for dimension>",
  "weight": 0.0-1.0
}

Valid edge types per dimension:
- temporal: before, after, during, concurrent
- causal: causes, prevents, enables, requires, depends_on
- entity: is_a, part_of, belongs_to, contains, related_to, works_for
- semantic: similar_to, contrasts_with, elaborates, references, derived

Be selective. Only create edges with weight >= 0.5. Return [] if no strong relationships exist.`,
          messages: [
            {
              role: 'user',
              content: `New memory: "${memoryContent}"\n\nExisting memories:\n${context}`,
            },
          ],
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      const text = data.content?.[0]?.text?.trim() || '[]';

      let parsed: Array<{
        targetId: string;
        dimension: GraphDimension;
        edgeType: MultiGraphEdgeType;
        weight: number;
      }>;

      try {
        parsed = JSON.parse(text);
      } catch {
        return [];
      }

      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (e) =>
            e.targetId &&
            e.dimension &&
            e.edgeType &&
            e.weight >= 0.5 &&
            DIMENSION_EDGES[e.dimension]?.includes(e.edgeType)
        )
        .map((e) => ({
          sourceMemoryId: memoryId,
          targetMemoryId: e.targetId,
          dimension: e.dimension,
          edgeType: e.edgeType,
          weight: e.weight,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Get graph statistics across all dimensions.
   */
  async getStats(): Promise<{
    totalEdges: number;
    edgesByDimension: Record<GraphDimension, number>;
    averageWeight: number;
    maxDepth: Record<GraphDimension, number>;
  }> {
    const supabase = createServerClient();

    const { data: edges, error } = await supabase
      .from('memory_edges')
      .select('edge_type, weight')
      .limit(10000);

    if (error || !edges) {
      return {
        totalEdges: 0,
        edgesByDimension: { temporal: 0, causal: 0, entity: 0, semantic: 0 },
        averageWeight: 0,
        maxDepth: { temporal: 0, causal: 0, entity: 0, semantic: 0 },
      };
    }

    const byDimension: Record<GraphDimension, number> = {
      temporal: 0,
      causal: 0,
      entity: 0,
      semantic: 0,
    };

    let totalWeight = 0;

    for (const edge of edges) {
      const dimension = edge.edge_type.split(':')[0] as GraphDimension;
      if (byDimension[dimension] !== undefined) {
        byDimension[dimension]++;
      }
      totalWeight += edge.weight || 0;
    }

    return {
      totalEdges: edges.length,
      edgesByDimension: byDimension,
      averageWeight: edges.length > 0 ? totalWeight / edges.length : 0,
      maxDepth: { temporal: 0, causal: 0, entity: 0, semantic: 0 }, // computed on-demand
    };
  }
}

/**
 * Factory function for creating a MultiGraphService.
 */
export function createMultiGraphService(userId: string): MultiGraphService {
  return new MultiGraphService(userId);
}
