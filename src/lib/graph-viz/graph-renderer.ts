/**
 * Graph Renderer
 *
 * Main class for rendering graphs with WebGL via Sigma.js.
 * Coordinates viewport, LOD, and layout management.
 *
 * @module lib/graph-viz/graph-renderer
 */

import type {
  GraphNode,
  GraphEdge,
  GraphData,
  GraphStats,
  RendererConfig,
  NodeStyles,
  EdgeStyles,
  GraphEvent,
  GraphEventCallback,
  GraphEventType,
  LayoutConfig,
  Viewport,
} from './types';
import { ViewportManager, createViewportManager } from './viewport-manager';
import { LODManager, createLODManager } from './lod-manager';
import { LayoutWorkerManager, createLayoutWorkerManager } from './layout-worker-manager';

// =============================================================================
// Default Styles
// =============================================================================

const DEFAULT_NODE_STYLES: NodeStyles = {
  defaultSize: 10,
  sizeRange: [5, 30],
  colorByType: {
    memory: '#3B82F6', // blue
    fact: '#10B981', // green
    episode: '#F59E0B', // amber
    entity: '#8B5CF6', // violet
    topic: '#EC4899', // pink
    community: '#6366F1', // indigo
    profile: '#14B8A6', // teal
    default: '#6B7280', // gray
  },
  defaultColor: '#6B7280',
  borderColor: '#FFFFFF',
  borderWidth: 2,
  labelColor: '#1F2937',
  labelSize: 12,
  selectedColor: '#EF4444',
  hoverColor: '#3B82F6',
};

const DEFAULT_EDGE_STYLES: EdgeStyles = {
  defaultWidth: 1,
  widthRange: [0.5, 5],
  colorByType: {
    related: '#9CA3AF',
    derived: '#6B7280',
    supports: '#10B981',
    contradicts: '#EF4444',
    temporal: '#F59E0B',
    semantic: '#8B5CF6',
    default: '#D1D5DB',
  },
  defaultColor: '#D1D5DB',
  arrowSize: 5,
  showArrows: true,
  curved: true,
  selectedColor: '#EF4444',
  hoverColor: '#3B82F6',
};

// =============================================================================
// Graph Renderer Class
// =============================================================================

export class GraphRenderer {
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isWebGL = false;

  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();

  private viewportManager: ViewportManager;
  private lodManager: LODManager;
  private layoutManager: LayoutWorkerManager;

  private nodeStyles: NodeStyles;
  private edgeStyles: EdgeStyles;

  private eventListeners: Map<GraphEventType, Set<GraphEventCallback>> = new Map();
  private selectedNodeId: string | null = null;
  private hoveredNodeId: string | null = null;

  private animationFrameId: number | null = null;
  private isDirty = true;
  private performanceMode: boolean;
  private lodThreshold: number;
  private resizeListener: (() => void) | null = null;

  constructor(config: RendererConfig) {
    // Initialize managers
    this.viewportManager = createViewportManager(config.viewport);
    this.lodManager = createLODManager(config.lod);
    this.layoutManager = createLayoutWorkerManager();

    // Set styles
    this.nodeStyles = { ...DEFAULT_NODE_STYLES, ...config.nodeStyles };
    this.edgeStyles = { ...DEFAULT_EDGE_STYLES, ...config.edgeStyles };

    this.performanceMode = config.performanceMode ?? false;
    this.lodThreshold = config.lodThreshold ?? 500;

    // Initialize container
    this.initContainer(config.container);

    // Set up viewport listener
    this.viewportManager.onViewportChange(() => {
      this.lodManager.updateZoom(this.viewportManager.getViewport().zoom);
      this.markDirty();
    });

    // Set up LOD listener
    this.lodManager.onLevelChange(() => {
      this.markDirty();
    });

    // Start render loop
    this.startRenderLoop();
  }

  /**
   * Initialize the container and canvas
   */
  private initContainer(container: HTMLElement | string): void {
    if (typeof container === 'string') {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }

    if (!this.container) {
      throw new Error('Container not found');
    }

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);

    // Get context
    this.ctx = this.canvas.getContext('2d');

    // Handle resize
    this.handleResize();
    this.resizeListener = () => this.handleResize();
    window.addEventListener('resize', this.resizeListener);

    // Set up mouse events
    this.setupMouseEvents();
  }

  /**
   * Handle container resize
   */
  private handleResize(): void {
    if (!this.container || !this.canvas) return;

    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    if (this.ctx) {
      // Reset transform before scaling to avoid cumulative zoom on repeated resize.
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
    }

    this.viewportManager.setViewport({
      width: rect.width,
      height: rect.height,
    });

    this.markDirty();
  }

  /**
   * Set up mouse event handlers
   */
  private setupMouseEvents(): void {
    if (!this.canvas) return;

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const graphPos = this.viewportManager.screenToGraph(e.offsetX, e.offsetY);

      // Find hovered node
      const hoveredNode = this.findNodeAtPosition(graphPos.x, graphPos.y);

      if (hoveredNode?.id !== this.hoveredNodeId) {
        if (this.hoveredNodeId) {
          this.emit('node:leave', { target: this.nodes.get(this.hoveredNodeId) });
        }
        this.hoveredNodeId = hoveredNode?.id ?? null;
        if (hoveredNode) {
          this.emit('node:hover', { target: hoveredNode, position: graphPos });
        }
        this.markDirty();
      }

      // Handle drag
      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        this.viewportManager.pan(dx, dy);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.canvas.addEventListener('click', (e) => {
      const graphPos = this.viewportManager.screenToGraph(e.offsetX, e.offsetY);
      const clickedNode = this.findNodeAtPosition(graphPos.x, graphPos.y);

      if (clickedNode) {
        this.selectedNodeId = clickedNode.id;
        this.emit('node:click', { target: clickedNode, position: graphPos });
      } else {
        this.selectedNodeId = null;
        this.emit('canvas:click', { position: graphPos });
      }
      this.markDirty();
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.viewportManager.zoom(factor, e.offsetX, e.offsetY);
    });
  }

  /**
   * Find node at position
   */
  private findNodeAtPosition(x: number, y: number): GraphNode | null {
    for (const node of this.nodes.values()) {
      if (node.x === undefined || node.y === undefined) continue;

      const size = node.size || this.nodeStyles.defaultSize;
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= size) {
        return node;
      }
    }
    return null;
  }

  /**
   * Set graph data
   */
  async setData(data: GraphData): Promise<void> {
    this.nodes.clear();
    this.edges.clear();

    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
    }

    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);
    }

    if (this.selectedNodeId && !this.nodes.has(this.selectedNodeId)) {
      this.selectedNodeId = null;
    }

    this.lodManager.updateNodeCount(this.nodes.size);

    // Initialize layout worker
    await this.layoutManager.init(data.nodes, data.edges);

    this.markDirty();
  }

  /**
   * Run layout algorithm
   */
  runLayout(config?: Partial<LayoutConfig>): void {
    this.emit('layout:start', {});

    this.layoutManager.runLayout(config || { algorithm: 'force-atlas-2' }, {
      onProgress: (progress) => {
        this.emit('layout:progress', { viewport: this.viewportManager.getViewport() });
      },
      onComplete: (positions) => {
        for (const pos of positions) {
          const node = this.nodes.get(pos.id);
          if (node) {
            node.x = pos.x;
            node.y = pos.y;
          }
        }
        this.viewportManager.fitToNodes(Array.from(this.nodes.values()));
        this.emit('layout:complete', {});
        this.markDirty();
      },
    });
  }

  /**
   * Fit the viewport to all nodes.
   */
  fitView(margin = 50): void {
    this.viewportManager.fitToNodes(Array.from(this.nodes.values()), margin);
    this.markDirty();
  }

  /**
   * Zoom in around optional screen center coordinates.
   */
  zoomIn(factor = 1.1, centerX?: number, centerY?: number): void {
    this.viewportManager.zoom(Math.max(factor, 1.01), centerX, centerY);
    this.markDirty();
  }

  /**
   * Zoom out around optional screen center coordinates.
   */
  zoomOut(factor = 0.9, centerX?: number, centerY?: number): void {
    this.viewportManager.zoom(Math.min(factor, 0.99), centerX, centerY);
    this.markDirty();
  }

  /**
   * Reset viewport pan/zoom state.
   */
  resetView(): void {
    this.viewportManager.reset();
    this.markDirty();
  }

  /**
   * Get a node by ID.
   */
  getNode(nodeId: string): GraphNode | null {
    return this.nodes.get(nodeId) ?? null;
  }

  /**
   * Select a node by ID.
   */
  selectNode(nodeId: string | null): GraphNode | null {
    if (!nodeId) {
      this.selectedNodeId = null;
      this.markDirty();
      return null;
    }

    const node = this.nodes.get(nodeId) ?? null;
    this.selectedNodeId = node?.id ?? null;
    this.markDirty();
    return node;
  }

  /**
   * Get currently selected node.
   */
  getSelectedNode(): GraphNode | null {
    if (!this.selectedNodeId) return null;
    return this.nodes.get(this.selectedNodeId) ?? null;
  }

  /**
   * Mark as needing redraw
   */
  private markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Start render loop
   */
  private startRenderLoop(): void {
    const loop = () => {
      if (this.isDirty) {
        this.render();
        this.isDirty = false;
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Stop render loop
   */
  private stopRenderLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Render the graph
   */
  private render(): void {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const viewport = this.viewportManager.getViewport();
    const renderSettings = this.lodManager.getRenderSettings();

    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply viewport transform
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Get visible elements
    const allNodes = Array.from(this.nodes.values());
    const allEdges = Array.from(this.edges.values());

    // Apply LOD filtering
    const lodNodes = this.lodManager.filterNodes(allNodes);
    const lodEdges = this.lodManager.filterEdges(allEdges);

    // Apply viewport culling
    const { visibleNodes, visibleEdges } = this.viewportManager.getVisibleElements(
      lodNodes,
      lodEdges
    );

    // Render edges first (behind nodes)
    this.renderEdges(ctx, visibleEdges, renderSettings.showEdgeLabels);

    // Render nodes
    this.renderNodes(ctx, visibleNodes, renderSettings);

    ctx.restore();
  }

  /**
   * Render edges
   */
  private renderEdges(
    ctx: CanvasRenderingContext2D,
    edges: GraphEdge[],
    showLabels: boolean
  ): void {
    for (const edge of edges) {
      const source = this.nodes.get(edge.source);
      const target = this.nodes.get(edge.target);

      if (
        source?.x === undefined ||
        source.y === undefined ||
        target?.x === undefined ||
        target.y === undefined
      ) {
        continue;
      }

      const color = this.edgeStyles.colorByType[edge.type] || this.edgeStyles.defaultColor;
      const width = edge.weight
        ? this.mapRange(
            edge.weight,
            0,
            1,
            this.edgeStyles.widthRange[0],
            this.edgeStyles.widthRange[1]
          )
        : this.edgeStyles.defaultWidth;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;

      if (this.edgeStyles.curved) {
        // Curved edge
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const offset = Math.sqrt(dx * dx + dy * dy) * 0.1;

        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(midX - dy * 0.1, midY + dx * 0.1, target.x, target.y);
      } else {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      }

      ctx.stroke();
    }
  }

  /**
   * Render nodes
   */
  private renderNodes(
    ctx: CanvasRenderingContext2D,
    nodes: GraphNode[],
    renderSettings: { showLabels: boolean; nodeQuality: number }
  ): void {
    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined) continue;

      const size = node.size || this.nodeStyles.defaultSize;
      const color =
        node.id === this.selectedNodeId
          ? this.nodeStyles.selectedColor
          : node.id === this.hoveredNodeId
            ? this.nodeStyles.hoverColor
            : this.nodeStyles.colorByType[node.type] || this.nodeStyles.defaultColor;

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Draw border
      if (renderSettings.nodeQuality > 0.5) {
        ctx.strokeStyle = this.nodeStyles.borderColor;
        ctx.lineWidth = this.nodeStyles.borderWidth;
        ctx.stroke();
      }

      // Draw label
      if (renderSettings.showLabels && node.label) {
        ctx.fillStyle = this.nodeStyles.labelColor;
        ctx.font = `${this.nodeStyles.labelSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + size + this.nodeStyles.labelSize + 2);
      }
    }
  }

  /**
   * Map value to range
   */
  private mapRange(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
  ): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  /**
   * Count connected components (undirected) as a proxy for community count.
   */
  private computeCommunityCount(): number {
    if (this.nodes.size === 0) {
      return 0;
    }

    const adjacency = new Map<string, Set<string>>();
    for (const nodeId of this.nodes.keys()) {
      adjacency.set(nodeId, new Set());
    }

    for (const edge of this.edges.values()) {
      if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
        continue;
      }
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }

    let communities = 0;
    const visited = new Set<string>();

    for (const nodeId of adjacency.keys()) {
      if (visited.has(nodeId)) continue;
      communities++;
      const stack = [nodeId];
      visited.add(nodeId);

      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    return communities;
  }

  /**
   * Event handling
   */
  on(event: GraphEventType, callback: GraphEventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  private emit(type: GraphEventType, event: Partial<GraphEvent>): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener({ type, ...event } as GraphEvent);
      }
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    const { visibleNodes, visibleEdges } = this.viewportManager.getVisibleElements(
      Array.from(this.nodes.values()),
      Array.from(this.edges.values())
    );

    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;
    const density = nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0;

    return {
      nodeCount,
      edgeCount,
      visibleNodes: visibleNodes.length,
      visibleEdges: visibleEdges.length,
      communities: this.computeCommunityCount(),
      density,
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopRenderLoop();
    this.layoutManager.terminate();
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }

    if (this.canvas && this.container) {
      this.container.removeChild(this.canvas);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createGraphRenderer(config: RendererConfig): GraphRenderer {
  return new GraphRenderer(config);
}
