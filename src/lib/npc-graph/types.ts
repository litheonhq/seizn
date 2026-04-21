export type NpcTimelineEventType = 'memory' | 'canon-hit' | 'gossip' | 'moderation';
export type NpcGraphNodeType = 'npc' | 'player' | 'fact';
export type NpcGraphEdgeType = 'trust' | 'rivalry' | 'knowledge' | 'gossip';

export interface NpcTimelineEvent {
  id: string;
  type: NpcTimelineEventType;
  title: string;
  body: string;
  occurredAt: string;
  weight: number;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NpcTimelineTick {
  at: string;
  label: string;
}

export interface NpcTimelineData {
  npcId: string;
  generatedAt: string;
  range: {
    start: string;
    end: string;
  };
  ticks: NpcTimelineTick[];
  events: NpcTimelineEvent[];
  stats: {
    totalEvents: number;
    memoryEvents: number;
    canonHits: number;
    gossipEvents: number;
    moderationEvents: number;
  };
}

export interface NpcGraphNode {
  id: string;
  label: string;
  type: NpcGraphNodeType;
  weight: number;
  latestAt?: string | null;
  x?: number;
  y?: number;
}

export interface NpcGraphEdge {
  id: string;
  source: string;
  target: string;
  type: NpcGraphEdgeType;
  label: string;
  weight: number;
  confidence: number;
  events: number;
  latestAt?: string | null;
}

export interface NpcRelationshipGraphData {
  npcId: string;
  generatedAt: string;
  nodes: NpcGraphNode[];
  edges: NpcGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    trustEdges: number;
    rivalryEdges: number;
    knowledgeEdges: number;
    gossipEdges: number;
  };
}
