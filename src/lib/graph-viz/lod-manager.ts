/**
 * Level of Detail (LOD) Manager
 *
 * Manages rendering quality based on zoom level and node count.
 * Reduces detail at lower zoom levels for better performance.
 *
 * @module lib/graph-viz/lod-manager
 */

import type {
  LODLevel,
  LODConfig,
  GraphNode,
  GraphEdge,
} from './types';

// =============================================================================
// Default LOD Levels
// =============================================================================

export const DEFAULT_LOD_LEVELS: LODLevel[] = [
  {
    // Level 0: Highest detail (zoomed in)
    zoomThreshold: 0.8,
    showLabels: true,
    showEdgeLabels: true,
    minNodeSize: 0,
    minEdgeWeight: 0,
    nodeQuality: 1,
  },
  {
    // Level 1: Medium detail
    zoomThreshold: 0.5,
    showLabels: true,
    showEdgeLabels: false,
    minNodeSize: 5,
    minEdgeWeight: 0.2,
    nodeQuality: 0.8,
  },
  {
    // Level 2: Low detail
    zoomThreshold: 0.2,
    showLabels: false,
    showEdgeLabels: false,
    minNodeSize: 8,
    minEdgeWeight: 0.5,
    nodeQuality: 0.5,
  },
  {
    // Level 3: Minimal detail (zoomed out)
    zoomThreshold: 0,
    showLabels: false,
    showEdgeLabels: false,
    minNodeSize: 10,
    minEdgeWeight: 0.8,
    nodeQuality: 0.3,
  },
];

// =============================================================================
// LOD Manager Class
// =============================================================================

export class LODManager {
  private config: LODConfig;
  private currentZoom: number = 1;
  private nodeCount: number = 0;
  private listeners: Set<(level: LODLevel) => void> = new Set();

  constructor(config?: Partial<LODConfig>) {
    this.config = {
      levels: config?.levels || DEFAULT_LOD_LEVELS,
      currentLevel: config?.currentLevel ?? 0,
    };
  }

  /**
   * Get current LOD level
   */
  getCurrentLevel(): LODLevel {
    return this.config.levels[this.config.currentLevel];
  }

  /**
   * Get current level index
   */
  getCurrentLevelIndex(): number {
    return this.config.currentLevel;
  }

  /**
   * Update LOD based on zoom level
   */
  updateZoom(zoom: number): void {
    this.currentZoom = zoom;
    this.updateLevel();
  }

  /**
   * Update LOD based on node count
   */
  updateNodeCount(count: number): void {
    this.nodeCount = count;
    this.updateLevel();
  }

  /**
   * Calculate appropriate LOD level
   */
  private updateLevel(): void {
    const oldLevel = this.config.currentLevel;

    // Find appropriate level based on zoom
    let newLevel = 0;
    for (let i = 0; i < this.config.levels.length; i++) {
      if (this.currentZoom >= this.config.levels[i].zoomThreshold) {
        newLevel = i;
        break;
      }
      newLevel = i;
    }

    // Adjust based on node count (reduce quality for large graphs)
    if (this.nodeCount > 1000) {
      newLevel = Math.min(newLevel + 1, this.config.levels.length - 1);
    }
    if (this.nodeCount > 5000) {
      newLevel = Math.min(newLevel + 1, this.config.levels.length - 1);
    }

    if (newLevel !== oldLevel) {
      this.config.currentLevel = newLevel;
      this.notifyListeners();
    }
  }

  /**
   * Filter nodes based on current LOD
   */
  filterNodes(nodes: GraphNode[]): GraphNode[] {
    const level = this.getCurrentLevel();

    return nodes.filter((node) => {
      const size = node.size || 10;
      return size >= level.minNodeSize;
    });
  }

  /**
   * Filter edges based on current LOD
   */
  filterEdges(edges: GraphEdge[]): GraphEdge[] {
    const level = this.getCurrentLevel();

    return edges.filter((edge) => {
      const weight = edge.weight || 1;
      return weight >= level.minEdgeWeight;
    });
  }

  /**
   * Get render settings for current LOD
   */
  getRenderSettings(): {
    showLabels: boolean;
    showEdgeLabels: boolean;
    nodeQuality: number;
    useSimplifiedRendering: boolean;
  } {
    const level = this.getCurrentLevel();

    return {
      showLabels: level.showLabels,
      showEdgeLabels: level.showEdgeLabels,
      nodeQuality: level.nodeQuality,
      useSimplifiedRendering: level.nodeQuality < 0.5,
    };
  }

  /**
   * Subscribe to LOD changes
   */
  onLevelChange(callback: (level: LODLevel) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners of level change
   */
  private notifyListeners(): void {
    const level = this.getCurrentLevel();
    for (const listener of this.listeners) {
      listener(level);
    }
  }

  /**
   * Get all LOD levels
   */
  getLevels(): LODLevel[] {
    return [...this.config.levels];
  }

  /**
   * Set custom LOD levels
   */
  setLevels(levels: LODLevel[]): void {
    this.config.levels = levels;
    this.updateLevel();
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createLODManager(config?: Partial<LODConfig>): LODManager {
  return new LODManager(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate optimal LOD based on viewport and node count
 */
export function calculateOptimalLOD(
  zoom: number,
  nodeCount: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  // Base LOD on zoom
  let lod = zoom >= 0.8 ? 0 : zoom >= 0.5 ? 1 : zoom >= 0.2 ? 2 : 3;

  // Adjust for node density
  const viewportArea = viewportWidth * viewportHeight;
  const density = nodeCount / viewportArea;

  if (density > 0.001) lod = Math.min(lod + 1, 3);
  if (density > 0.005) lod = Math.min(lod + 1, 3);

  return lod;
}

/**
 * Simplify node for low LOD rendering
 */
export function simplifyNodeForLOD(
  node: GraphNode,
  lodLevel: number
): GraphNode {
  if (lodLevel <= 1) return node;

  return {
    ...node,
    // Remove detailed data at low LOD
    data: lodLevel >= 2 ? undefined : node.data,
    // Simplify to basic properties
  };
}
