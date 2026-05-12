import { intensityBand } from '@/lib/author/ui/graph-bands';

export interface GraphNode {
  id: string;
  label?: string;
  importance?: number;
  color_group?: string;
  scope?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type?: string;
  intensity?: number;
  valid_at?: string;
}

export interface PreparedGraphNode {
  id: string;
  label: string;
  compactLabel: string;
  initial: string;
  scopeLabel: string;
  color: string;
  size: number;
  degree: number;
  position: { x: number; y: number };
}

export interface PreparedGraphEdge {
  id: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  relationLabel: string;
  relationKey: string;
  bandKey: string;
  bandLabel: string;
  intensity: number;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

const ARCHETYPE_COLORS: Record<string, string> = {
  observer: '#9b8f7a',
  support: '#6f8f7a',
  antagonist: '#8b5e3c',
  lead: '#c7603d',
  character: '#7f633f',
};

const SCOPE_LABELS: Record<string, string> = {
  short1: 'Short 1',
  short_demo_30day: '30-day short demo',
  short_demo: 'Short demo',
};

const TRANSLATED_RELATION_KEYS = new Set([
  'acquaintance',
  'best_friend',
  'classmate',
  'club_member',
  'co_lead',
  'crush',
  'family',
  'friend_class_adjacent',
  'informant',
  'mentor',
  'partner',
  'rival',
  'senior_mentor',
  'sibling',
  'teammate',
  'unknown',
]);

function nodeColor(colorGroup: string | undefined): string {
  return ARCHETYPE_COLORS[colorGroup ?? 'character'] ?? ARCHETYPE_COLORS.character;
}

export function edgeStroke(intensity: number): { stroke: string; strokeWidth: number; strokeDasharray?: string } {
  const band = intensityBand(intensity);
  let stroke = '#c5b9a3';
  let strokeDasharray: string | undefined;

  if (intensity > 0.3) stroke = '#bf6a48';
  else if (intensity > 0) stroke = '#d89a5a';
  else if (intensity < -0.3) {
    stroke = '#805a39';
    strokeDasharray = '6 4';
  } else if (intensity < 0) {
    stroke = '#a57a4e';
    strokeDasharray = '6 4';
  }

  return { stroke, strokeWidth: band.strokeWidth, strokeDasharray };
}

function degreeMap(edges: GraphEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

function circlePoint(count: number, index: number, radius: number, centerX: number, centerY: number): { x: number; y: number } {
  if (count <= 1) return { x: centerX, y: centerY };
  const angle = (2 * Math.PI * index) / count - Math.PI / 2;
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const count = nodes.length;
  const centerX = 420;
  const centerY = 300;

  if (count === 0) return positions;
  if (count <= 8) {
    const radius = Math.max(180, count * 34);
    nodes.forEach((node, index) => positions.set(node.id, circlePoint(count, index, radius, centerX, centerY)));
    return positions;
  }

  const degrees = degreeMap(edges);
  const ranked = [...nodes].sort((a, b) => {
    const degreeDelta = (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
    if (degreeDelta !== 0) return degreeDelta;
    return (b.importance ?? 0) - (a.importance ?? 0);
  });
  const hubCount = Math.min(3, Math.max(1, Math.ceil(count / 7)));
  const hubs = ranked.slice(0, hubCount);
  const outer = ranked.slice(hubCount);
  const hubStep = hubCount === 1 ? 0 : 126;
  const hubMid = (hubCount - 1) / 2;

  hubs.forEach((node, index) => {
    const distanceFromMiddle = Math.abs(index - hubMid);
    positions.set(node.id, {
      x: centerX + (index - hubMid) * hubStep,
      y: centerY - 84 + distanceFromMiddle * 24,
    });
  });

  const outerRadius = Math.max(270, Math.min(430, outer.length * 34));
  outer.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / outer.length - Math.PI / 2 + Math.PI / outer.length;
    positions.set(node.id, {
      x: centerX + outerRadius * Math.cos(angle),
      y: centerY + 32 + outerRadius * 0.82 * Math.sin(angle),
    });
  });

  return positions;
}

export function displayCharacterName(node: Pick<GraphNode, 'id' | 'label'>): string {
  const raw = (node.label || node.id || '').trim();
  if (!raw) return 'Unknown';
  if (node.label) return raw;
  const parts = raw.split(/[.:/]/).filter(Boolean);
  const last = parts[parts.length - 1] ?? raw;
  return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function compactCharacterLabel(label: string, maxLength = 12): string {
  const withoutParenthetical = label.replace(/\s*[\(\uFF08][^\)\uFF09]{1,12}[\)\uFF09]\s*$/u, '').trim();
  const base = withoutParenthetical || label;
  const chars = Array.from(base);
  if (chars.length <= maxLength) return base;
  return `${chars.slice(0, maxLength - 1).join('')}...`;
}

export function initialForLabel(label: string): string {
  const first = Array.from(label).find((char) => /\S/u.test(char) && !/[()[\]{}]/.test(char));
  return first ? first.toLocaleUpperCase() : '?';
}

export function canonicalRelationType(type: string | undefined): string {
  const raw = (type || 'unknown').trim().toLowerCase();
  if (!raw) return 'unknown';
  const primary = raw.split(':')[0] || raw;
  return primary.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

export function humanizeRelationType(type: string | undefined): string {
  const key = canonicalRelationType(type);
  if (key === 'unknown') return 'Unknown';
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function resolveRelationLabel(type: string | undefined, t: Translate): { key: string; label: string } {
  const key = canonicalRelationType(type);
  if (TRANSLATED_RELATION_KEYS.has(key)) {
    return { key, label: t(`author.graph.relation.${key}`) };
  }
  return { key, label: humanizeRelationType(type) };
}

export function prepareGraphNodes(nodes: GraphNode[], edges: GraphEdge[]): PreparedGraphNode[] {
  const degrees = degreeMap(edges);
  const positions = layoutNodes(nodes, edges);

  return nodes.map((node) => {
    const label = displayCharacterName(node);
    const compactLabel = compactCharacterLabel(label);
    const importance = Math.max(0, Math.min(1, node.importance ?? 0.5));
    const degree = degrees.get(node.id) ?? 0;
    const size = Math.round(46 + importance * 20 + Math.min(degree, 5) * 2);
    const scopeRaw = node.scope ?? '';
    return {
      id: node.id,
      label,
      compactLabel,
      initial: initialForLabel(compactLabel),
      scopeLabel: SCOPE_LABELS[scopeRaw] ?? scopeRaw,
      color: nodeColor(node.color_group),
      size,
      degree,
      position: positions.get(node.id) ?? { x: 420, y: 300 },
    };
  });
}

export function prepareGraphEdges(edges: GraphEdge[], nodes: GraphNode[], t: Translate): PreparedGraphEdge[] {
  const names = new Map(nodes.map((node) => [node.id, displayCharacterName(node)]));

  return edges.map((edge) => {
    const intensity = Math.max(-1, Math.min(1, edge.intensity ?? 0));
    const { stroke, strokeWidth, strokeDasharray } = edgeStroke(intensity);
    const band = intensityBand(intensity);
    const relation = resolveRelationLabel(edge.type, t);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromLabel: names.get(edge.from) ?? displayCharacterName({ id: edge.from }),
      toLabel: names.get(edge.to) ?? displayCharacterName({ id: edge.to }),
      relationLabel: relation.label,
      relationKey: relation.key,
      bandKey: band.key,
      bandLabel: t(`author.graph.bands.${band.key}`),
      intensity,
      stroke,
      strokeWidth,
      strokeDasharray,
    };
  });
}
