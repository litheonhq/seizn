"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphFilter,
  GraphNodeType,
} from "@/lib/winter/graph/types";

import { GraphNodeRenderer } from "./NodeRenderer";
import { GraphEdgeRenderer } from "./EdgeRenderer";
import { GraphControls } from "./GraphControls";
import { PermissionPanel } from "./PermissionPanel";

// ============================================
// Types
// ============================================

export interface GraphCanvasProps {
  /** Graph data to render */
  data: GraphData;
  /** Callback when a node is selected */
  onNodeSelect?: (nodeId: string | null) => void;
  /** Callback when filter changes */
  onFilterChange?: (filter: GraphFilter) => void;
  /** Enable editing mode */
  editable?: boolean;
  /** Show minimap */
  showMinimap?: boolean;
  /** Show controls */
  showControls?: boolean;
  /** Show permission panel */
  showPermissionPanel?: boolean;
  /** Layout algorithm */
  layout?: "dagre" | "elk" | "force";
  /** Custom class name */
  className?: string;
}

// ============================================
// Transform Functions
// ============================================

/**
 * Transform GraphNode to React Flow Node
 */
function toReactFlowNode(node: GraphNode): Node {
  return {
    id: node.id,
    type: "graphNode",
    position: node.position || { x: 0, y: 0 },
    data: {
      label: node.label,
      description: node.description,
      type: node.type,
      status: node.status,
      permissions: node.permissions,
      metadata: node.metadata,
      style: node.style,
      expanded: node.expanded,
    },
    draggable: true,
    selectable: true,
  };
}

/**
 * Transform GraphEdge to React Flow Edge
 */
function toReactFlowEdge(edge: GraphEdge): Edge {
  const markerEnd =
    edge.direction === "directed" || edge.direction === "bidirectional"
      ? {
          type: MarkerType.ArrowClosed,
          color: edge.style?.strokeColor || "#6B7280",
        }
      : undefined;

  const markerStart =
    edge.direction === "bidirectional"
      ? {
          type: MarkerType.ArrowClosed,
          color: edge.style?.strokeColor || "#6B7280",
        }
      : undefined;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "graphEdge",
    label: edge.label,
    animated: edge.animated || edge.style?.animated,
    markerEnd,
    markerStart,
    data: {
      type: edge.type,
      direction: edge.direction,
      weight: edge.weight,
      permissionLevel: edge.permissionLevel,
      metadata: edge.metadata,
      style: edge.style,
    },
    style: {
      stroke: edge.style?.strokeColor || "#6B7280",
      strokeWidth: edge.style?.strokeWidth || 1,
      strokeDasharray:
        edge.style?.strokeStyle === "dashed"
          ? "5,5"
          : edge.style?.strokeStyle === "dotted"
            ? "2,2"
            : undefined,
      opacity: edge.style?.opacity || 1,
    },
  };
}

/**
 * Apply dagre layout to nodes
 */
function applyDagreLayout(nodes: Node[], _edges: Edge[]): Node[] {

  // Simple layout algorithm - positions nodes in a grid
  // In production, you'd use dagre or elk.js
  const SPACING_X = 250;
  const SPACING_Y = 150;
  const COLUMNS = 4;

  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: (index % COLUMNS) * SPACING_X,
      y: Math.floor(index / COLUMNS) * SPACING_Y,
    },
  }));
}

// ============================================
// Node and Edge Types
// ============================================

const nodeTypes = {
  graphNode: GraphNodeRenderer,
} as NodeTypes;

const edgeTypes = {
  graphEdge: GraphEdgeRenderer,
} as EdgeTypes;

// ============================================
// Inner Canvas Component
// ============================================

function GraphCanvasInner({
  data,
  onNodeSelect,
  onFilterChange,
  editable = false,
  showMinimap = true,
  showControls = true,
  showPermissionPanel = true,
  layout = "dagre",
  className = "",
}: GraphCanvasProps) {
  const reactFlowInstance = useReactFlow();

  // Transform graph data to React Flow format
  const initialNodes = useMemo(() => {
    let nodes = data.nodes.map(toReactFlowNode);
    if (layout === "dagre") {
      nodes = applyDagreLayout(
        nodes,
        data.edges.map(toReactFlowEdge)
      );
    }
    return nodes;
  }, [data.nodes, data.edges, layout]);

  const initialEdges = useMemo(
    () => data.edges.map(toReactFlowEdge),
    [data.edges]
  );

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GraphFilter>({});

  // Handle node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Handle edge connection (for editable mode)
  const onConnect = useCallback(
    (params: Connection) => {
      if (!editable) return;
      setEdges((eds) => addEdge(params, eds));
    },
    [editable, setEdges]
  );

  // Handle filter change
  const handleFilterChange = useCallback(
    (newFilter: GraphFilter) => {
      setFilter(newFilter);
      onFilterChange?.(newFilter);

      // Apply filter to visible nodes/edges
      // This is a simplified implementation
      if (newFilter.nodeTypes && newFilter.nodeTypes.length > 0) {
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            hidden: !newFilter.nodeTypes!.includes((node.data as { type: GraphNodeType }).type),
          }))
        );
      } else {
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            hidden: false,
          }))
        );
      }
    },
    [onFilterChange, setNodes]
  );

  // Fit view on initial render
  const onInit = useCallback(() => {
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2 });
    }, 100);
  }, [reactFlowInstance]);

  // Get selected node data
  const selectedNode = useMemo(
    () => data.nodes.find((n) => n.id === selectedNodeId),
    [data.nodes, selectedNodeId]
  );

  return (
    <div className={`w-full h-full bg-gray-50 rounded-lg ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
        className="bg-gray-50"
      >
        {/* Background */}
        <Background color="#e5e7eb" gap={16} size={1} />

        {/* Controls Panel */}
        <Panel position="top-left">
          <GraphControls
            filter={filter}
            onFilterChange={handleFilterChange}
            graphMetadata={data.metadata}
          />
        </Panel>

        {/* Permission Panel */}
        {showPermissionPanel && selectedNode && (
          <Panel position="top-right">
            <PermissionPanel
              node={selectedNode}
              onClose={() => {
                setSelectedNodeId(null);
                onNodeSelect?.(null);
              }}
            />
          </Panel>
        )}

        {/* Graph Statistics */}
        <Panel position="bottom-left" className="bg-white/80 backdrop-blur-sm rounded-lg p-3 shadow-sm">
          <div className="text-xs text-gray-600 space-y-1">
            <p>Nodes: {data.metadata.stats.nodeCount}</p>
            <p>Edges: {data.metadata.stats.edgeCount}</p>
            <p>Type: {data.metadata.type}</p>
          </div>
        </Panel>

        {/* Default Controls */}
        {showControls && <Controls />}

        {/* MiniMap */}
        {showMinimap && (
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="bg-white/80 backdrop-blur-sm rounded-lg"
          />
        )}
      </ReactFlow>
    </div>
  );
}

// ============================================
// Main Component with Provider
// ============================================

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export default GraphCanvas;
