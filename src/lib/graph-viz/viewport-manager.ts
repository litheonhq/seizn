/**
 * Viewport Manager
 *
 * Manages viewport state and performs viewport culling
 * to only render visible nodes and edges.
 *
 * @module lib/graph-viz/viewport-manager
 */

import type {
  Viewport,
  ViewportBounds,
  GraphNode,
  GraphEdge,
} from './types';

// =============================================================================
// Viewport Manager Class
// =============================================================================

export class ViewportManager {
  private viewport: Viewport;
  private padding: number;
  private listeners: Set<(viewport: Viewport) => void> = new Set();

  constructor(
    initialViewport?: Partial<Viewport>,
    padding = 50
  ) {
    this.viewport = {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      zoom: 1,
      rotation: 0,
      ...initialViewport,
    };
    this.padding = padding;
  }

  /**
   * Get current viewport
   */
  getViewport(): Viewport {
    return { ...this.viewport };
  }

  /**
   * Set viewport
   */
  setViewport(viewport: Partial<Viewport>): void {
    this.viewport = { ...this.viewport, ...viewport };
    this.notifyListeners();
  }

  /**
   * Pan viewport
   */
  pan(dx: number, dy: number): void {
    this.viewport.x += dx;
    this.viewport.y += dy;
    this.notifyListeners();
  }

  /**
   * Zoom viewport
   */
  zoom(factor: number, centerX?: number, centerY?: number): void {
    const oldZoom = this.viewport.zoom;
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));

    // Zoom toward center point
    if (centerX !== undefined && centerY !== undefined) {
      const zoomRatio = newZoom / oldZoom;
      this.viewport.x = centerX - (centerX - this.viewport.x) * zoomRatio;
      this.viewport.y = centerY - (centerY - this.viewport.y) * zoomRatio;
    }

    this.viewport.zoom = newZoom;
    this.notifyListeners();
  }

  /**
   * Reset viewport to origin
   */
  reset(): void {
    this.viewport = {
      ...this.viewport,
      x: 0,
      y: 0,
      zoom: 1,
      rotation: 0,
    };
    this.notifyListeners();
  }

  /**
   * Fit viewport to contain all nodes
   */
  fitToNodes(nodes: GraphNode[], margin = 50): void {
    if (nodes.length === 0) return;

    const bounds = this.calculateBounds(nodes);
    const graphWidth = bounds.maxX - bounds.minX + margin * 2;
    const graphHeight = bounds.maxY - bounds.minY + margin * 2;

    // Calculate zoom to fit
    const zoomX = this.viewport.width / graphWidth;
    const zoomY = this.viewport.height / graphHeight;
    const zoom = Math.min(zoomX, zoomY, 1); // Don't zoom in beyond 1

    // Center the graph
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    this.viewport.x = this.viewport.width / 2 - centerX * zoom;
    this.viewport.y = this.viewport.height / 2 - centerY * zoom;
    this.viewport.zoom = zoom;

    this.notifyListeners();
  }

  /**
   * Get viewport bounds in graph coordinates
   */
  getBounds(): ViewportBounds {
    const { x, y, width, height, zoom } = this.viewport;

    return {
      minX: -x / zoom - this.padding,
      minY: -y / zoom - this.padding,
      maxX: (width - x) / zoom + this.padding,
      maxY: (height - y) / zoom + this.padding,
    };
  }

  /**
   * Check if a point is in viewport
   */
  isPointInViewport(px: number, py: number, nodeSize = 0): boolean {
    const bounds = this.getBounds();
    const halfSize = nodeSize / 2;

    return (
      px + halfSize >= bounds.minX &&
      px - halfSize <= bounds.maxX &&
      py + halfSize >= bounds.minY &&
      py - halfSize <= bounds.maxY
    );
  }

  /**
   * Perform viewport culling on nodes
   */
  cullNodes(nodes: GraphNode[]): GraphNode[] {
    return nodes.filter((node) => {
      if (node.x === undefined || node.y === undefined) return true;
      return this.isPointInViewport(node.x, node.y, node.size || 10);
    });
  }

  /**
   * Perform viewport culling on edges
   */
  cullEdges(
    edges: GraphEdge[],
    visibleNodeIds: Set<string>
  ): GraphEdge[] {
    return edges.filter((edge) => {
      // Edge is visible if either endpoint is visible
      return visibleNodeIds.has(edge.source) || visibleNodeIds.has(edge.target);
    });
  }

  /**
   * Get visible nodes and edges
   */
  getVisibleElements(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): { visibleNodes: GraphNode[]; visibleEdges: GraphEdge[] } {
    const visibleNodes = this.cullNodes(nodes);
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = this.cullEdges(edges, visibleNodeIds);

    return { visibleNodes, visibleEdges };
  }

  /**
   * Convert screen coordinates to graph coordinates
   */
  screenToGraph(screenX: number, screenY: number): { x: number; y: number } {
    const { x, y, zoom } = this.viewport;
    return {
      x: (screenX - x) / zoom,
      y: (screenY - y) / zoom,
    };
  }

  /**
   * Convert graph coordinates to screen coordinates
   */
  graphToScreen(graphX: number, graphY: number): { x: number; y: number } {
    const { x, y, zoom } = this.viewport;
    return {
      x: graphX * zoom + x,
      y: graphY * zoom + y,
    };
  }

  /**
   * Subscribe to viewport changes
   */
  onViewportChange(callback: (viewport: Viewport) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.viewport);
    }
  }

  /**
   * Calculate bounds of nodes
   */
  private calculateBounds(nodes: GraphNode[]): ViewportBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      if (node.x !== undefined && node.y !== undefined) {
        const size = (node.size || 10) / 2;
        minX = Math.min(minX, node.x - size);
        minY = Math.min(minY, node.y - size);
        maxX = Math.max(maxX, node.x + size);
        maxY = Math.max(maxY, node.y + size);
      }
    }

    return { minX, minY, maxX, maxY };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createViewportManager(
  initialViewport?: Partial<Viewport>,
  padding?: number
): ViewportManager {
  return new ViewportManager(initialViewport, padding);
}
