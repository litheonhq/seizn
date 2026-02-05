/**
 * Graph Data Loader
 *
 * Handles progressive loading of large graphs with pagination
 * and caching for optimal performance.
 *
 * @module lib/graph-viz/graph-data-loader
 */

import type { GraphNode, GraphEdge, GraphData } from './types';

// =============================================================================
// Types
// =============================================================================

export interface LoaderConfig {
  /** Batch size for progressive loading */
  batchSize?: number;
  /** Whether to load edges with nodes */
  loadEdgesWithNodes?: boolean;
  /** Cache TTL in ms */
  cacheTTL?: number;
  /** API base URL */
  apiBaseUrl?: string;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  phase: 'nodes' | 'edges' | 'complete';
  percentage: number;
}

type ProgressCallback = (progress: LoadProgress) => void;

// =============================================================================
// Graph Data Loader
// =============================================================================

export class GraphDataLoader {
  private config: Required<LoaderConfig>;
  private cache: Map<string, { data: GraphData; timestamp: number }> = new Map();
  private loadingPromises: Map<string, Promise<GraphData>> = new Map();

  constructor(config: LoaderConfig = {}) {
    this.config = {
      batchSize: config.batchSize ?? 500,
      loadEdgesWithNodes: config.loadEdgesWithNodes ?? true,
      cacheTTL: config.cacheTTL ?? 5 * 60 * 1000, // 5 minutes
      apiBaseUrl: config.apiBaseUrl ?? '/api/graph',
    };
  }

  /**
   * Load graph data for a user
   */
  async loadGraph(
    userId: string,
    options: {
      onProgress?: ProgressCallback;
      forceRefresh?: boolean;
    } = {}
  ): Promise<GraphData> {
    const cacheKey = `graph:${userId}`;
    const { onProgress, forceRefresh = false } = options;

    // Check cache
    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        onProgress?.({
          loaded: cached.nodes.length + cached.edges.length,
          total: cached.nodes.length + cached.edges.length,
          phase: 'complete',
          percentage: 100,
        });
        return cached;
      }
    }

    // Check if already loading
    const existingPromise = this.loadingPromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Start loading
    const loadPromise = this.loadGraphProgressively(userId, onProgress);
    this.loadingPromises.set(cacheKey, loadPromise);

    try {
      const data = await loadPromise;
      this.setCache(cacheKey, data);
      return data;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Load graph progressively in batches
   */
  private async loadGraphProgressively(
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<GraphData> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // First, get total counts
    const counts = await this.fetchCounts(userId);
    const totalNodes = counts.nodes;
    const totalEdges = counts.edges;
    const total = totalNodes + totalEdges;

    // Load nodes in batches
    let offset = 0;
    while (offset < totalNodes) {
      const batch = await this.fetchNodeBatch(userId, offset, this.config.batchSize);
      nodes.push(...batch);

      onProgress?.({
        loaded: nodes.length,
        total,
        phase: 'nodes',
        percentage: Math.round((nodes.length / total) * 100),
      });

      offset += this.config.batchSize;
    }

    // Load edges in batches
    offset = 0;
    while (offset < totalEdges) {
      const batch = await this.fetchEdgeBatch(userId, offset, this.config.batchSize);
      edges.push(...batch);

      onProgress?.({
        loaded: nodes.length + edges.length,
        total,
        phase: 'edges',
        percentage: Math.round(((nodes.length + edges.length) / total) * 100),
      });

      offset += this.config.batchSize;
    }

    onProgress?.({
      loaded: total,
      total,
      phase: 'complete',
      percentage: 100,
    });

    return { nodes, edges };
  }

  /**
   * Fetch node/edge counts
   */
  private async fetchCounts(userId: string): Promise<{ nodes: number; edges: number }> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/counts?userId=${userId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch counts: ${response.status}`);
      }

      return response.json();
    } catch {
      // Fallback: estimate counts
      return { nodes: 100, edges: 200 };
    }
  }

  /**
   * Fetch a batch of nodes
   */
  private async fetchNodeBatch(
    userId: string,
    offset: number,
    limit: number
  ): Promise<GraphNode[]> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/nodes?userId=${userId}&offset=${offset}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch nodes: ${response.status}`);
      }

      const data = await response.json();
      return data.nodes || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch a batch of edges
   */
  private async fetchEdgeBatch(
    userId: string,
    offset: number,
    limit: number
  ): Promise<GraphEdge[]> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/edges?userId=${userId}&offset=${offset}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch edges: ${response.status}`);
      }

      const data = await response.json();
      return data.edges || [];
    } catch {
      return [];
    }
  }

  /**
   * Load incremental updates
   */
  async loadUpdates(
    userId: string,
    since: Date
  ): Promise<{
    addedNodes: GraphNode[];
    addedEdges: GraphEdge[];
    removedNodeIds: string[];
    removedEdgeIds: string[];
  }> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/updates?userId=${userId}&since=${since.toISOString()}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch updates: ${response.status}`);
      }

      return response.json();
    } catch {
      return {
        addedNodes: [],
        addedEdges: [],
        removedNodeIds: [],
        removedEdgeIds: [],
      };
    }
  }

  /**
   * Load subgraph around a node
   */
  async loadSubgraph(
    nodeId: string,
    depth: number = 2
  ): Promise<GraphData> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/subgraph?nodeId=${nodeId}&depth=${depth}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch subgraph: ${response.status}`);
      }

      return response.json();
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): GraphData | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache(key: string, data: GraphData): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Preload graph data
   */
  preload(userId: string): void {
    // Start loading in background
    this.loadGraph(userId).catch(() => {
      // Silently fail preload
    });
  }
}

// =============================================================================
// Factory
// =============================================================================

let instance: GraphDataLoader | null = null;

export function getGraphDataLoader(config?: LoaderConfig): GraphDataLoader {
  if (!instance) {
    instance = new GraphDataLoader(config);
  }
  return instance;
}

export function createGraphDataLoader(config?: LoaderConfig): GraphDataLoader {
  return new GraphDataLoader(config);
}
