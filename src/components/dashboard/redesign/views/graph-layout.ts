import type { CharacterRole } from '../types';
import type { GraphEdge, GraphNode } from './types';

export const GRAPH_VIEWBOX = {
  width: 760,
  height: 520,
} as const;

interface GraphNodeInput {
  id: string;
  label: string;
  role: CharacterRole;
}

function degreeMap(edges: GraphEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.a, (degrees.get(edge.a) ?? 0) + 1);
    degrees.set(edge.b, (degrees.get(edge.b) ?? 0) + 1);
  }
  return degrees;
}

function ellipsePoint(
  count: number,
  index: number,
  radiusX: number,
  radiusY: number,
  centerX: number,
  centerY: number,
) {
  if (count <= 1) return { x: centerX, y: centerY };
  const angle = (2 * Math.PI * index) / count - Math.PI / 2;
  return {
    x: centerX + radiusX * Math.cos(angle),
    y: centerY + radiusY * Math.sin(angle),
  };
}

function radiusForRole(role: CharacterRole, degree: number): number {
  const base = role === 'Lead' ? 34 : role === 'Supporting' ? 24 : 18;
  return Math.round(base + Math.min(7, degree * 1.4));
}

export function layoutDashboardGraph(nodes: GraphNodeInput[], edges: GraphEdge[]): GraphNode[] {
  const count = nodes.length;
  const centerX = GRAPH_VIEWBOX.width / 2;
  const centerY = GRAPH_VIEWBOX.height / 2;
  const degrees = degreeMap(edges);
  const positions = new Map<string, { x: number; y: number }>();

  if (count <= 8) {
    const radiusX = Math.min(280, Math.max(190, count * 34));
    const radiusY = Math.min(180, radiusX * 0.72);
    nodes.forEach((node, index) => {
      positions.set(node.id, ellipsePoint(count, index, radiusX, radiusY, centerX, centerY));
    });
  } else {
    const ranked = [...nodes].sort((a, b) => {
      const degreeDelta = (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
      if (degreeDelta !== 0) return degreeDelta;
      if (a.role !== b.role) {
        const rank = { Lead: 0, Supporting: 1, Minor: 2 };
        return rank[a.role] - rank[b.role];
      }
      return a.label.localeCompare(b.label);
    });
    const hubCount = Math.min(3, Math.max(1, Math.ceil(count / 7)));
    const hubs = ranked.slice(0, hubCount);
    const outer = ranked.slice(hubCount);
    const hubMid = (hubCount - 1) / 2;

    hubs.forEach((node, index) => {
      positions.set(node.id, {
        x: centerX + (index - hubMid) * 138,
        y: centerY - 86 + Math.abs(index - hubMid) * 22,
      });
    });

    const outerRadius = Math.max(280, Math.min(335, outer.length * 35));
    outer.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / outer.length - Math.PI / 2 + Math.PI / outer.length;
      positions.set(node.id, {
        x: centerX + outerRadius * Math.cos(angle),
        y: centerY + 16 + outerRadius * 0.62 * Math.sin(angle),
      });
    });
  }

  return nodes.map((node) => {
    const degree = degrees.get(node.id) ?? 0;
    const point = positions.get(node.id) ?? { x: centerX, y: centerY };
    return {
      ...node,
      x: Math.round(point.x),
      y: Math.round(point.y),
      r: radiusForRole(node.role, degree),
    };
  });
}
