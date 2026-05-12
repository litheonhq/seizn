import { describe, expect, it } from 'vitest';
import { GRAPH_VIEWBOX, layoutDashboardGraph } from '@/components/dashboard/redesign/views/graph-layout';
import type { GraphEdge } from '@/components/dashboard/redesign/views/types';

describe('dashboard graph layout', () => {
  it('keeps dense author graph nodes inside the viewbox with useful spacing', () => {
    const inputs = Array.from({ length: 13 }, (_, index) => ({
      id: `char-${index}`,
      label: `Character ${index}`,
      role: index < 2 ? ('Lead' as const) : index < 5 ? ('Supporting' as const) : ('Minor' as const),
    }));
    const edges: GraphEdge[] = inputs.slice(1).map((node, index) => ({
      a: 'char-0',
      b: node.id,
      kind: index % 2 ? 'club_member:quiet_peer' : 'friend_class_adjacent:club_core',
      strength: index % 2 ? 0.4 : -0.2,
      conflict: false,
    }));

    const nodes = layoutDashboardGraph(inputs, edges);
    const distances = nodes.flatMap((a, i) =>
      nodes.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
    );

    expect(nodes.every((node) => node.x > node.r && node.x < GRAPH_VIEWBOX.width - node.r)).toBe(true);
    expect(nodes.every((node) => node.y > node.r && node.y < GRAPH_VIEWBOX.height - node.r)).toBe(true);
    expect(Math.min(...distances)).toBeGreaterThan(100);
  });
});
