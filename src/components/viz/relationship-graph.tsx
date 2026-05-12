"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ComponentType, type MutableRefObject } from "react";
import { Download, RefreshCw, Target } from "lucide-react";
import type {
  ForceGraphMethods,
  ForceGraphProps,
} from "react-force-graph-2d";
import type {
  NpcGraphEdge,
  NpcGraphNode,
  NpcRelationshipGraphData,
} from "@/lib/npc-graph/types";
import { readApiJson } from "@/lib/client/api-json";
import { renderRelationshipGraphSvg } from "@/lib/npc-graph/svg";
import { getErrorMessage } from "@/lib/ui-error";

interface RelationshipGraphProps {
  data: NpcRelationshipGraphData;
  apiUrl?: string;
}

type ForceGraphComponent = ComponentType<
  ForceGraphProps<NpcGraphNode, NpcGraphEdge> & {
    ref?: MutableRefObject<ForceGraphMethods<NpcGraphNode, NpcGraphEdge> | undefined>;
  }
>;

type RelationshipGraphApiResponse = {
  data?: {
    graph?: NpcRelationshipGraphData;
  };
};

const ForceGraph2D = dynamic<ForceGraphProps<NpcGraphNode, NpcGraphEdge>>(
  () => import("react-force-graph-2d"),
  { ssr: false }
) as ForceGraphComponent;

const NODE_COLORS: Record<NpcGraphNode["type"], string> = {
  npc: "#A78BFA",
  player: "#22D3EE",
  fact: "#94A3B8",
};

const EDGE_COLORS: Record<NpcGraphEdge["type"], string> = {
  trust: "#34D399",
  rivalry: "#F87171",
  knowledge: "#A78BFA",
  gossip: "#F59E0B",
};

function linkEndpointId(value: unknown): string {
  if (typeof value === "object" && value && "id" in value) {
    return String((value as { id?: unknown }).id);
  }
  return String(value);
}

function toForceData(data: NpcRelationshipGraphData) {
  return {
    nodes: data.nodes.map((node) => ({ ...node })),
    links: data.edges.map((edge) => ({ ...edge })),
  };
}

function downloadText(fileName: string, content: string) {
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RelationshipGraph({ data, apiUrl }: RelationshipGraphProps) {
  const graphRef = useRef<ForceGraphMethods<NpcGraphNode, NpcGraphEdge> | undefined>(undefined);
  const [graphData, setGraphData] = useState(() => toForceData(data));
  const [current, setCurrent] = useState(data);
  const [selectedNode, setSelectedNode] = useState<NpcGraphNode | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(data);
    setGraphData(toForceData(data));
  }, [data]);

  const graphForExport = useMemo<NpcRelationshipGraphData>(() => ({
    ...current,
    nodes: graphData.nodes.map((node) => ({
      id: String(node.id),
      label: String(node.label || node.id),
      type: node.type,
      weight: Number(node.weight || 1),
      latestAt: node.latestAt || null,
      x: typeof node.x === "number" ? node.x : undefined,
      y: typeof node.y === "number" ? node.y : undefined,
    })),
    edges: graphData.links.map((link) => ({
      id: String(link.id),
      source: linkEndpointId(link.source),
      target: linkEndpointId(link.target),
      type: link.type,
      label: link.label,
      weight: Number(link.weight || 1),
      confidence: Number(link.confidence || 0),
      events: Number(link.events || 1),
      latestAt: link.latestAt || null,
    })),
  }), [current, graphData]);

  async function refresh() {
    if (!apiUrl) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch(apiUrl);
      const payload = await readApiJson<RelationshipGraphApiResponse>(
        response,
        "Relationship graph could not be refreshed",
      );
      const next = payload?.data?.graph as NpcRelationshipGraphData | undefined;
      if (next) {
        setCurrent(next);
        setGraphData(toForceData(next));
      } else {
        setRefreshError("Relationship graph response did not include graph data.");
      }
    } catch (error) {
      setRefreshError(getErrorMessage(error, "Relationship graph could not be refreshed."));
    } finally {
      setIsRefreshing(false);
    }
  }

  function exportSvg() {
    downloadText(`${current.npcId}-relationship-graph.svg`, renderRelationshipGraphSvg(graphForExport));
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-szn-border-subtle bg-szn-border-subtle md:grid-cols-5">
          <Metric label="Nodes" value={current.stats.nodeCount.toLocaleString()} />
          <Metric label="Edges" value={current.stats.edgeCount.toLocaleString()} />
          <Metric label="Trust" value={current.stats.trustEdges.toLocaleString()} />
          <Metric label="Rivalry" value={current.stats.rivalryEdges.toLocaleString()} />
          <Metric label="Knowledge" value={(current.stats.knowledgeEdges + current.stats.gossipEdges).toLocaleString()} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => graphRef.current?.zoomToFit(400, 80)} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
            <Target className="h-4 w-4" aria-hidden="true" />
            Fit
          </button>
          {apiUrl && (
            <button type="button" onClick={() => void refresh()} disabled={isRefreshing} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-60">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          )}
          <button type="button" onClick={exportSvg} className="szn-btn-signal inline-flex items-center gap-2 px-3 py-2 text-sm">
            <Download className="h-4 w-4" aria-hidden="true" />
            SVG
          </button>
        </div>
      </div>

      {refreshError ? (
        <p className="border border-szn-danger bg-szn-surface px-3 py-2 text-sm text-szn-danger">
          {refreshError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-[72vh] min-h-[560px] overflow-hidden border border-szn-border-subtle bg-szn-surface-1">
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeId="id"
            nodeLabel={(node) => `${node.label} (${node.type})`}
            nodeVal={(node) => Math.max(2, Number(node.weight || 1))}
            nodeColor={(node) => NODE_COLORS[node.type] || "#A78BFA"}
            linkColor={(link) => EDGE_COLORS[link.type] || "#A78BFA"}
            linkWidth={(link) => Math.max(1, Number(link.weight || 1) / 2)}
            linkDirectionalParticles={(link) => (link.type === "gossip" ? 2 : 0)}
            linkDirectionalParticleWidth={2}
            linkDirectionalArrowLength={4}
            backgroundColor="#0A0A12"
            cooldownTicks={80}
            d3VelocityDecay={0.42}
            enableNodeDrag
            onEngineStop={() => graphRef.current?.zoomToFit(350, 70)}
            onNodeClick={(node) => setSelectedNode(node)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = String(node.label || node.id);
              const fontSize = Math.max(8, 12 / globalScale);
              ctx.fillStyle = NODE_COLORS[node.type] || "#A78BFA";
              ctx.beginPath();
              ctx.arc(node.x || 0, node.y || 0, Math.max(5, Math.min(16, Number(node.weight || 1) + 5)), 0, 2 * Math.PI);
              ctx.fill();
              ctx.font = `${fontSize}px Inter, sans-serif`;
              ctx.fillStyle = "#F8FAFC";
              ctx.fillText(label, (node.x || 0) + 10, (node.y || 0) + 4);
            }}
          />
        </div>
        <aside className="border border-szn-border-subtle bg-szn-surface-1 p-4">
          <div className="text-xs uppercase text-szn-text-3">Selected</div>
          {selectedNode ? (
            <div className="mt-4 space-y-3">
              <h2 className="break-all text-lg font-semibold text-szn-text-1">{selectedNode.label}</h2>
              <div className="font-mono text-xs text-szn-text-2">{selectedNode.id}</div>
              <div className="inline-flex border border-szn-border-subtle px-2 py-1 text-xs text-szn-signal">
                {selectedNode.type}
              </div>
              <p className="text-sm text-szn-text-2">
                Weight {selectedNode.weight.toLocaleString()} across visible belief and gossip edges.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-szn-text-2">Select a node to inspect entity weight and type.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-szn-bg px-4 py-3">
      <div className="text-xl font-semibold text-szn-text-1">{value}</div>
      <div className="mt-1 text-[11px] uppercase text-szn-text-3">{label}</div>
    </div>
  );
}
