'use client';

/**
 * useGraphRenderer Hook
 *
 * React hook for managing the graph renderer lifecycle.
 *
 * @module hooks/useGraphRenderer
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createGraphRenderer,
  type GraphRenderer,
  type GraphData,
  type GraphNode,
  type LayoutConfig,
  type RendererConfig,
} from '@/lib/graph-viz';

// =============================================================================
// Types
// =============================================================================

export interface UseGraphRendererOptions {
  /** Initial graph data */
  data?: GraphData;
  /** Renderer configuration */
  config?: Partial<Omit<RendererConfig, 'container'>>;
  /** Auto-run layout when data changes */
  autoLayout?: boolean;
  /** Layout configuration */
  layoutConfig?: Partial<LayoutConfig>;
  /** Called when a node is clicked */
  onNodeClick?: (node: GraphNode) => void;
  /** Called when a node is hovered */
  onNodeHover?: (node: GraphNode | null) => void;
  /** Called when layout completes */
  onLayoutComplete?: () => void;
}

export interface UseGraphRendererReturn {
  /** Ref to attach to container element */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Whether the graph is loading */
  isLoading: boolean;
  /** Whether layout is running */
  isLayoutRunning: boolean;
  /** Currently selected node */
  selectedNode: GraphNode | null;
  /** Graph statistics */
  stats: {
    nodeCount: number;
    edgeCount: number;
    visibleNodes: number;
    visibleEdges: number;
  };
  /** Run layout algorithm */
  runLayout: (config?: Partial<LayoutConfig>) => void;
  /** Fit view to all nodes */
  fitView: () => void;
  /** Zoom in */
  zoomIn: () => void;
  /** Zoom out */
  zoomOut: () => void;
  /** Reset view */
  resetView: () => void;
  /** Update graph data */
  setData: (data: GraphData) => void;
  /** Select a node by ID */
  selectNode: (nodeId: string | null) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useGraphRenderer(
  options: UseGraphRendererOptions = {}
): UseGraphRendererReturn {
  const {
    data,
    config,
    autoLayout = true,
    layoutConfig,
    onNodeClick,
    onNodeHover,
    onLayoutComplete,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({
    nodeCount: 0,
    edgeCount: 0,
    visibleNodes: 0,
    visibleEdges: 0,
  });

  const configRef = useRef(config);
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeHoverRef = useRef(onNodeHover);
  const onLayoutCompleteRef = useRef(onLayoutComplete);

  useEffect(() => {
    configRef.current = config;
    onNodeClickRef.current = onNodeClick;
    onNodeHoverRef.current = onNodeHover;
    onLayoutCompleteRef.current = onLayoutComplete;
  }, [config, onNodeClick, onNodeHover, onLayoutComplete]);

  // Update stats helper
  const updateStats = useCallback(() => {
    if (rendererRef.current) {
      const s = rendererRef.current.getStats();
      setStats({
        nodeCount: s.nodeCount,
        edgeCount: s.edgeCount,
        visibleNodes: s.visibleNodes,
        visibleEdges: s.visibleEdges,
      });
    }
  }, []);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = createGraphRenderer({
      container: containerRef.current,
      ...configRef.current,
    });

    rendererRef.current = renderer;

    // Set up event listeners
    renderer.on('node:click', (event) => {
      if (event.target) {
        setSelectedNode(event.target as GraphNode);
        onNodeClickRef.current?.(event.target as GraphNode);
      }
    });

    renderer.on('node:hover', (event) => {
      onNodeHoverRef.current?.(event.target as GraphNode | null);
    });

    renderer.on('node:leave', () => {
      onNodeHoverRef.current?.(null);
    });

    renderer.on('layout:start', () => {
      setIsLayoutRunning(true);
    });

    renderer.on('layout:complete', () => {
      setIsLayoutRunning(false);
      onLayoutCompleteRef.current?.();
      updateStats();
    });

    renderer.on('canvas:click', () => {
      setSelectedNode(null);
    });

    const loadingId = setTimeout(() => setIsLoading(false), 0);

    return () => {
      clearTimeout(loadingId);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [updateStats]);

  // Update data when it changes
  useEffect(() => {
    if (!rendererRef.current || !data) return;

    const loadData = async () => {
      setIsLoading(true);
      await rendererRef.current!.setData(data);
      setIsLoading(false);

      if (autoLayout) {
        rendererRef.current!.runLayout(layoutConfig);
      }

      updateStats();
    };

    loadData();
  }, [data, autoLayout, layoutConfig, updateStats]);

  // Run layout
  const runLayout = useCallback((config?: Partial<LayoutConfig>) => {
    rendererRef.current?.runLayout(config || layoutConfig);
  }, [layoutConfig]);

  // Fit view
  const fitView = useCallback(() => {
    // Would call renderer's fitToNodes internally
    if (rendererRef.current) {
      runLayout();
    }
  }, [runLayout]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    // Would call viewport manager's zoom
  }, []);

  const zoomOut = useCallback(() => {
    // Would call viewport manager's zoom
  }, []);

  const resetView = useCallback(() => {
    // Would call viewport manager's reset
  }, []);

  // Set data
  const setData = useCallback(async (newData: GraphData) => {
    if (rendererRef.current) {
      setIsLoading(true);
      await rendererRef.current.setData(newData);
      setIsLoading(false);
      if (autoLayout) {
        rendererRef.current.runLayout(layoutConfig);
      }
    }
  }, [autoLayout, layoutConfig]);

  // Select node
  const selectNode = useCallback((_nodeId: string | null) => {
    // Would update renderer's selected node
    setSelectedNode(null); // TODO: get node from renderer
  }, []);

  return {
    containerRef,
    isLoading,
    isLayoutRunning,
    selectedNode,
    stats,
    runLayout,
    fitView,
    zoomIn,
    zoomOut,
    resetView,
    setData,
    selectNode,
  };
}
