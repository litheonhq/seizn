/**
 * Community Detection Service
 *
 * Implements Louvain community detection algorithm for knowledge graphs.
 * Part of GraphRAG hierarchical summarization system.
 *
 * @module graph-rag/community/detection
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface CommunityDetectionConfig {
  /** Algorithm to use */
  algorithm: 'louvain' | 'leiden';
  /** Resolution parameter (higher = more communities) */
  resolution: number;
  /** Minimum community size */
  minCommunitySize: number;
  /** Maximum hierarchy levels */
  maxLevels: number;
  /** Maximum iterations per level */
  maxIterations: number;
  /** Convergence threshold */
  convergenceThreshold: number;
}

export interface Community {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Community number at this level */
  number: number;
  /** Hierarchy level (0 = leaf) */
  level: number;
  /** Parent community ID */
  parentId?: string;
  /** Member entity IDs */
  members: string[];
  /** Internal edge density */
  density: number;
  /** Contribution to modularity */
  modularityContribution: number;
  /** Average degree of members */
  avgDegree: number;
}

export interface DetectionResult {
  /** Detected communities */
  communities: Community[];
  /** Total modularity score */
  modularity: number;
  /** Number of hierarchy levels */
  levels: number;
  /** Processing time in ms */
  processingMs: number;
  /** Run ID for tracking */
  runId: string;
}

// Internal types for Louvain algorithm
interface Node {
  id: string;
  community: number;
  degree: number;
  selfLoops: number;
}

interface Edge {
  source: string;
  target: string;
  weight: number;
}

interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  totalWeight: number;
  communityWeights: Map<number, number>;
  communityInternalWeights: Map<number, number>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: CommunityDetectionConfig = {
  algorithm: 'louvain',
  resolution: 1.0,
  minCommunitySize: 3,
  maxLevels: 3,
  maxIterations: 100,
  convergenceThreshold: 0.0001,
};

// =============================================================================
// Louvain Algorithm Implementation
// =============================================================================

class LouvainAlgorithm {
  private config: CommunityDetectionConfig;

  constructor(config: CommunityDetectionConfig) {
    this.config = config;
  }

  /**
   * Run Louvain community detection
   */
  detect(nodes: string[], edges: Edge[]): { communities: Map<string, number>; modularity: number } {
    // Initialize graph
    const graph = this.initializeGraph(nodes, edges);

    // Phase 1: Local moving
    let improved = true;
    let iteration = 0;

    while (improved && iteration < this.config.maxIterations) {
      improved = this.localMovingPhase(graph);
      iteration++;
    }

    // Calculate final modularity
    const modularity = this.calculateModularity(graph);

    // Extract community assignments
    const communities = new Map<string, number>();
    for (const [nodeId, node] of graph.nodes) {
      communities.set(nodeId, node.community);
    }

    return { communities, modularity };
  }

  /**
   * Run hierarchical detection (multiple levels)
   */
  detectHierarchical(
    nodes: string[],
    edges: Edge[]
  ): { levels: Array<Map<string, number>>; modularity: number } {
    const levels: Array<Map<string, number>> = [];
    let currentNodes = nodes;
    let currentEdges = edges;
    let totalModularity = 0;

    for (let level = 0; level < this.config.maxLevels; level++) {
      const result = this.detect(currentNodes, currentEdges);
      levels.push(result.communities);
      totalModularity = result.modularity;

      // Check if we found meaningful communities
      const uniqueCommunities = new Set(result.communities.values());
      if (uniqueCommunities.size <= 1 || uniqueCommunities.size === currentNodes.length) {
        break; // No more meaningful partitioning
      }

      // Aggregate for next level
      const aggregated = this.aggregateGraph(currentNodes, currentEdges, result.communities);
      currentNodes = aggregated.nodes;
      currentEdges = aggregated.edges;

      if (currentNodes.length <= this.config.minCommunitySize) {
        break;
      }
    }

    return { levels, modularity: totalModularity };
  }

  private initializeGraph(nodes: string[], edges: Edge[]): Graph {
    const nodeMap = new Map<string, Node>();
    let totalWeight = 0;

    // Initialize nodes
    for (const nodeId of nodes) {
      nodeMap.set(nodeId, {
        id: nodeId,
        community: nodeMap.size, // Each node starts in its own community
        degree: 0,
        selfLoops: 0,
      });
    }

    // Calculate degrees from edges
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (sourceNode && targetNode) {
        sourceNode.degree += edge.weight;
        targetNode.degree += edge.weight;
        totalWeight += edge.weight;

        if (edge.source === edge.target) {
          sourceNode.selfLoops += edge.weight;
        }
      }
    }

    // Initialize community weights
    const communityWeights = new Map<number, number>();
    const communityInternalWeights = new Map<number, number>();

    for (const [, node] of nodeMap) {
      communityWeights.set(node.community, node.degree);
      communityInternalWeights.set(node.community, node.selfLoops);
    }

    return {
      nodes: nodeMap,
      edges,
      totalWeight: totalWeight / 2, // Each edge counted twice
      communityWeights,
      communityInternalWeights,
    };
  }

  private localMovingPhase(graph: Graph): boolean {
    let improved = false;
    const nodeIds = Array.from(graph.nodes.keys());

    // Shuffle for randomness
    this.shuffle(nodeIds);

    for (const nodeId of nodeIds) {
      const node = graph.nodes.get(nodeId)!;
      const currentCommunity = node.community;

      // Find neighboring communities
      const neighborCommunities = this.getNeighborCommunities(graph, nodeId);

      // Try moving to each neighboring community
      let bestCommunity = currentCommunity;
      let bestDeltaQ = 0;

      for (const [targetCommunity, edgeWeight] of neighborCommunities) {
        if (targetCommunity === currentCommunity) continue;

        const deltaQ = this.calculateDeltaModularity(
          graph,
          node,
          currentCommunity,
          targetCommunity,
          edgeWeight
        );

        if (deltaQ > bestDeltaQ) {
          bestDeltaQ = deltaQ;
          bestCommunity = targetCommunity;
        }
      }

      // Move node if improvement found
      if (bestCommunity !== currentCommunity && bestDeltaQ > this.config.convergenceThreshold) {
        this.moveNode(graph, node, currentCommunity, bestCommunity);
        improved = true;
      }
    }

    return improved;
  }

  private getNeighborCommunities(graph: Graph, nodeId: string): Map<number, number> {
    const communities = new Map<number, number>();

    for (const edge of graph.edges) {
      let neighborId: string | null = null;

      if (edge.source === nodeId) {
        neighborId = edge.target;
      } else if (edge.target === nodeId) {
        neighborId = edge.source;
      }

      if (neighborId) {
        const neighbor = graph.nodes.get(neighborId);
        if (neighbor) {
          const current = communities.get(neighbor.community) || 0;
          communities.set(neighbor.community, current + edge.weight);
        }
      }
    }

    return communities;
  }

  private calculateDeltaModularity(
    graph: Graph,
    node: Node,
    oldCommunity: number,
    newCommunity: number,
    edgeWeightToNew: number
  ): number {
    const m = graph.totalWeight;
    if (m === 0) return 0;

    const ki = node.degree;
    const resolution = this.config.resolution;

    // Weight to old community (excluding self)
    let edgeWeightToOld = 0;
    for (const edge of graph.edges) {
      if (edge.source === node.id || edge.target === node.id) {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const other = graph.nodes.get(otherId);
        if (other && other.community === oldCommunity && other.id !== node.id) {
          edgeWeightToOld += edge.weight;
        }
      }
    }

    const sumTotOld = (graph.communityWeights.get(oldCommunity) || 0) - ki;
    const sumTotNew = graph.communityWeights.get(newCommunity) || 0;

    // Delta Q formula
    const removeFromOld = -edgeWeightToOld / m + (resolution * ki * sumTotOld) / (2 * m * m);
    const addToNew = edgeWeightToNew / m - (resolution * ki * sumTotNew) / (2 * m * m);

    return removeFromOld + addToNew;
  }

  private moveNode(graph: Graph, node: Node, oldCommunity: number, newCommunity: number): void {
    // Update community weights
    const oldWeight = graph.communityWeights.get(oldCommunity) || 0;
    graph.communityWeights.set(oldCommunity, oldWeight - node.degree);

    const newWeight = graph.communityWeights.get(newCommunity) || 0;
    graph.communityWeights.set(newCommunity, newWeight + node.degree);

    // Update node's community
    node.community = newCommunity;
  }

  private calculateModularity(graph: Graph): number {
    const m = graph.totalWeight;
    if (m === 0) return 0;

    let Q = 0;
    const resolution = this.config.resolution;

    for (const edge of graph.edges) {
      const sourceNode = graph.nodes.get(edge.source);
      const targetNode = graph.nodes.get(edge.target);

      if (sourceNode && targetNode && sourceNode.community === targetNode.community) {
        const ki = sourceNode.degree;
        const kj = targetNode.degree;
        Q += edge.weight - (resolution * ki * kj) / (2 * m);
      }
    }

    return Q / (2 * m);
  }

  private aggregateGraph(
    nodes: string[],
    edges: Edge[],
    communities: Map<string, number>
  ): { nodes: string[]; edges: Edge[] } {
    const communityEdges = new Map<string, number>();
    const uniqueCommunities = new Set<number>();

    // Get unique communities
    for (const community of communities.values()) {
      uniqueCommunities.add(community);
    }

    // Aggregate edges
    for (const edge of edges) {
      const sourceCommunity = communities.get(edge.source);
      const targetCommunity = communities.get(edge.target);

      if (sourceCommunity !== undefined && targetCommunity !== undefined) {
        const key = sourceCommunity <= targetCommunity
          ? `${sourceCommunity}-${targetCommunity}`
          : `${targetCommunity}-${sourceCommunity}`;

        communityEdges.set(key, (communityEdges.get(key) || 0) + edge.weight);
      }
    }

    // Convert to new format
    const newNodes = Array.from(uniqueCommunities).map((c) => `community_${c}`);
    const newEdges: Edge[] = [];

    for (const [key, weight] of communityEdges) {
      const [source, target] = key.split('-');
      newEdges.push({
        source: `community_${source}`,
        target: `community_${target}`,
        weight,
      });
    }

    return { nodes: newNodes, edges: newEdges };
  }

  private shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

// =============================================================================
// Community Detection Service
// =============================================================================

export class CommunityDetectionService {
  private config: CommunityDetectionConfig;

  constructor(
    private supabase: SupabaseClient,
    config?: Partial<CommunityDetectionConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect communities in a knowledge graph
   */
  async detectCommunities(
    graphId: string,
    userId: string,
    config?: Partial<CommunityDetectionConfig>
  ): Promise<DetectionResult> {
    const startTime = Date.now();
    const finalConfig = { ...this.config, ...config };

    // Create run record
    const { data: run, error: runError } = await this.supabase
      .from('graph_community_runs')
      .insert({
        graph_id: graphId,
        user_id: userId,
        algorithm: finalConfig.algorithm,
        resolution: finalConfig.resolution,
        min_community_size: finalConfig.minCommunitySize,
        max_levels: finalConfig.maxLevels,
        status: 'running',
      })
      .select()
      .single();

    if (runError) {
      throw new Error(`Failed to create run: ${runError.message}`);
    }

    try {
      // Load graph data
      const { nodes, edges } = await this.loadGraph(graphId);

      if (nodes.length === 0) {
        throw new Error('Graph has no entities');
      }

      // Run detection algorithm
      const louvain = new LouvainAlgorithm(finalConfig);
      const { levels, modularity } = louvain.detectHierarchical(nodes, edges);

      // Convert to Community objects and save
      const communities = await this.saveCommunities(
        graphId,
        nodes,
        levels,
        finalConfig.minCommunitySize
      );

      // Update run record
      const processingMs = Date.now() - startTime;
      await this.supabase
        .from('graph_community_runs')
        .update({
          status: 'completed',
          communities_detected: communities.length,
          levels_created: levels.length,
          modularity_score: modularity,
          processing_ms: processingMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id);

      return {
        communities,
        modularity,
        levels: levels.length,
        processingMs,
        runId: run.id,
      };
    } catch (error) {
      // Update run with error
      await this.supabase
        .from('graph_community_runs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id);

      throw error;
    }
  }

  /**
   * Load graph data from database
   */
  private async loadGraph(graphId: string): Promise<{ nodes: string[]; edges: Edge[] }> {
    // Load entities
    const { data: entities, error: entitiesError } = await this.supabase
      .from('graph_entities')
      .select('id')
      .eq('graph_id', graphId);

    if (entitiesError) {
      throw new Error(`Failed to load entities: ${entitiesError.message}`);
    }

    const nodes = (entities || []).map((e) => e.id);

    // Load relations
    const { data: relations, error: relationsError } = await this.supabase
      .from('graph_relations')
      .select('source_entity_id, target_entity_id, confidence')
      .eq('graph_id', graphId);

    if (relationsError) {
      throw new Error(`Failed to load relations: ${relationsError.message}`);
    }

    const edges: Edge[] = (relations || []).map((r) => ({
      source: r.source_entity_id,
      target: r.target_entity_id,
      weight: r.confidence || 1.0,
    }));

    return { nodes, edges };
  }

  /**
   * Save communities to database
   */
  private async saveCommunities(
    graphId: string,
    nodes: string[],
    levels: Array<Map<string, number>>,
    minSize: number
  ): Promise<Community[]> {
    const communities: Community[] = [];
    const communityIdMap = new Map<string, string>(); // "level-number" -> uuid

    // Delete existing communities for this graph
    await this.supabase
      .from('graph_communities')
      .delete()
      .eq('graph_id', graphId);

    // Process each level
    for (let level = 0; level < levels.length; level++) {
      const levelCommunities = levels[level];
      const byCommunity = new Map<number, string[]>();

      // Group nodes by community
      for (const [nodeId, communityNum] of levelCommunities) {
        const members = byCommunity.get(communityNum) || [];
        members.push(nodeId);
        byCommunity.set(communityNum, members);
      }

      // Create community records
      for (const [communityNum, members] of byCommunity) {
        if (members.length < minSize) continue;

        // Resolve actual entity IDs (handle aggregated nodes)
        const entityIds = this.resolveEntityIds(members, nodes, levels, level);

        if (entityIds.length < minSize) continue;

        // Find parent community (from previous level)
        let parentId: string | undefined;
        if (level > 0) {
          const prevLevel = levels[level - 1];
          const firstMember = members[0];
          const parentNum = prevLevel.get(firstMember);
          if (parentNum !== undefined) {
            parentId = communityIdMap.get(`${level - 1}-${parentNum}`);
          }
        }

        // Insert community
        const { data, error } = await this.supabase
          .from('graph_communities')
          .insert({
            graph_id: graphId,
            community_number: communityNum,
            level,
            parent_community_id: parentId,
            member_count: entityIds.length,
          })
          .select()
          .single();

        if (error) {
          console.error(`Failed to insert community: ${error.message}`);
          continue;
        }

        communityIdMap.set(`${level}-${communityNum}`, data.id);

        // Insert memberships
        const memberships = entityIds.map((entityId) => ({
          community_id: data.id,
          entity_id: entityId,
          membership_score: 1.0,
        }));

        if (memberships.length > 0) {
          await this.supabase
            .from('graph_community_members')
            .upsert(memberships, { onConflict: 'community_id,entity_id' });
        }

        communities.push({
          id: data.id,
          number: communityNum,
          level,
          parentId,
          members: entityIds,
          density: 0, // Will be calculated by trigger
          modularityContribution: 0,
          avgDegree: 0,
        });
      }
    }

    return communities;
  }

  /**
   * Resolve aggregated community nodes back to original entity IDs
   */
  private resolveEntityIds(
    members: string[],
    originalNodes: string[],
    levels: Array<Map<string, number>>,
    currentLevel: number
  ): string[] {
    if (currentLevel === 0) {
      return members.filter((m) => originalNodes.includes(m));
    }

    // For aggregated levels, trace back to original nodes
    const entityIds: string[] = [];

    for (const member of members) {
      if (member.startsWith('community_')) {
        const communityNum = parseInt(member.replace('community_', ''), 10);
        const prevLevel = levels[currentLevel - 1];

        // Find all nodes in this aggregated community
        for (const [nodeId, num] of prevLevel) {
          if (num === communityNum) {
            const resolved = this.resolveEntityIds([nodeId], originalNodes, levels, currentLevel - 1);
            entityIds.push(...resolved);
          }
        }
      } else if (originalNodes.includes(member)) {
        entityIds.push(member);
      }
    }

    return [...new Set(entityIds)];
  }

  /**
   * Get community by ID
   */
  async getCommunity(communityId: string): Promise<Community | null> {
    const { data, error } = await this.supabase
      .from('graph_communities')
      .select('*, members:graph_community_members(entity_id)')
      .eq('id', communityId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      number: data.community_number,
      level: data.level,
      parentId: data.parent_community_id,
      members: data.members.map((m: { entity_id: string }) => m.entity_id),
      density: data.density || 0,
      modularityContribution: data.modularity_contribution || 0,
      avgDegree: data.avg_degree || 0,
    };
  }

  /**
   * Get communities for a graph
   */
  async getCommunities(
    graphId: string,
    options?: { level?: number; minMembers?: number }
  ): Promise<Community[]> {
    let query = this.supabase
      .from('graph_communities')
      .select('*, members:graph_community_members(entity_id)')
      .eq('graph_id', graphId)
      .order('level')
      .order('member_count', { ascending: false });

    if (options?.level !== undefined) {
      query = query.eq('level', options.level);
    }

    if (options?.minMembers) {
      query = query.gte('member_count', options.minMembers);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get communities: ${error.message}`);
    }

    return (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      number: c.community_number,
      level: c.level,
      parentId: c.parent_community_id,
      members: c.members.map((m: { entity_id: string }) => m.entity_id),
      density: c.density || 0,
      modularityContribution: c.modularity_contribution || 0,
      avgDegree: c.avg_degree || 0,
    }));
  }

  /**
   * Update config
   */
  setConfig(config: Partial<CommunityDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createCommunityDetectionService(
  supabase: SupabaseClient,
  config?: Partial<CommunityDetectionConfig>
): CommunityDetectionService {
  return new CommunityDetectionService(supabase, config);
}
