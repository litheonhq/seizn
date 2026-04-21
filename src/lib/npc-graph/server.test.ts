import { describe, expect, it } from 'vitest';
import {
  buildTimelineTicks,
  createSampleRelationshipGraph,
  createSampleTimelineData,
} from './server';
import {
  renderRelationshipGraphSvg,
  renderTimelineSvg,
} from './svg';

describe('npc graph utilities', () => {
  it('builds a 500-event sample timeline with stable ticks', () => {
    const timeline = createSampleTimelineData('archivist_vale', 500);

    expect(timeline.events).toHaveLength(500);
    expect(timeline.stats.totalEvents).toBe(500);
    expect(buildTimelineTicks(timeline.events).length).toBeGreaterThanOrEqual(2);
  });

  it('builds a 100 NPC relationship graph for force rendering', () => {
    const graph = createSampleRelationshipGraph('archivist_vale', 100);

    expect(graph.nodes.length).toBe(101);
    expect(graph.edges.length).toBe(100);
    expect(graph.stats.edgeCount).toBe(100);
  });

  it('renders exportable SVG for timeline and graph data', () => {
    const timelineSvg = renderTimelineSvg(createSampleTimelineData('archivist_vale', 4));
    const graphSvg = renderRelationshipGraphSvg(createSampleRelationshipGraph('archivist_vale', 4));

    expect(timelineSvg).toContain('<svg');
    expect(timelineSvg).toContain('NPC TIMELINE');
    expect(graphSvg).toContain('<svg');
    expect(graphSvg).toContain('RELATIONSHIP GRAPH');
  });
});
