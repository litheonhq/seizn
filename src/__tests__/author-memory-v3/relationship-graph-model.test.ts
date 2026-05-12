import { describe, expect, it } from 'vitest';
import {
  canonicalRelationType,
  compactCharacterLabel,
  prepareGraphNodes,
  resolveRelationLabel,
  type GraphEdge,
  type GraphNode,
} from '@/components/author/graph/relationship-graph-model';

const t = (key: string) => {
  const labels: Record<string, string> = {
    'author.graph.relation.club_member': 'Club member',
    'author.graph.relation.unknown': 'Unknown',
    'author.graph.bands.positive': 'Affinity',
    'author.graph.bands.neutral': 'Neutral',
  };
  return labels[key] ?? key.split('.').pop() ?? key;
};

describe('relationship graph display model', () => {
  it('canonicalizes generated relation ids before translation', () => {
    expect(canonicalRelationType('club_member:grace_under_pressure:partner')).toBe('club_member');
    expect(resolveRelationLabel('club_member:quiet_peer', t)).toEqual({
      key: 'club_member',
      label: 'Club member',
    });
  });

  it('humanizes unknown relation keys without exposing the full raw id', () => {
    const relation = resolveRelationLabel('secret_keeper:chapter_12_private', t);
    expect(relation).toEqual({
      key: 'secret_keeper',
      label: 'Secret Keeper',
    });
  });

  it('keeps character labels compact enough for graph nodes', () => {
    expect(compactCharacterLabel('Dori (道利)')).toBe('Dori');
    expect(compactCharacterLabel('Very Long Character Name')).toBe('Very Long C...');
  });

  it('spreads dense graphs so nodes do not start on top of each other', () => {
    const nodes: GraphNode[] = Array.from({ length: 13 }, (_, index) => ({
      id: `char-${index}`,
      label: `Character ${index}`,
      importance: index < 3 ? 0.9 : 0.4,
    }));
    const edges: GraphEdge[] = nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      from: 'char-0',
      to: node.id,
      intensity: index % 2 === 0 ? 0.6 : -0.2,
    }));
    const prepared = prepareGraphNodes(nodes, edges);
    const distances = prepared.flatMap((a, i) =>
      prepared.slice(i + 1).map((b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)),
    );

    expect(Math.min(...distances)).toBeGreaterThan(96);
  });
});
