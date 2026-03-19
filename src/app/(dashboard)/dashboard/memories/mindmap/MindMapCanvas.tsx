"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useMindMapData } from "./hooks/useMindMapData";
import { MindMapNode } from "./MindMapNode";
import { MindMapEdge } from "./MindMapEdge";
import { MindMapFilters, FilterState } from "./MindMapFilters";
import { NodeInspector } from "./NodeInspector";
import type { MemoryNote, NoteType, NoteStatus, PrivacyClass, EdgeType } from "@/lib/spring/memory-v3/types";

// ============================================
// Types
// ============================================

export interface MindMapNodeData extends Record<string, unknown> {
  note: MemoryNote;
  label: string;
  type: NoteType;
  status: NoteStatus;
  privacyClass: PrivacyClass;
  importance: number;
  content: string;
}

export interface MindMapEdgeData extends Record<string, unknown> {
  type: EdgeType | "belongs_to";
  weight: number;
  label?: string;
}

// ============================================
// Custom Node/Edge Types
// ============================================

const nodeTypes: NodeTypes = {
  mindMapNode: MindMapNode,
};

const edgeTypes: EdgeTypes = {
  mindMapEdge: MindMapEdge,
};

// ============================================
// Layout Helper
// ============================================

function calculateLayout(
  nodes: Node<MindMapNodeData>[],
  edges: Edge<MindMapEdgeData>[]
): Node<MindMapNodeData>[] {
  // Simple force-directed-like layout
  // In production, consider using dagre or elkjs
  const centerX = 400;
  const centerY = 300;
  const radius = 250;

  if (nodes.length === 0) return nodes;

  // Find center node (first node or most connected)
  const connectionCount = new Map<string, number>();
  edges.forEach((edge) => {
    connectionCount.set(edge.source, (connectionCount.get(edge.source) || 0) + 1);
    connectionCount.set(edge.target, (connectionCount.get(edge.target) || 0) + 1);
  });

  let centerNode = nodes[0];
  let maxConnections = 0;
  nodes.forEach((node) => {
    const count = connectionCount.get(node.id) || 0;
    if (count > maxConnections) {
      maxConnections = count;
      centerNode = node;
    }
  });

  // Position nodes in concentric circles
  const positioned = new Set<string>();
  const result: Node<MindMapNodeData>[] = [];

  // Position center node
  result.push({
    ...centerNode,
    position: { x: centerX, y: centerY },
  });
  positioned.add(centerNode.id);

  // Get connected nodes by distance
  const getConnectedNodes = (nodeId: string): string[] => {
    const connected: string[] = [];
    edges.forEach((edge) => {
      if (edge.source === nodeId && !positioned.has(edge.target)) {
        connected.push(edge.target);
      }
      if (edge.target === nodeId && !positioned.has(edge.source)) {
        connected.push(edge.source);
      }
    });
    return connected;
  };

  // BFS to position nodes in layers
  let currentLayer = [centerNode.id];
  let layerRadius = radius;
  let layer = 1;

  while (positioned.size < nodes.length && layer < 10) {
    const nextLayer: string[] = [];

    currentLayer.forEach((nodeId) => {
      const connected = getConnectedNodes(nodeId);
      connected.forEach((connectedId) => {
        if (!positioned.has(connectedId)) {
          nextLayer.push(connectedId);
          positioned.add(connectedId);
        }
      });
    });

    // Position nodes in this layer
    if (nextLayer.length > 0) {
      const angleStep = (2 * Math.PI) / nextLayer.length;
      nextLayer.forEach((nodeId, index) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          const angle = angleStep * index - Math.PI / 2;
          result.push({
            ...node,
            position: {
              x: centerX + layerRadius * Math.cos(angle),
              y: centerY + layerRadius * Math.sin(angle),
            },
          });
        }
      });
    }

    currentLayer = nextLayer;
    layerRadius += 150;
    layer++;
  }

  // Position any remaining unconnected nodes
  nodes.forEach((node) => {
    if (!positioned.has(node.id)) {
      result.push({
        ...node,
        position: {
          x: centerX + (Math.random() - 0.5) * 600,
          y: centerY + (Math.random() - 0.5) * 400,
        },
      });
    }
  });

  return result;
}

// ============================================
// Main Component
// ============================================

export default function MindMapCanvas() {
  // Data fetching
  const { data, isLoading, error, refetch } = useMindMapData();

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    timeRange: [0, 100],
    types: [],
    statuses: [],
    privacyClasses: [],
    searchQuery: "",
  });

  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setNowMs(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  // Selected node for inspector
  const [selectedNode, setSelectedNode] = useState<Node<MindMapNodeData> | null>(null);

  // Panel visibility
  const [showFilters, setShowFilters] = useState(true);
  const [showInspector, setShowInspector] = useState(false);

  // Process and filter data
  const processedData = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };

    // Convert API data to React Flow nodes
    let filteredNodes = data.nodes
      .filter((n) => n.type === "note" && n.note)
      .map((n) => ({
        id: n.id,
        type: "mindMapNode",
        position: { x: 0, y: 0 },
        data: {
          note: n.note!,
          label: n.label,
          type: n.note!.type,
          status: n.note!.status,
          privacyClass: n.note!.privacyClass,
          importance: n.note!.salience?.score || 0.5,
          content: n.content || n.note!.content,
        } as MindMapNodeData,
      }));

    // Apply filters
    if (filters.types.length > 0) {
      filteredNodes = filteredNodes.filter((n) =>
        filters.types.includes(n.data.type)
      );
    }

    if (filters.statuses.length > 0) {
      filteredNodes = filteredNodes.filter((n) =>
        filters.statuses.includes(n.data.status)
      );
    }

    if (filters.privacyClasses.length > 0) {
      filteredNodes = filteredNodes.filter((n) =>
        filters.privacyClasses.includes(n.data.privacyClass)
      );
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) =>
          n.data.content.toLowerCase().includes(query) ||
          n.data.label.toLowerCase().includes(query)
      );
    }

    // Filter by time range (assuming nodes have timestamps)
    if ((filters.timeRange[0] > 0 || filters.timeRange[1] < 100) && nowMs > 0) {
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      filteredNodes = filteredNodes.filter((n) => {
        const age = nowMs - new Date(n.data.note.createdAt).getTime();
        const agePercent = Math.min(100, (age / maxAge) * 100);
        return agePercent >= filters.timeRange[0] && agePercent <= filters.timeRange[1];
      });
    }

    // Convert edges
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges
      .filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
      .map((e) => ({
        id: `${e.sourceId}-${e.targetId}`,
        source: e.sourceId,
        target: e.targetId,
        type: "mindMapEdge",
        data: {
          type: e.type,
          weight: e.weight,
          label: e.label,
        } as MindMapEdgeData,
      }));

    // Calculate layout
    const layoutNodes = calculateLayout(filteredNodes, filteredEdges);

    return { nodes: layoutNodes, edges: filteredEdges };
  }, [data, filters, nowMs]);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(processedData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(processedData.edges);

  // Update nodes/edges when processed data changes
  useEffect(() => {
    setNodes(processedData.nodes);
    setEdges(processedData.edges);
  }, [processedData, setNodes, setEdges]);

  // Connection handler
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Node selection handler
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<MindMapNodeData>) => {
      setSelectedNode(node);
      setShowInspector(true);
    },
    []
  );

  // Background click to deselect
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowInspector(false);
  }, []);

  // Fit view on initial load
  const onInit = useCallback((reactFlowInstance: { fitView: () => void }) => {
    reactFlowInstance.fitView();
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center bg-szn-bg rounded-2xl">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-szn-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-szn-text-2">Loading mind map...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center bg-szn-bg rounded-2xl">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-szn-text-1">
            Failed to load mind map
          </h3>
          <p className="text-szn-text-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-szn-accent hover:bg-szn-accent/90 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || data.nodes.length === 0) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center bg-szn-bg rounded-2xl">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-szn-surface flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-szn-text-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.129A12.007 12.007 0 0112 21a12.007 12.007 0 01-7.363-2.558l-.772-.129c-1.717-.293-2.299-2.379-1.067-3.611L5 14.5"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-szn-text-1">
            No memories yet
          </h3>
          <p className="text-szn-text-2">
            Start adding memories via the API to see them visualized here as a knowledge graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Filter Panel */}
      {showFilters && (
        <div className="w-72 flex-shrink-0">
          <MindMapFilters
            filters={filters}
            onFiltersChange={setFilters}
            onClose={() => setShowFilters(false)}
            nodeCount={nodes.length}
            edgeCount={edges.length}
          />
        </div>
      )}

      {/* Main Canvas */}
      <div className="flex-1 bg-szn-bg rounded-2xl border border-szn-border overflow-hidden">
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
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            animated: false,
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(156, 163, 175, 0.3)"
            className="dark:!bg-gray-900"
          />
          <Controls
            className="!bg-szn-card !border-szn-border !rounded-lg !shadow-lg"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-szn-card !border-szn-border !rounded-lg"
            nodeColor={(node) => {
              const data = node.data as MindMapNodeData;
              switch (data?.type) {
                case "fact":
                  return "#3B82F6";
                case "preference":
                  return "#8B5CF6";
                case "instruction":
                  return "#F97316";
                case "episode":
                  return "#10B981";
                case "procedure":
                  return "#0EA5E9";
                case "relationship":
                  return "#06B6D4";
                default:
                  return "#6B7280";
              }
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />

          {/* Toggle Filters Button */}
          {!showFilters && (
            <Panel position="top-left">
              <button
                onClick={() => setShowFilters(true)}
                className="p-2 bg-szn-card border border-szn-border rounded-lg shadow-lg hover:bg-szn-surface-1 transition-colors"
                title="Show Filters"
              >
                <svg
                  className="w-5 h-5 text-szn-text-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
                  />
                </svg>
              </button>
            </Panel>
          )}

          {/* Stats Panel */}
          <Panel position="top-right">
            <div className="bg-szn-card border border-szn-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-4 text-sm">
              <span className="text-szn-text-2">
                <span className="font-semibold text-szn-text-1">
                  {nodes.length}
                </span>{" "}
                nodes
              </span>
              <span className="text-szn-text-3">|</span>
              <span className="text-szn-text-2">
                <span className="font-semibold text-szn-text-1">
                  {edges.length}
                </span>{" "}
                connections
              </span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Inspector Panel */}
      {showInspector && selectedNode && (
        <div className="w-80 flex-shrink-0">
          <NodeInspector
            node={selectedNode}
            onClose={() => {
              setShowInspector(false);
              setSelectedNode(null);
            }}
            onRefresh={refetch}
          />
        </div>
      )}
    </div>
  );
}
