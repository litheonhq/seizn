import type {
  NpcGraphEdge,
  NpcGraphNode,
  NpcRelationshipGraphData,
  NpcTimelineData,
  NpcTimelineEventType,
} from './types';

const TIMELINE_COLORS: Record<NpcTimelineEventType, string> = {
  memory: '#E5E7EB',
  'canon-hit': '#A78BFA',
  gossip: '#F59E0B',
  moderation: '#F87171',
};

const GRAPH_COLORS: Record<NpcGraphNode['type'], string> = {
  npc: '#A78BFA',
  player: '#22D3EE',
  fact: '#94A3B8',
};

const EDGE_COLORS: Record<NpcGraphEdge['type'], string> = {
  trust: '#34D399',
  rivalry: '#F87171',
  knowledge: '#A78BFA',
  gossip: '#F59E0B',
};

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function scaleTime(value: string, start: number, end: number, top: number, bottom: number): number {
  const span = Math.max(end - start, 1);
  return top + ((parseTime(value) - start) / span) * (bottom - top);
}

export function renderTimelineSvg(data: NpcTimelineData, options: { width?: number; height?: number } = {}): string {
  const width = options.width || 1120;
  const height = options.height || Math.max(620, data.events.length * 24 + 120);
  const left = 190;
  const top = 56;
  const bottom = height - 52;
  const start = parseTime(data.range.start);
  const end = parseTime(data.range.end);
  const rows = data.events.map((event, index) => {
    const y = scaleTime(event.occurredAt, start, end, top, bottom);
    const jitter = (index % 2) * 18;
    const x = left + 42 + jitter;
    const color = TIMELINE_COLORS[event.type];
    return `
      <g>
        <line x1="${left}" y1="${y.toFixed(1)}" x2="${x - 12}" y2="${y.toFixed(1)}" stroke="#2A2A3A" stroke-width="1" />
        <circle cx="${x}" cy="${y.toFixed(1)}" r="${Math.max(5, Math.min(13, event.weight + 3))}" fill="${color}" opacity="0.95" />
        <text x="${x + 22}" y="${(y - 5).toFixed(1)}" fill="#F8FAFC" font-size="13" font-family="Inter, Arial">${escapeXml(event.title)}</text>
        <text x="${x + 22}" y="${(y + 13).toFixed(1)}" fill="#94A3B8" font-size="11" font-family="Inter, Arial">${escapeXml(event.body)}</text>
      </g>`;
  }).join('');

  const tickRows = data.ticks.map((tick) => {
    const y = scaleTime(tick.at, start, end, top, bottom);
    return `
      <g>
        <line x1="${left - 8}" y1="${y.toFixed(1)}" x2="${width - 42}" y2="${y.toFixed(1)}" stroke="#1F2937" stroke-width="1" stroke-dasharray="4 8" />
        <text x="28" y="${(y + 4).toFixed(1)}" fill="#94A3B8" font-size="11" font-family="Inter, Arial">${escapeXml(tick.label)}</text>
      </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0A0A12" />
  <text x="28" y="32" fill="#A78BFA" font-size="12" font-family="Inter, Arial" letter-spacing="2">NPC TIMELINE</text>
  <text x="190" y="34" fill="#F8FAFC" font-size="20" font-family="Inter, Arial">${escapeXml(data.npcId)}</text>
  <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#A78BFA" stroke-width="2" />
  ${tickRows}
  ${rows}
</svg>`;
}

function nodePoint(node: NpcGraphNode, index: number, count: number, width: number, height: number) {
  if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
    return {
      x: width / 2 + (node.x || 0),
      y: height / 2 + (node.y || 0),
    };
  }
  const radius = Math.min(width, height) * 0.36;
  const angle = (index / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

function sourceId(value: string | NpcGraphNode): string {
  return typeof value === 'string' ? value : value.id;
}

export function renderRelationshipGraphSvg(
  data: NpcRelationshipGraphData,
  options: { width?: number; height?: number } = {}
): string {
  const width = options.width || 1120;
  const height = options.height || 720;
  const points = new Map<string, { x: number; y: number }>();
  data.nodes.forEach((node, index) => {
    points.set(node.id, nodePoint(node, index, data.nodes.length, width, height));
  });

  const edgeRows = data.edges.map((edge) => {
    const source = points.get(sourceId(edge.source));
    const target = points.get(sourceId(edge.target));
    if (!source || !target) return '';
    return `<line x1="${source.x.toFixed(1)}" y1="${source.y.toFixed(1)}" x2="${target.x.toFixed(1)}" y2="${target.y.toFixed(1)}" stroke="${EDGE_COLORS[edge.type]}" stroke-width="${Math.max(1, edge.weight / 1.8).toFixed(1)}" opacity="0.58" />`;
  }).join('');

  const nodeRows = data.nodes.map((node) => {
    const point = points.get(node.id) || { x: width / 2, y: height / 2 };
    const radius = Math.max(8, Math.min(22, node.weight + 6));
    return `
      <g>
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius}" fill="${GRAPH_COLORS[node.type]}" opacity="0.95" />
        <text x="${(point.x + radius + 8).toFixed(1)}" y="${(point.y + 4).toFixed(1)}" fill="#F8FAFC" font-size="12" font-family="Inter, Arial">${escapeXml(node.label)}</text>
      </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0A0A12" />
  <text x="28" y="32" fill="#A78BFA" font-size="12" font-family="Inter, Arial" letter-spacing="2">RELATIONSHIP GRAPH</text>
  <text x="240" y="34" fill="#F8FAFC" font-size="20" font-family="Inter, Arial">${escapeXml(data.npcId)}</text>
  ${edgeRows}
  ${nodeRows}
</svg>`;
}
