"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Minus, Plus } from "lucide-react";
import type { NpcTimelineData, NpcTimelineEventType } from "@/lib/npc-graph/types";

interface TimelineProps {
  data: NpcTimelineData;
}

const TYPE_COLORS: Record<NpcTimelineEventType, string> = {
  memory: "#E5E7EB",
  "canon-hit": "#A78BFA",
  gossip: "#F59E0B",
  moderation: "#F87171",
};

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function yForTime(value: string, start: number, end: number, top: number, bottom: number) {
  const span = Math.max(end - start, 1);
  return top + ((parseTime(value) - start) / span) * (bottom - top);
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

export function Timeline({ data }: TimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const baseHeight = Math.max(580, data.events.length * 26 + 120);
  const height = Math.min(18000, Math.round(baseHeight * zoom));
  const width = 1120;
  const top = 60 + pan;
  const bottom = height - 52 + pan;
  const start = parseTime(data.range.start);
  const end = parseTime(data.range.end);

  const eventRows = useMemo(() => data.events.map((event, index) => {
    const y = yForTime(event.occurredAt, start, end, top, bottom);
    const x = 250 + (index % 2) * 18;
    return { event, x, y };
  }), [bottom, data.events, end, start, top]);

  function exportSvg() {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    downloadText(`${data.npcId}-timeline.svg`, xml);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-szn-border-subtle bg-szn-border-subtle md:grid-cols-5">
          <Metric label="Events" value={data.stats.totalEvents.toLocaleString()} />
          <Metric label="Memory" value={data.stats.memoryEvents.toLocaleString()} />
          <Metric label="Canon" value={data.stats.canonHits.toLocaleString()} />
          <Metric label="Gossip" value={data.stats.gossipEvents.toLocaleString()} />
          <Metric label="Moderation" value={data.stats.moderationEvents.toLocaleString()} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
            <Minus className="h-4 w-4" aria-hidden="true" />
            Zoom
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.2))} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Zoom
          </button>
          <button type="button" onClick={() => setPan((value) => value - 80)} className="szn-btn-ghost px-3 py-2 text-sm">
            Pan up
          </button>
          <button type="button" onClick={() => setPan((value) => value + 80)} className="szn-btn-ghost px-3 py-2 text-sm">
            Pan down
          </button>
          <button type="button" onClick={exportSvg} className="szn-btn-signal inline-flex items-center gap-2 px-3 py-2 text-sm">
            <Download className="h-4 w-4" aria-hidden="true" />
            SVG
          </button>
        </div>
      </div>

      <div className="max-h-[74vh] overflow-auto border border-szn-border-subtle bg-szn-surface-1">
        <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="min-w-[1120px]">
          <rect width="100%" height="100%" fill="#0A0A12" />
          <text x="28" y="34" fill="#A78BFA" fontSize="12" letterSpacing="2">NPC TIMELINE</text>
          <text x="190" y="36" fill="#F8FAFC" fontSize="21">{data.npcId}</text>
          <line x1="190" y1={top} x2="190" y2={bottom} stroke="#A78BFA" strokeWidth="2" />
          {data.ticks.map((tick) => {
            const y = yForTime(tick.at, start, end, top, bottom);
            return (
              <g key={tick.at}>
                <line x1="182" y1={y} x2={width - 36} y2={y} stroke="#1F2937" strokeWidth="1" strokeDasharray="4 8" />
                <text x="28" y={y + 4} fill="#94A3B8" fontSize="11">{tick.label}</text>
              </g>
            );
          })}
          {eventRows.map(({ event, x, y }) => (
            <g key={event.id}>
              <line x1="190" y1={y} x2={x - 12} y2={y} stroke="#2A2A3A" strokeWidth="1" />
              <circle cx={x} cy={y} r={Math.max(5, Math.min(13, event.weight + 3))} fill={TYPE_COLORS[event.type]} opacity="0.95" />
              <text x={x + 22} y={y - 5} fill="#F8FAFC" fontSize="13">{event.title}</text>
              <text x={x + 22} y={y + 13} fill="#94A3B8" fontSize="11">{event.body}</text>
            </g>
          ))}
        </svg>
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
