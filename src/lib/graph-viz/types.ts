/**
 * Graph Visualization Types
 *
 * @module lib/graph-viz/types
 */

// =============================================================================
// Node Types
// =============================================================================

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  /** Node position (computed by layout) */
  x?: number;
  y?: number;
  /** Node size (affects rendering) */
  size?: number;
  /** Node color */
  color?: string;
  /** Original data */
  data?: Record<string, unknown>;
  /** Is node visible (for culling) */
  hidden?: boolean;
  /** LOD level (0 = highest detail) */
  lodLevel?: number;
}

export type NodeType =
  | 'memory'
  | 'fact'
  | 'episode'
  | 'entity'
  | 'topic'
  | 'community'
  | 'profile'
  | 'default';

// =============================================================================
// Edge Types
// =============================================================================

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  /** Edge weight (affects layout and rendering) */
  weight?: number;
  /** Edge label */
  label?: string;
  /** Edge color */
  color?: string;
  /** Is edge visible */
  hidden?: boolean;
}

export type EdgeType =
  | 'related'
  | 'derived'
  | 'supports'
  | 'contradicts'
  | 'temporal'
  | 'semantic'
  | 'default';

// =============================================================================
// Graph Data
// =============================================================================

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  visibleNodes: number;
  visibleEdges: number;
  communities: number;
  density: number;
}

// =============================================================================
// Layout Types
// =============================================================================

export type LayoutAlgorithm =
  | 'force-atlas-2'
  | 'force-directed'
  | 'circular'
  | 'grid'
  | 'random'
  | 'hierarchical';

export interface LayoutConfig {
  algorithm: LayoutAlgorithm;
  /** Iterations for force-based layouts */
  iterations?: number;
  /** Gravity strength */
  gravity?: number;
  /** Scaling factor */
  scalingRatio?: number;
  /** Whether to prevent overlap */
  preventOverlap?: boolean;
  /** Node margin for overlap prevention */
  nodeMargin?: number;
  /** Whether layout runs in Web Worker */
  useWorker?: boolean;
}

export interface LayoutProgress {
  iteration: number;
  totalIterations: number;
  convergence: number;
  isComplete: boolean;
}

// =============================================================================
// Viewport Types
// =============================================================================

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  rotation?: number;
}

export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// =============================================================================
// LOD Types
// =============================================================================

export interface LODLevel {
  /** Zoom threshold for this LOD level */
  zoomThreshold: number;
  /** Whether to show labels */
  showLabels: boolean;
  /** Whether to show edge labels */
  showEdgeLabels: boolean;
  /** Minimum node size to render */
  minNodeSize: number;
  /** Minimum edge weight to render */
  minEdgeWeight: number;
  /** Node render quality (0-1) */
  nodeQuality: number;
}

export interface LODConfig {
  levels: LODLevel[];
  /** Current LOD level index */
  currentLevel: number;
}

// =============================================================================
// Renderer Types
// =============================================================================

export interface RendererConfig {
  /** Container element or ID */
  container: HTMLElement | string;
  /** Initial viewport */
  viewport?: Partial<Viewport>;
  /** Layout configuration */
  layout?: LayoutConfig;
  /** LOD configuration */
  lod?: Partial<LODConfig>;
  /** Node styling */
  nodeStyles?: Partial<NodeStyles>;
  /** Edge styling */
  edgeStyles?: Partial<EdgeStyles>;
  /** Enable WebGL (default: true) */
  webgl?: boolean;
  /** Performance mode (reduces quality for better performance) */
  performanceMode?: boolean;
  /** Max nodes to render without LOD */
  lodThreshold?: number;
}

export interface NodeStyles {
  /** Default node size */
  defaultSize: number;
  /** Size range [min, max] */
  sizeRange: [number, number];
  /** Color by type */
  colorByType: Record<NodeType, string>;
  /** Default color */
  defaultColor: string;
  /** Border color */
  borderColor: string;
  /** Border width */
  borderWidth: number;
  /** Label color */
  labelColor: string;
  /** Label size */
  labelSize: number;
  /** Selected node color */
  selectedColor: string;
  /** Hover node color */
  hoverColor: string;
}

export interface EdgeStyles {
  /** Default edge width */
  defaultWidth: number;
  /** Width range [min, max] */
  widthRange: [number, number];
  /** Color by type */
  colorByType: Record<EdgeType, string>;
  /** Default color */
  defaultColor: string;
  /** Arrow size */
  arrowSize: number;
  /** Show arrows */
  showArrows: boolean;
  /** Curved edges */
  curved: boolean;
  /** Selected edge color */
  selectedColor: string;
  /** Hover edge color */
  hoverColor: string;
}

// =============================================================================
// Event Types
// =============================================================================

export interface GraphEvent {
  type: GraphEventType;
  target?: GraphNode | GraphEdge;
  position?: { x: number; y: number };
  viewport?: Viewport;
}

export type GraphEventType =
  | 'node:click'
  | 'node:hover'
  | 'node:leave'
  | 'node:drag'
  | 'node:dragend'
  | 'edge:click'
  | 'edge:hover'
  | 'edge:leave'
  | 'canvas:click'
  | 'canvas:drag'
  | 'viewport:change'
  | 'layout:start'
  | 'layout:progress'
  | 'layout:complete';

export type GraphEventCallback = (event: GraphEvent) => void;

// =============================================================================
// Worker Messages
// =============================================================================

export interface WorkerMessage {
  type: WorkerMessageType;
  payload: unknown;
}

export type WorkerMessageType =
  | 'init'
  | 'layout:start'
  | 'layout:progress'
  | 'layout:complete'
  | 'layout:stop'
  | 'data:update'
  | 'error';

export interface LayoutWorkerInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  config: LayoutConfig;
}

export interface LayoutWorkerOutput {
  nodes: Array<{ id: string; x: number; y: number }>;
  progress?: LayoutProgress;
  error?: string;
}
