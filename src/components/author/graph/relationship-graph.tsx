'use client';

import { useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import {
  type GraphEdge,
  type GraphNode,
  type PreparedGraphEdge,
  prepareGraphEdges,
  prepareGraphNodes,
} from './relationship-graph-model';

interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface AuthorGraphNodeData {
  label: string;
  compactLabel: string;
  initial: string;
  scopeLabel: string;
  color: string;
  size: number;
  degree: number;
  selected: boolean;
  muted: boolean;
}

function AuthorGraphNode({ data }: NodeProps<AuthorGraphNodeData>) {
  return (
    <div
      className="flex w-[132px] cursor-pointer flex-col items-center gap-1.5"
      style={{
        opacity: data.muted ? 0.36 : 1,
        transition: 'opacity 160ms ease, transform 160ms ease',
        transform: data.selected ? 'translateY(-2px)' : 'translateY(0)',
      }}
      title={data.scopeLabel ? `${data.label} - ${data.scopeLabel}` : data.label}
      role="button"
      aria-label={data.label}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
      <div
        className="grid place-items-center rounded-full border bg-white"
        style={{
          width: data.size,
          height: data.size,
          background: data.color,
          borderColor: data.selected ? '#e7bea7' : 'rgba(255,255,255,0.82)',
          boxShadow: data.selected
            ? '0 0 0 7px rgba(199, 96, 61, 0.14), 0 12px 26px rgba(59, 43, 30, 0.18)'
            : '0 8px 18px rgba(59, 43, 30, 0.14)',
        }}
      >
        <span
          className="font-serif font-semibold leading-none text-white"
          style={{ fontSize: Math.max(20, Math.round(data.size * 0.38)) }}
        >
          {data.initial}
        </span>
      </div>
      <div className="max-w-[120px] rounded-full border border-[#dfd2bf] bg-[#fffaf2]/95 px-2.5 py-1 text-center text-[12px] font-medium leading-none text-[#3c2b1d] shadow-sm">
        <span className="block truncate">{data.compactLabel}</span>
      </div>
      {data.degree > 0 ? (
        <div className="rounded-full bg-[#efe5d5] px-1.5 py-0.5 text-[10px] leading-none text-[#7a6248]">
          {data.degree}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}

const NODE_TYPES = { authorNode: AuthorGraphNode };

export function RelationshipGraph({ nodes, edges }: RelationshipGraphProps) {
  const { t } = useDashboardTranslation();
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>();
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>();

  const preparedNodes = useMemo(() => prepareGraphNodes(nodes, edges), [nodes, edges]);
  const preparedEdges = useMemo(() => prepareGraphEdges(edges, nodes, t), [edges, nodes, t]);
  const activeEdgeId = hoveredEdgeId ?? selectedEdgeId;
  const activeEdge = useMemo(
    () => preparedEdges.find((edge) => edge.id === activeEdgeId),
    [activeEdgeId, preparedEdges],
  );

  const connectedNodeIds = useMemo(() => {
    const connected = new Set<string>();
    if (selectedNodeId) {
      connected.add(selectedNodeId);
      for (const edge of preparedEdges) {
        if (edge.from === selectedNodeId) connected.add(edge.to);
        if (edge.to === selectedNodeId) connected.add(edge.from);
      }
    }
    if (activeEdge) {
      connected.add(activeEdge.from);
      connected.add(activeEdge.to);
    }
    return connected;
  }, [activeEdge, preparedEdges, selectedNodeId]);

  const rfNodes: Node<AuthorGraphNodeData>[] = useMemo(
    () =>
      preparedNodes.map((node) => {
        const hasFocus = Boolean(selectedNodeId || activeEdgeId);
        const selected = selectedNodeId === node.id || connectedNodeIds.has(node.id);
        return {
          id: node.id,
          type: 'authorNode',
          position: node.position,
          data: {
            label: node.label,
            compactLabel: node.compactLabel,
            initial: node.initial,
            scopeLabel: node.scopeLabel,
            color: node.color,
            size: node.size,
            degree: node.degree,
            selected,
            muted: hasFocus && !selected,
          },
          style: { border: 'none', padding: 0, background: 'transparent' },
        };
      }),
    [activeEdgeId, connectedNodeIds, preparedNodes, selectedNodeId],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      preparedEdges.map((edge) => {
        const connectedToSelection = selectedNodeId ? edge.from === selectedNodeId || edge.to === selectedNodeId : true;
        const active = edge.id === activeEdgeId;
        const faded = Boolean(selectedNodeId || activeEdgeId) && !active && !connectedToSelection;
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          type: 'bezier',
          animated: active,
          interactionWidth: 18,
          style: {
            stroke: edge.stroke,
            strokeWidth: active ? edge.strokeWidth + 1.5 : edge.strokeWidth,
            strokeDasharray: edge.strokeDasharray,
            opacity: faded ? 0.16 : active ? 0.96 : connectedToSelection ? 0.68 : 0.48,
          },
        };
      }),
    [activeEdgeId, preparedEdges, selectedNodeId],
  );

  const selectedNode = preparedNodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = preparedEdges.find((edge) => edge.id === selectedEdgeId);
  const inspectorEdges = useMemo(() => {
    const base = selectedNodeId
      ? preparedEdges.filter((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId)
      : preparedEdges;
    return [...base].sort((a, b) => Math.abs(b.intensity) - Math.abs(a.intensity)).slice(0, 8);
  }, [preparedEdges, selectedNodeId]);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_292px]">
      <div className="relative h-[560px] min-w-0 overflow-hidden rounded-lg border border-[#d8c9b6] bg-[#fbf7ef]">
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2 rounded-md border border-[#e3d6c3] bg-[#fffaf2]/90 px-3 py-2 text-[11px] text-[#6f5a42] shadow-sm">
          <LegendItem color="#bf6a48" label={t('author.graph.bands.positive')} />
          <LegendItem color="#c5b9a3" label={t('author.graph.bands.neutral')} />
          <LegendItem color="#805a39" label={t('author.graph.bands.negative')} dashed />
        </div>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.35}
          maxZoom={2}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(undefined);
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(undefined);
          }}
          onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(undefined)}
          onPaneClick={() => {
            setSelectedNodeId(undefined);
            setSelectedEdgeId(undefined);
          }}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={26} color="#e9dfd0" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <aside className="rounded-lg border border-[#d8c9b6] bg-[#fffaf2] p-4 text-sm text-[#3c2b1d]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[#8d7254]">
              {selectedEdge ? t('author.graph.panel.selectedRelationship') : selectedNode ? t('author.graph.panel.selectedCharacter') : t('author.graph.panel.summaryTitle')}
            </p>
            <h3 className="mt-1 text-base font-semibold leading-snug">
              {selectedEdge ? selectedEdge.relationLabel : selectedNode ? selectedNode.label : t('author.graph.panel.defaultTitle')}
            </h3>
          </div>
          <span className="rounded-full border border-[#e1d4c1] bg-white px-2 py-1 text-xs text-[#7a6248]">
            {t('author.graph.panel.summary', { nodes: preparedNodes.length, edges: preparedEdges.length })}
          </span>
        </div>

        {selectedEdge ? (
          <div className="mt-4 rounded-md border border-[#e1d4c1] bg-white p-3">
            <div className="text-sm font-medium">
              {selectedEdge.fromLabel} <span className="text-[#9a8061]">-&gt;</span> {selectedEdge.toLabel}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#efe5d5] px-2 py-1 text-[#6f5a42]">{selectedEdge.bandLabel}</span>
            </div>
          </div>
        ) : null}

        {selectedNode ? (
          <div className="mt-4 rounded-md border border-[#e1d4c1] bg-white p-3">
            <div className="flex items-center justify-between gap-2 text-xs text-[#7a6248]">
              <span>{selectedNode.scopeLabel || t('author.graph.panel.noScope')}</span>
              <span>{t('author.graph.panel.degree', { count: selectedNode.degree })}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[#8d7254]">
            {selectedNode ? t('author.graph.panel.relatedTitle') : t('author.graph.panel.topTitle')}
          </p>
          {inspectorEdges.length ? (
            <div className="space-y-2">
              {inspectorEdges.map((edge) => (
                <RelationshipRow
                  key={edge.id}
                  edge={edge}
                  active={edge.id === selectedEdgeId}
                  onClick={() => {
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(undefined);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[#d8c9b6] bg-white px-3 py-4 text-xs text-[#7a6248]">
              {t('author.graph.panel.emptyEdges')}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function LegendItem({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="block h-0.5 w-5"
        style={{ backgroundColor: color, borderTop: dashed ? `1px dashed ${color}` : undefined }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function RelationshipRow({
  edge,
  active,
  onClick,
}: {
  edge: PreparedGraphEdge;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-[#c7603d] bg-[#f6e5d9]'
          : 'border-[#e1d4c1] bg-white hover:border-[#ceb89f] hover:bg-[#fbf4ea]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: edge.stroke }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{edge.relationLabel}</span>
        <span className="shrink-0 text-[11px] text-[#8d7254]">{edge.bandLabel}</span>
      </div>
      <div className="mt-1 truncate text-xs text-[#7a6248]">
        {edge.fromLabel} - {edge.toLabel}
      </div>
    </button>
  );
}
