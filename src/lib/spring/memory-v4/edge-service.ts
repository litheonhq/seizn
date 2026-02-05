/**
 * Edge Service
 *
 * Manages graph relationships between memories.
 * Supports relationship types: relates_to, supports, contradicts, supersedes, etc.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export type EdgeType =
  | 'relates_to'
  | 'supports'
  | 'contradicts'
  | 'supersedes'
  | 'derived_from'
  | 'mentions'
  | 'part_of'
  | 'causes'
  | 'similar_to'
  | 'no_relationship';

export interface MemoryEdge {
  id: string;
  srcMemoryId: string;
  dstMemoryId: string;
  edgeType: EdgeType;
  weight: number;
  reason?: string;
  confidence: number;
  createdBy?: string;
  createdByAgent?: string;
  createdBySystem: boolean;
  createdAt: Date;
}

export interface CreateEdgeInput {
  srcMemoryId: string;
  dstMemoryId: string;
  edgeType: EdgeType;
  weight?: number;
  reason?: string;
  confidence?: number;
  createdByAgent?: string;
  createdBySystem?: boolean;
}

export interface EdgeWithMemory extends MemoryEdge {
  otherMemory: {
    id: string;
    content: string;
    type: string;
    tags: string[];
  };
  direction: 'outgoing' | 'incoming';
}

export interface GraphNeighbor {
  memoryId: string;
  content: string;
  edgeType: EdgeType;
  weight: number;
  direction: 'outgoing' | 'incoming';
  hops: number;
}

// =============================================================================
// Edge Service
// =============================================================================

export class EdgeService {
  constructor(private supabase: SupabaseClient) {}

  // ===========================================================================
  // Create Edges
  // ===========================================================================

  /**
   * Create a new edge between memories
   */
  async createEdge(userId: string, input: CreateEdgeInput): Promise<MemoryEdge> {
    // Verify both memories exist and belong to user
    const { data: srcNote, error: srcError } = await this.supabase
      .from('spring_memory_notes')
      .select('id, user_id')
      .eq('id', input.srcMemoryId)
      .single();

    if (srcError || !srcNote) {
      throw new Error('Source memory not found');
    }

    if (srcNote.user_id !== userId) {
      throw new Error('Source memory does not belong to user');
    }

    const { data: dstNote, error: dstError } = await this.supabase
      .from('spring_memory_notes')
      .select('id, user_id')
      .eq('id', input.dstMemoryId)
      .single();

    if (dstError || !dstNote) {
      throw new Error('Destination memory not found');
    }

    if (dstNote.user_id !== userId) {
      throw new Error('Destination memory does not belong to user');
    }

    // Create edge
    const { data, error } = await this.supabase
      .from('spring_memory_edges')
      .insert({
        src_memory_id: input.srcMemoryId,
        dst_memory_id: input.dstMemoryId,
        edge_type: input.edgeType,
        weight: input.weight ?? 1.0,
        reason: input.reason,
        confidence: input.confidence ?? 0.8,
        created_by: userId,
        created_by_agent: input.createdByAgent,
        created_by_system: input.createdBySystem ?? false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Edge already exists');
      }
      throw new Error(`Failed to create edge: ${error.message}`);
    }

    return this.mapEdgeFromDb(data);
  }

  /**
   * Create multiple edges in batch
   */
  async createEdges(userId: string, inputs: CreateEdgeInput[]): Promise<MemoryEdge[]> {
    // Verify all memories belong to user before creating edges
    const memoryIds = new Set<string>();
    inputs.forEach((input) => {
      memoryIds.add(input.srcMemoryId);
      memoryIds.add(input.dstMemoryId);
    });

    const { data: ownedMemories } = await this.supabase
      .from('spring_memory_notes')
      .select('id')
      .eq('user_id', userId)
      .in('id', Array.from(memoryIds));

    const ownedIds = new Set((ownedMemories || []).map((m) => m.id));
    for (const id of Array.from(memoryIds)) {
      if (!ownedIds.has(id)) {
        throw new Error(`Memory ${id} does not belong to user`);
      }
    }

    const edges = inputs.map((input) => ({
      src_memory_id: input.srcMemoryId,
      dst_memory_id: input.dstMemoryId,
      edge_type: input.edgeType,
      weight: input.weight ?? 1.0,
      reason: input.reason,
      confidence: input.confidence ?? 0.8,
      created_by: userId,
      created_by_agent: input.createdByAgent,
      created_by_system: input.createdBySystem ?? false,
    }));

    const { data, error } = await this.supabase
      .from('spring_memory_edges')
      .upsert(edges, { onConflict: 'src_memory_id,dst_memory_id,edge_type' })
      .select();

    if (error) {
      throw new Error(`Failed to create edges: ${error.message}`);
    }

    return (data || []).map((row) => this.mapEdgeFromDb(row));
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get an edge by ID
   */
  async getEdge(edgeId: string): Promise<MemoryEdge | null> {
    const { data, error } = await this.supabase
      .from('spring_memory_edges')
      .select('*')
      .eq('id', edgeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get edge: ${error.message}`);
    }

    return this.mapEdgeFromDb(data);
  }

  /**
   * Get all edges for a memory
   */
  async getEdgesForMemory(
    memoryId: string,
    options?: {
      edgeTypes?: EdgeType[];
      direction?: 'outgoing' | 'incoming' | 'both';
      minWeight?: number;
    }
  ): Promise<EdgeWithMemory[]> {
    const direction = options?.direction || 'both';
    const edgeTypes = options?.edgeTypes;
    const minWeight = options?.minWeight ?? 0;

    // Use RPC if available, otherwise manual query
    const { data, error } = await this.supabase.rpc('get_memory_edges', {
      p_memory_id: memoryId,
      p_edge_types: edgeTypes || null,
      p_direction: direction,
    });

    if (error) {
      // Fallback to manual query
      return this.getEdgesForMemoryFallback(memoryId, direction, edgeTypes, minWeight);
    }

    // Fetch memory details for each edge (using v3 column names)
    const otherIds = (data || []).map((e: Record<string, unknown>) => e.other_memory_id);
    const { data: memories } = await this.supabase
      .from('spring_memory_notes')
      .select('id, content, note_type')
      .in('id', otherIds);

    const memoryMap = new Map(
      (memories || []).map((m: Record<string, unknown>) => [m.id, m])
    );

    return (data || [])
      .filter((e: Record<string, unknown>) => (e.weight as number) >= minWeight)
      .map((e: Record<string, unknown>) => {
        const other = memoryMap.get(e.other_memory_id as string);
        return {
          id: e.edge_id as string,
          srcMemoryId: e.direction === 'outgoing' ? memoryId : (e.other_memory_id as string),
          dstMemoryId: e.direction === 'outgoing' ? (e.other_memory_id as string) : memoryId,
          edgeType: e.edge_type as EdgeType,
          weight: e.weight as number,
          reason: e.reason as string | undefined,
          confidence: (e.confidence as number) || 0.8,
          createdBy: undefined,
          createdByAgent: undefined,
          createdBySystem: false,
          createdAt: new Date(e.created_at as string),
          otherMemory: {
            id: e.other_memory_id as string,
            content: (other?.content as string) || '',
            type: (other?.note_type as string) || '',
            tags: [],
          },
          direction: e.direction as 'outgoing' | 'incoming',
        };
      });
  }

  private async getEdgesForMemoryFallback(
    memoryId: string,
    direction: 'outgoing' | 'incoming' | 'both',
    edgeTypes?: EdgeType[],
    minWeight = 0
  ): Promise<EdgeWithMemory[]> {
    const results: EdgeWithMemory[] = [];

    // Outgoing edges (using v3 column names)
    if (direction === 'both' || direction === 'outgoing') {
      let query = this.supabase
        .from('spring_memory_edges')
        .select(`
          *,
          dst:spring_memory_notes!dst_memory_id(id, content, note_type)
        `)
        .eq('src_memory_id', memoryId)
        .gte('weight', minWeight);

      if (edgeTypes) {
        query = query.in('edge_type', edgeTypes);
      }

      const { data } = await query;

      for (const row of data || []) {
        results.push({
          ...this.mapEdgeFromDb(row),
          otherMemory: {
            id: row.dst.id,
            content: row.dst.content,
            type: row.dst.note_type,
            tags: [],
          },
          direction: 'outgoing',
        });
      }
    }

    // Incoming edges (using v3 column names)
    if (direction === 'both' || direction === 'incoming') {
      let query = this.supabase
        .from('spring_memory_edges')
        .select(`
          *,
          src:spring_memory_notes!src_memory_id(id, content, note_type)
        `)
        .eq('dst_memory_id', memoryId)
        .gte('weight', minWeight);

      if (edgeTypes) {
        query = query.in('edge_type', edgeTypes);
      }

      const { data } = await query;

      for (const row of data || []) {
        results.push({
          ...this.mapEdgeFromDb(row),
          otherMemory: {
            id: row.src.id,
            content: row.src.content,
            type: row.src.note_type,
            tags: [],
          },
          direction: 'incoming',
        });
      }
    }

    return results.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Find contradicting memories
   */
  async findContradictions(memoryId: string): Promise<EdgeWithMemory[]> {
    return this.getEdgesForMemory(memoryId, {
      edgeTypes: ['contradicts'],
      direction: 'both',
    });
  }

  /**
   * Get the canonical memory in a supersedes chain
   */
  async getCanonicalMemory(memoryId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('get_canonical_memory', {
      p_memory_id: memoryId,
    });

    if (error) {
      // Fallback: return same ID
      return memoryId;
    }

    return data || memoryId;
  }

  // ===========================================================================
  // Graph Traversal
  // ===========================================================================

  /**
   * Get N-hop neighborhood of a memory
   */
  async getNeighborhood(
    memoryId: string,
    maxHops = 2,
    options?: {
      edgeTypes?: EdgeType[];
      minWeight?: number;
      limit?: number;
    }
  ): Promise<GraphNeighbor[]> {
    const visited = new Set<string>([memoryId]);
    const neighbors: GraphNeighbor[] = [];
    const queue: Array<{ id: string; hops: number }> = [{ id: memoryId, hops: 0 }];

    while (queue.length > 0 && neighbors.length < (options?.limit || 50)) {
      const current = queue.shift()!;

      if (current.hops >= maxHops) continue;

      const edges = await this.getEdgesForMemory(current.id, {
        edgeTypes: options?.edgeTypes,
        minWeight: options?.minWeight,
        direction: 'both',
      });

      for (const edge of edges) {
        if (!visited.has(edge.otherMemory.id)) {
          visited.add(edge.otherMemory.id);

          neighbors.push({
            memoryId: edge.otherMemory.id,
            content: edge.otherMemory.content,
            edgeType: edge.edgeType,
            weight: edge.weight,
            direction: edge.direction,
            hops: current.hops + 1,
          });

          queue.push({ id: edge.otherMemory.id, hops: current.hops + 1 });
        }
      }
    }

    return neighbors.sort((a, b) => {
      if (a.hops !== b.hops) return a.hops - b.hops;
      return b.weight - a.weight;
    });
  }

  /**
   * Find path between two memories
   */
  async findPath(
    srcMemoryId: string,
    dstMemoryId: string,
    maxHops = 5
  ): Promise<MemoryEdge[] | null> {
    const visited = new Set<string>([srcMemoryId]);
    const queue: Array<{ id: string; path: MemoryEdge[] }> = [
      { id: srcMemoryId, path: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length >= maxHops) continue;

      const edges = await this.getEdgesForMemory(current.id, {
        direction: 'both',
      });

      for (const edge of edges) {
        const nextId = edge.otherMemory.id;

        if (nextId === dstMemoryId) {
          return [...current.path, edge];
        }

        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, path: [...current.path, edge] });
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // Update & Delete
  // ===========================================================================

  /**
   * Update edge weight
   */
  async updateEdgeWeight(edgeId: string, weight: number): Promise<MemoryEdge> {
    const { data, error } = await this.supabase
      .from('spring_memory_edges')
      .update({ weight })
      .eq('id', edgeId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update edge: ${error.message}`);
    }

    return this.mapEdgeFromDb(data);
  }

  /**
   * Delete an edge
   */
  async deleteEdge(edgeId: string): Promise<void> {
    const { error } = await this.supabase
      .from('spring_memory_edges')
      .delete()
      .eq('id', edgeId);

    if (error) {
      throw new Error(`Failed to delete edge: ${error.message}`);
    }
  }

  /**
   * Delete all edges for a memory
   */
  async deleteAllEdges(memoryId: string): Promise<number> {
    const { error, count } = await this.supabase
      .from('spring_memory_edges')
      .delete()
      .or(`src_memory_id.eq.${memoryId},dst_memory_id.eq.${memoryId}`);

    if (error) {
      throw new Error(`Failed to delete edges: ${error.message}`);
    }

    return count || 0;
  }

  // ===========================================================================
  // Analysis
  // ===========================================================================

  /**
   * Get edge statistics for a user
   */
  async getEdgeStats(userId: string): Promise<{
    totalEdges: number;
    byType: Record<EdgeType, number>;
    avgWeight: number;
  }> {
    // Get edges for user's memories
    const { data, error } = await this.supabase
      .from('spring_memory_edges')
      .select(`
        edge_type,
        weight,
        src:spring_memory_notes!src_memory_id(user_id)
      `)
      .eq('src.user_id', userId);

    if (error) {
      throw new Error(`Failed to get edge stats: ${error.message}`);
    }

    const edges = data || [];
    const byType: Record<string, number> = {};
    let totalWeight = 0;

    for (const edge of edges) {
      byType[edge.edge_type] = (byType[edge.edge_type] || 0) + 1;
      totalWeight += edge.weight;
    }

    return {
      totalEdges: edges.length,
      byType: byType as Record<EdgeType, number>,
      avgWeight: edges.length > 0 ? totalWeight / edges.length : 0,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapEdgeFromDb(row: Record<string, unknown>): MemoryEdge {
    return {
      id: row.id as string,
      srcMemoryId: row.src_memory_id as string,
      dstMemoryId: row.dst_memory_id as string,
      edgeType: row.edge_type as EdgeType,
      weight: row.weight as number,
      reason: row.reason as string | undefined,
      confidence: row.confidence as number,
      createdBy: row.created_by as string | undefined,
      createdByAgent: row.created_by_agent as string | undefined,
      createdBySystem: row.created_by_system as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createEdgeService(supabase: SupabaseClient): EdgeService {
  return new EdgeService(supabase);
}
