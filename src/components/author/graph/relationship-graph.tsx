'use client';

import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { intensityBand } from '@/lib/author/ui/graph-bands';

interface GraphNode {
  id: string;
  label?: string;
  importance?: number;
  color_group?: string;
  scope?: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type?: string;
  intensity?: number;
}

interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const ARCHETYPE_COLORS: Record<string, string> = {
  observer: '#64748b',
  support: '#6366f1',
  antagonist: '#e11d48',
  lead: '#059669',
  character: '#0f172a',
};

const SCOPE_LABELS: Record<string, string> = {
  short1: '단편 1',
  short_demo_30day: '30일 단편 데모',
  short_demo: '단편 데모',
};

function nodeColor(colorGroup: string | undefined): string {
  return ARCHETYPE_COLORS[colorGroup ?? 'character'] ?? ARCHETYPE_COLORS.character;
}

function edgeStroke(intensity: number): { stroke: string; strokeWidth: number; strokeDasharray?: string } {
  const band = intensityBand(intensity);
  let stroke = '#94a3b8';
  let strokeDasharray: string | undefined;

  if (intensity > 0.3) stroke = '#10b981';
  else if (intensity > 0) stroke = '#f59e0b';
  else if (intensity < -0.3) { stroke = '#be123c'; strokeDasharray = '6 3'; }
  else if (intensity < 0) { stroke = '#d97706'; strokeDasharray = '6 3'; }

  return { stroke, strokeWidth: band.strokeWidth, strokeDasharray };
}

function circleLayout(count: number, index: number, radius = 220): { x: number; y: number } {
  if (count === 1) return { x: 0, y: 0 };
  const angle = (2 * Math.PI * index) / count - Math.PI / 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

function AuthorGraphNode({ data }: NodeProps<{ label: string; scopeLabel: string; color: string; size: number }>) {
  return (
    <div
      style={{
        width: data.size,
        height: data.size,
        borderRadius: '50%',
        backgroundColor: data.color,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        cursor: 'default',
      }}
      title={data.scopeLabel}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>
        {data.label}
      </span>
      {data.scopeLabel ? (
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 }}>{data.scopeLabel}</span>
      ) : null}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { authorNode: AuthorGraphNode };

export function RelationshipGraph({ nodes, edges }: RelationshipGraphProps) {
  const { t } = useDashboardTranslation();

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((node, index) => {
        const size = Math.round(24 + (node.importance ?? 0.5) * 32);
        const pos = circleLayout(nodes.length, index);
        const scopeRaw = node.scope ?? '';
        const scopeLabel = SCOPE_LABELS[scopeRaw] ?? scopeRaw;
        const label = node.label ?? node.id;
        const color = nodeColor(node.color_group);
        return {
          id: node.id,
          type: 'authorNode',
          position: { x: pos.x + 300, y: pos.y + 300 },
          data: { label, scopeLabel, color, size },
          style: { border: 'none', padding: 0, background: 'transparent' },
        };
      }),
    [nodes],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const { stroke, strokeWidth, strokeDasharray } = edgeStroke(edge.intensity ?? 0);
        const band = intensityBand(edge.intensity ?? 0);
        const bandLabel = t(`author.graph.bands.${band.key}`);
        const relationLabel = t(`author.graph.relation.${edge.type ?? 'unknown'}`);
        const label = `${relationLabel} · ${bandLabel}`;
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          label,
          style: { stroke, strokeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
          labelStyle: { fontSize: 10, fill: '#64748b' },
          labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.85 },
        };
      }),
    [edges, t],
  );

  const [rfNodeState, , onNodesChange] = useNodesState(rfNodes);
  const [rfEdgeState, , onEdgesChange] = useEdgesState(rfEdges);

  const onInit = useCallback(() => {}, []);

  return (
    <div style={{ width: '100%', height: 480, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <ReactFlow
        nodes={rfNodeState}
        edges={rfEdgeState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2.5}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} color="#f1f5f9" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
