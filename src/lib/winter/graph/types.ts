/**
 * Seizn Winter - Graph Data Structure Types
 *
 * Types for Graph UI with Federated and Permission Graph features.
 * Used for visualizing data relationships, access permissions, and federated source connections.
 */

// ============================================
// Permission Types
// ============================================

/**
 * Permission levels in ascending order of access
 */
export type PermissionLevel = 'none' | 'read' | 'write' | 'admin' | 'owner';

/**
 * Permission level hierarchy values for comparison
 */
export const PermissionLevelValue: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
  owner: 4,
};

/**
 * Permission scope defines where the permission applies
 */
export type PermissionScope = 'node' | 'subtree' | 'collection' | 'global';

/**
 * Permission inheritance mode
 */
export type InheritanceMode = 'inherit' | 'override' | 'merge';

/**
 * Individual permission entry
 */
export interface Permission {
  /** Unique identifier for this permission */
  id: string;
  /** Subject ID (user, role, or group) */
  subjectId: string;
  /** Subject type */
  subjectType: 'user' | 'role' | 'group' | 'service';
  /** Permission level granted */
  level: PermissionLevel;
  /** Scope of the permission */
  scope: PermissionScope;
  /** How this permission interacts with inherited permissions */
  inheritance: InheritanceMode;
  /** Conditions for this permission (e.g., time-based, IP-based) */
  conditions?: PermissionCondition[];
  /** When this permission was granted */
  grantedAt: string;
  /** When this permission expires (null = never) */
  expiresAt?: string | null;
  /** Who granted this permission */
  grantedBy?: string;
}

/**
 * Condition for conditional permissions
 */
export interface PermissionCondition {
  type: 'time_range' | 'ip_range' | 'mfa_required' | 'custom';
  config: Record<string, unknown>;
}

/**
 * Effective permission after resolving inheritance
 */
export interface EffectivePermission {
  level: PermissionLevel;
  source: 'direct' | 'inherited' | 'role' | 'group' | 'default';
  /** The permission entry that granted this level */
  sourcePermission?: Permission;
  /** Path of inheritance if inherited */
  inheritancePath?: string[];
}

// ============================================
// Graph Node Types
// ============================================

/**
 * Node type categories
 */
export type GraphNodeType =
  | 'user'
  | 'role'
  | 'group'
  | 'collection'
  | 'document'
  | 'chunk'
  | 'source'
  | 'policy'
  | 'organization'
  | 'service'
  | 'custom';

/**
 * Node status for visual indication
 */
export type NodeStatus = 'active' | 'inactive' | 'pending' | 'error' | 'syncing';

/**
 * Graph node representing an entity in the system
 */
export interface GraphNode {
  /** Unique node identifier */
  id: string;
  /** Node type for categorization and rendering */
  type: GraphNodeType;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Node status */
  status: NodeStatus;
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Direct permissions on this node */
  permissions: Permission[];
  /** Position for layout (managed by React Flow) */
  position?: {
    x: number;
    y: number;
  };
  /** Visual styling */
  style?: GraphNodeStyle;
  /** Whether this node is expanded (for hierarchical views) */
  expanded?: boolean;
  /** Parent node ID (for hierarchical graphs) */
  parentId?: string | null;
  /** Source identifier for federated nodes */
  sourceId?: string;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * Visual styling for nodes
 */
export interface GraphNodeStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  icon?: string;
  iconColor?: string;
  opacity?: number;
  size?: 'small' | 'medium' | 'large';
}

// ============================================
// Graph Edge Types
// ============================================

/**
 * Edge type categories
 */
export type GraphEdgeType =
  | 'permission'
  | 'membership'
  | 'inheritance'
  | 'reference'
  | 'dependency'
  | 'federation'
  | 'data_flow'
  | 'custom';

/**
 * Edge direction
 */
export type EdgeDirection = 'directed' | 'undirected' | 'bidirectional';

/**
 * Graph edge representing a relationship between nodes
 */
export interface GraphEdge {
  /** Unique edge identifier */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge type */
  type: GraphEdgeType;
  /** Display label */
  label?: string;
  /** Edge direction */
  direction: EdgeDirection;
  /** Relationship strength or weight (0-1) */
  weight?: number;
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Visual styling */
  style?: GraphEdgeStyle;
  /** Whether this edge is animated */
  animated?: boolean;
  /** Permission level this edge represents (for permission edges) */
  permissionLevel?: PermissionLevel;
}

/**
 * Visual styling for edges
 */
export interface GraphEdgeStyle {
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  animated?: boolean;
  opacity?: number;
  markerEnd?: 'arrow' | 'arrowclosed' | 'none';
  markerStart?: 'arrow' | 'arrowclosed' | 'none';
}

// ============================================
// Graph Data Structure
// ============================================

/**
 * Complete graph data structure
 */
export interface GraphData {
  /** All nodes in the graph */
  nodes: GraphNode[];
  /** All edges in the graph */
  edges: GraphEdge[];
  /** Graph metadata */
  metadata: GraphMetadata;
}

/**
 * Graph metadata
 */
export interface GraphMetadata {
  /** Graph identifier */
  id: string;
  /** Graph name */
  name: string;
  /** Graph description */
  description?: string;
  /** Graph type */
  type: 'permission' | 'federated' | 'hybrid' | 'custom';
  /** Root node ID (for hierarchical graphs) */
  rootNodeId?: string;
  /** Layout algorithm used */
  layout?: GraphLayout;
  /** When this graph was generated */
  generatedAt: string;
  /** Version for caching */
  version: number;
  /** Total statistics */
  stats: GraphStats;
}

/**
 * Graph layout options
 */
export interface GraphLayout {
  type: 'dagre' | 'elk' | 'force' | 'tree' | 'radial' | 'manual';
  options?: Record<string, unknown>;
}

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<GraphNodeType, number>;
  edgesByType: Record<GraphEdgeType, number>;
  maxDepth?: number;
  connectedComponents?: number;
}

// ============================================
// Query and Filter Types
// ============================================

/**
 * Filter for querying graph data
 */
export interface GraphFilter {
  /** Filter by node types */
  nodeTypes?: GraphNodeType[];
  /** Filter by edge types */
  edgeTypes?: GraphEdgeType[];
  /** Filter by node status */
  status?: NodeStatus[];
  /** Filter by permission level */
  permissionLevels?: PermissionLevel[];
  /** Filter by source ID (for federated) */
  sourceIds?: string[];
  /** Filter by date range */
  dateRange?: {
    start?: string;
    end?: string;
  };
  /** Search term for labels/descriptions */
  search?: string;
  /** Maximum depth from root */
  maxDepth?: number;
  /** Specific node IDs to include */
  includeNodeIds?: string[];
  /** Specific node IDs to exclude */
  excludeNodeIds?: string[];
}

/**
 * Options for graph queries
 */
export interface GraphQueryOptions {
  /** Filter to apply */
  filter?: GraphFilter;
  /** Include permissions in response */
  includePermissions?: boolean;
  /** Include metadata in response */
  includeMetadata?: boolean;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sorting */
  sortBy?: 'label' | 'createdAt' | 'updatedAt' | 'type';
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// API Response Types
// ============================================

/**
 * Response for graph data queries
 */
export interface GraphDataResponse {
  success: boolean;
  data: GraphData;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Response for node permissions queries
 */
export interface NodePermissionsResponse {
  success: boolean;
  nodeId: string;
  directPermissions: Permission[];
  inheritedPermissions: Permission[];
  effectivePermissions: Record<string, EffectivePermission>;
}
