/**
 * Seizn Winter - Graph Builder
 *
 * Builds graph data structures from various data sources.
 * Supports permission graphs, federated source graphs, and hybrid graphs.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  GraphNode,
  GraphEdge,
  GraphData,
  GraphMetadata,
  GraphNodeType,
  GraphEdgeType,
  GraphFilter,
  GraphQueryOptions,
  NodeStatus,
  Permission,
  PermissionLevel,
  GraphStats,
  GraphNodeStyle,
  GraphEdgeStyle,
} from './types';

// ============================================
// Node Style Defaults
// ============================================

const DEFAULT_NODE_STYLES: Record<GraphNodeType, GraphNodeStyle> = {
  user: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
    icon: 'user',
    size: 'medium',
  },
  role: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
    icon: 'shield',
    size: 'medium',
  },
  group: {
    backgroundColor: '#E0E7FF',
    borderColor: '#4F46E5',
    icon: 'users',
    size: 'medium',
  },
  collection: {
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
    icon: 'folder',
    size: 'large',
  },
  document: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
    icon: 'document',
    size: 'small',
  },
  chunk: {
    backgroundColor: '#F3E8FF',
    borderColor: '#9333EA',
    icon: 'cube',
    size: 'small',
  },
  source: {
    backgroundColor: '#CFFAFE',
    borderColor: '#0891B2',
    icon: 'database',
    size: 'large',
  },
  policy: {
    backgroundColor: '#FED7AA',
    borderColor: '#EA580C',
    icon: 'clipboard',
    size: 'medium',
  },
  organization: {
    backgroundColor: '#FBCFE8',
    borderColor: '#DB2777',
    icon: 'building',
    size: 'large',
  },
  service: {
    backgroundColor: '#E5E7EB',
    borderColor: '#6B7280',
    icon: 'server',
    size: 'medium',
  },
  custom: {
    backgroundColor: '#F3F4F6',
    borderColor: '#9CA3AF',
    icon: 'circle',
    size: 'medium',
  },
};

const DEFAULT_EDGE_STYLES: Record<GraphEdgeType, GraphEdgeStyle> = {
  permission: {
    strokeColor: '#0284C7',
    strokeWidth: 2,
    markerEnd: 'arrowclosed',
  },
  membership: {
    strokeColor: '#059669',
    strokeWidth: 2,
    strokeStyle: 'solid',
    markerEnd: 'arrow',
  },
  inheritance: {
    strokeColor: '#D97706',
    strokeWidth: 2,
    strokeStyle: 'dashed',
    markerEnd: 'arrow',
  },
  reference: {
    strokeColor: '#6B7280',
    strokeWidth: 1,
    strokeStyle: 'dotted',
  },
  dependency: {
    strokeColor: '#DC2626',
    strokeWidth: 2,
    markerEnd: 'arrowclosed',
  },
  federation: {
    strokeColor: '#0891B2',
    strokeWidth: 3,
    animated: true,
    markerEnd: 'arrowclosed',
  },
  data_flow: {
    strokeColor: '#9333EA',
    strokeWidth: 2,
    animated: true,
    markerEnd: 'arrow',
  },
  custom: {
    strokeColor: '#9CA3AF',
    strokeWidth: 1,
  },
};

// ============================================
// Graph Builder Class
// ============================================

export class GraphBuilder {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private metadata: Partial<GraphMetadata> = {};

  constructor(options?: { name?: string; description?: string }) {
    this.metadata = {
      id: crypto.randomUUID(),
      name: options?.name || 'Untitled Graph',
      description: options?.description,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  // ============================================
  // Node Operations
  // ============================================

  /**
   * Add a node to the graph
   */
  addNode(node: Omit<GraphNode, 'style'> & { style?: Partial<GraphNodeStyle> }): this {
    const fullNode: GraphNode = {
      ...node,
      style: {
        ...DEFAULT_NODE_STYLES[node.type],
        ...node.style,
      },
    };
    this.nodes.set(node.id, fullNode);
    return this;
  }

  /**
   * Add multiple nodes
   */
  addNodes(nodes: Array<Omit<GraphNode, 'style'> & { style?: Partial<GraphNodeStyle> }>): this {
    nodes.forEach((node) => this.addNode(node));
    return this;
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Update a node
   */
  updateNode(id: string, updates: Partial<GraphNode>): this {
    const existing = this.nodes.get(id);
    if (existing) {
      this.nodes.set(id, { ...existing, ...updates, updatedAt: new Date().toISOString() });
    }
    return this;
  }

  /**
   * Remove a node and its connected edges
   */
  removeNode(id: string): this {
    this.nodes.delete(id);
    // Remove connected edges
    for (const [edgeId, edge] of this.edges) {
      if (edge.source === id || edge.target === id) {
        this.edges.delete(edgeId);
      }
    }
    return this;
  }

  // ============================================
  // Edge Operations
  // ============================================

  /**
   * Add an edge to the graph
   */
  addEdge(edge: Omit<GraphEdge, 'style'> & { style?: Partial<GraphEdgeStyle> }): this {
    const fullEdge: GraphEdge = {
      ...edge,
      style: {
        ...DEFAULT_EDGE_STYLES[edge.type],
        ...edge.style,
      },
    };
    this.edges.set(edge.id, fullEdge);
    return this;
  }

  /**
   * Add multiple edges
   */
  addEdges(edges: Array<Omit<GraphEdge, 'style'> & { style?: Partial<GraphEdgeStyle> }>): this {
    edges.forEach((edge) => this.addEdge(edge));
    return this;
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Update an edge
   */
  updateEdge(id: string, updates: Partial<GraphEdge>): this {
    const existing = this.edges.get(id);
    if (existing) {
      this.edges.set(id, { ...existing, ...updates });
    }
    return this;
  }

  /**
   * Remove an edge
   */
  removeEdge(id: string): this {
    this.edges.delete(id);
    return this;
  }

  /**
   * Get edges connected to a node
   */
  getNodeEdges(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter(
      (edge) => edge.source === nodeId || edge.target === nodeId
    );
  }

  // ============================================
  // Permission Edge Helpers
  // ============================================

  /**
   * Add a permission edge between nodes
   */
  addPermissionEdge(
    sourceId: string,
    targetId: string,
    level: PermissionLevel,
    options?: {
      label?: string;
      metadata?: Record<string, unknown>;
    }
  ): this {
    const id = `perm_${sourceId}_${targetId}`;
    return this.addEdge({
      id,
      source: sourceId,
      target: targetId,
      type: 'permission',
      direction: 'directed',
      label: options?.label || level,
      permissionLevel: level,
      metadata: options?.metadata || {},
      style: {
        ...DEFAULT_EDGE_STYLES.permission,
        strokeWidth: this.getPermissionStrokeWidth(level),
      },
    });
  }

  /**
   * Get stroke width based on permission level
   */
  private getPermissionStrokeWidth(level: PermissionLevel): number {
    switch (level) {
      case 'owner':
        return 4;
      case 'admin':
        return 3;
      case 'write':
        return 2;
      case 'read':
        return 1.5;
      default:
        return 1;
    }
  }

  // ============================================
  // Build and Export
  // ============================================

  /**
   * Calculate graph statistics
   */
  private calculateStats(): GraphStats {
    const nodesByType: Partial<Record<GraphNodeType, number>> = {};
    const edgesByType: Partial<Record<GraphEdgeType, number>> = {};

    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    for (const edge of this.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodesByType: nodesByType as Record<GraphNodeType, number>,
      edgesByType: edgesByType as Record<GraphEdgeType, number>,
    };
  }

  /**
   * Build the final graph data structure
   */
  build(): GraphData {
    const stats = this.calculateStats();

    const metadata: GraphMetadata = {
      id: this.metadata.id || crypto.randomUUID(),
      name: this.metadata.name || 'Untitled Graph',
      description: this.metadata.description,
      type: this.metadata.type || 'custom',
      rootNodeId: this.metadata.rootNodeId,
      layout: this.metadata.layout || { type: 'dagre' },
      generatedAt: new Date().toISOString(),
      version: this.metadata.version || 1,
      stats,
    };

    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      metadata,
    };
  }

  /**
   * Set graph metadata
   */
  setMetadata(metadata: Partial<GraphMetadata>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  /**
   * Clear all nodes and edges
   */
  clear(): this {
    this.nodes.clear();
    this.edges.clear();
    return this;
  }
}

// ============================================
// Database Integration
// ============================================

/**
 * Build a permission graph from database data
 */
export async function buildPermissionGraph(
  userId: string,
  options?: GraphQueryOptions
): Promise<GraphData> {
  const supabase = createServerClient();
  const builder = new GraphBuilder({
    name: 'Permission Graph',
    description: 'User permissions and access relationships',
  });

  // Fetch user data
  const { data: userData } = await supabase
    .from('users')
    .select('id, email, name, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (userData) {
    builder.addNode({
      id: userData.id,
      type: 'user',
      label: userData.name || userData.email,
      description: userData.email,
      status: 'active',
      metadata: { email: userData.email },
      permissions: [],
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
    });
  }

  // Fetch user's organizations
  const { data: orgMembers } = await supabase
    .from('winter_org_members')
    .select(
      `
      org_id,
      role,
      organizations:winter_organizations(id, name, created_at, updated_at)
    `
    )
    .eq('user_id', userId);

  if (orgMembers) {
    for (const member of orgMembers) {
      const org = member.organizations as unknown as {
        id: string;
        name: string;
        created_at: string;
        updated_at: string;
      };

      if (org) {
        builder.addNode({
          id: org.id,
          type: 'organization',
          label: org.name,
          status: 'active',
          metadata: {},
          permissions: [],
          createdAt: org.created_at,
          updatedAt: org.updated_at,
        });

        builder.addEdge({
          id: `membership_${userId}_${org.id}`,
          source: userId,
          target: org.id,
          type: 'membership',
          direction: 'directed',
          label: member.role,
          metadata: { role: member.role },
        });
      }
    }
  }

  // Fetch user's collections
  const { data: collections } = await supabase
    .from('summer_collections')
    .select('id, name, created_at, updated_at')
    .eq('user_id', userId);

  if (collections) {
    for (const collection of collections) {
      builder.addNode({
        id: collection.id,
        type: 'collection',
        label: collection.name,
        status: 'active',
        metadata: {},
        permissions: [],
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
      });

      builder.addPermissionEdge(userId, collection.id, 'owner', {
        label: 'Owner',
      });
    }
  }

  builder.setMetadata({
    type: 'permission',
    rootNodeId: userId,
  });

  return builder.build();
}

/**
 * Build a federated source graph
 */
export async function buildFederatedGraph(
  userId: string,
  options?: GraphQueryOptions
): Promise<GraphData> {
  const supabase = createServerClient();
  const builder = new GraphBuilder({
    name: 'Federated Sources Graph',
    description: 'Connected data sources and federation relationships',
  });

  // Add user as root
  const { data: userData } = await supabase
    .from('users')
    .select('id, email, name, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (userData) {
    builder.addNode({
      id: userData.id,
      type: 'user',
      label: userData.name || userData.email,
      status: 'active',
      metadata: {},
      permissions: [],
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
    });
  }

  // Fetch federated sources
  const { data: sources } = await supabase
    .from('summer_federated_sources')
    .select('*')
    .eq('user_id', userId);

  if (sources) {
    for (const source of sources) {
      const status: NodeStatus = source.is_active ? 'active' : 'inactive';

      builder.addNode({
        id: source.id,
        type: 'source',
        label: source.name || source.provider,
        description: `Provider: ${source.provider}`,
        status,
        metadata: {
          provider: source.provider,
          capabilities: source.capabilities,
        },
        permissions: [],
        sourceId: source.id,
        createdAt: source.created_at,
        updatedAt: source.updated_at,
      });

      builder.addEdge({
        id: `fed_${userId}_${source.id}`,
        source: userId,
        target: source.id,
        type: 'federation',
        direction: 'directed',
        label: 'Connected',
        animated: source.is_active,
        metadata: { provider: source.provider },
      });
    }
  }

  // Fetch collections and their bindings
  const { data: bindings } = await supabase
    .from('summer_federated_bindings')
    .select(
      `
      id,
      collection_id,
      source_id,
      remote_collection,
      policy,
      collections:summer_collections(id, name, user_id)
    `
    )
    .eq('collections.user_id', userId);

  if (bindings) {
    const addedCollections = new Set<string>();

    for (const binding of bindings) {
      const collection = binding.collections as unknown as {
        id: string;
        name: string;
        user_id: string;
      };

      if (collection && !addedCollections.has(collection.id)) {
        builder.addNode({
          id: collection.id,
          type: 'collection',
          label: collection.name,
          status: 'active',
          metadata: {},
          permissions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        addedCollections.add(collection.id);
      }

      if (collection) {
        builder.addEdge({
          id: `binding_${binding.id}`,
          source: collection.id,
          target: binding.source_id,
          type: 'data_flow',
          direction: 'bidirectional',
          label: binding.remote_collection || 'Bound',
          animated: true,
          metadata: {
            remoteCollection: binding.remote_collection,
            policy: binding.policy,
          },
        });
      }
    }
  }

  builder.setMetadata({
    type: 'federated',
    rootNodeId: userId,
  });

  return builder.build();
}

/**
 * Apply filters to graph data
 */
export function filterGraphData(graph: GraphData, filter: GraphFilter): GraphData {
  let filteredNodes = [...graph.nodes];
  let filteredEdges = [...graph.edges];

  // Filter by node types
  if (filter.nodeTypes && filter.nodeTypes.length > 0) {
    filteredNodes = filteredNodes.filter((node) => filter.nodeTypes!.includes(node.type));
  }

  // Filter by status
  if (filter.status && filter.status.length > 0) {
    filteredNodes = filteredNodes.filter((node) => filter.status!.includes(node.status));
  }

  // Filter by source IDs
  if (filter.sourceIds && filter.sourceIds.length > 0) {
    filteredNodes = filteredNodes.filter(
      (node) => !node.sourceId || filter.sourceIds!.includes(node.sourceId)
    );
  }

  // Filter by search term
  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    filteredNodes = filteredNodes.filter(
      (node) =>
        node.label.toLowerCase().includes(searchLower) ||
        node.description?.toLowerCase().includes(searchLower)
    );
  }

  // Filter by included/excluded node IDs
  if (filter.includeNodeIds && filter.includeNodeIds.length > 0) {
    filteredNodes = filteredNodes.filter((node) => filter.includeNodeIds!.includes(node.id));
  }

  if (filter.excludeNodeIds && filter.excludeNodeIds.length > 0) {
    filteredNodes = filteredNodes.filter((node) => !filter.excludeNodeIds!.includes(node.id));
  }

  // Get remaining node IDs for edge filtering
  const remainingNodeIds = new Set(filteredNodes.map((n) => n.id));

  // Filter edges to only include those between remaining nodes
  filteredEdges = filteredEdges.filter(
    (edge) => remainingNodeIds.has(edge.source) && remainingNodeIds.has(edge.target)
  );

  // Filter by edge types
  if (filter.edgeTypes && filter.edgeTypes.length > 0) {
    filteredEdges = filteredEdges.filter((edge) => filter.edgeTypes!.includes(edge.type));
  }

  // Filter by permission levels
  if (filter.permissionLevels && filter.permissionLevels.length > 0) {
    filteredEdges = filteredEdges.filter(
      (edge) => !edge.permissionLevel || filter.permissionLevels!.includes(edge.permissionLevel)
    );
  }

  return {
    ...graph,
    nodes: filteredNodes,
    edges: filteredEdges,
    metadata: {
      ...graph.metadata,
      stats: {
        ...graph.metadata.stats,
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length,
      },
    },
  };
}
