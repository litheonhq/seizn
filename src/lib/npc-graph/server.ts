import { createServerClient } from '@/lib/supabase';
import type {
  NpcGraphEdge,
  NpcGraphEdgeType,
  NpcGraphNode,
  NpcRelationshipGraphData,
  NpcTimelineData,
  NpcTimelineEvent,
  NpcTimelineEventType,
  NpcTimelineTick,
} from './types';

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface NpcGraphContext {
  supabase: SupabaseLike;
  userId: string;
  organizationId: string | null;
}

interface LoadOptions {
  limit?: number;
}

const MEMORY_SELECT =
  'id, user_id, organization_id, entity_id, content, memory_type, tags, namespace, importance, agent_id, companion_meta, moderation_status, created_at, updated_at, is_deleted';

const GOSSIP_SELECT =
  'id, user_id, organization_id, namespace, source_belief_id, fact_original, fact_transmitted, from_entity_id, to_entity_id, channel, distortion_model, confidence, propagated_at, created_at';

const BELIEF_SELECT =
  'id, organization_id, holder_entity_id, about_fact_id, observed_at, witness_event_id, confidence, revoked_at, source_type, created_at';

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function metaObject(row: Record<string, unknown>): Record<string, unknown> {
  return row.companion_meta && typeof row.companion_meta === 'object' && !Array.isArray(row.companion_meta)
    ? (row.companion_meta as Record<string, unknown>)
    : {};
}

function deriveNpcId(row: Record<string, unknown>): string | null {
  const meta = metaObject(row);
  return (
    normalizeString(row.entity_id) ||
    normalizeString(meta.npc_id) ||
    normalizeString(meta.npcId) ||
    normalizeString(meta.character_id) ||
    normalizeString(meta.characterId) ||
    normalizeString(row.agent_id)
  );
}

function matchesNpc(row: Record<string, unknown>, npcId: string): boolean {
  return deriveNpcId(row) === npcId;
}

function entityLabel(entityId: string): string {
  if (/^player[:_-]?/i.test(entityId)) return entityId.replace(/[:_-]+/g, ' ');
  return entityId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 48);
}

function entityType(entityId: string): NpcGraphNode['type'] {
  return /^player[:_-]?/i.test(entityId) ? 'player' : 'npc';
}

function eventWeight(value: unknown): number {
  return clamp(Math.round(toNumber(value, 5)), 1, 10);
}

function sourceTime(row: Record<string, unknown>, key: string, fallbackKey = 'created_at'): string {
  return normalizeString(row[key]) || normalizeString(row[fallbackKey]) || new Date().toISOString();
}

function bodyText(value: unknown, max = 220): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function loadMemoryRows(ctx: NpcGraphContext, limit: number): Promise<Record<string, unknown>[]> {
  const queryLimit = Math.min(Math.max(limit * 4, 200), 2500);
  const baseQuery = () => ctx.supabase
    .from('memories')
    .select(MEMORY_SELECT)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('updated_at', { ascending: false })
    .limit(queryLimit);

  if (ctx.organizationId) {
    const [orgRows, personalRows] = await Promise.all([
      baseQuery().eq('organization_id', ctx.organizationId),
      baseQuery().eq('user_id', ctx.userId).is('organization_id', null),
    ]);
    if (orgRows.error) throw new Error(`npc_memory_load_failed:${orgRows.error.message}`);
    if (personalRows.error) throw new Error(`npc_memory_load_failed:${personalRows.error.message}`);
    const rows = [...(orgRows.data || []), ...(personalRows.data || [])] as Record<string, unknown>[];
    return rows;
  }

  const { data, error } = await baseQuery().eq('user_id', ctx.userId);
  if (error) throw new Error(`npc_memory_load_failed:${error.message}`);
  return (data || []) as Record<string, unknown>[];
}

async function loadGossipRows(ctx: NpcGraphContext, limit: number): Promise<Record<string, unknown>[]> {
  const queryLimit = Math.min(Math.max(limit * 3, 200), 2500);
  let query = ctx.supabase
    .from('gossip_events')
    .select(GOSSIP_SELECT)
    .order('propagated_at', { ascending: false })
    .limit(queryLimit);

  query = ctx.organizationId
    ? query.eq('organization_id', ctx.organizationId)
    : query.eq('user_id', ctx.userId);

  const { data, error } = await query;
  if (error) throw new Error(`npc_gossip_load_failed:${error.message}`);
  return (data || []) as Record<string, unknown>[];
}

async function loadBeliefRows(ctx: NpcGraphContext, limit: number): Promise<Record<string, unknown>[]> {
  if (!ctx.organizationId) return [];
  const queryLimit = Math.min(Math.max(limit * 3, 200), 2500);
  const { data, error } = await ctx.supabase
    .from('belief_shards')
    .select(BELIEF_SELECT)
    .eq('organization_id', ctx.organizationId)
    .order('observed_at', { ascending: false })
    .limit(queryLimit);

  if (error) throw new Error(`npc_beliefs_load_failed:${error.message}`);
  return (data || []) as Record<string, unknown>[];
}

async function loadCanonRows(ctx: NpcGraphContext, npcId: string, limit: number): Promise<Record<string, unknown>[]> {
  if (!ctx.organizationId) return [];
  const { data, error } = await ctx.supabase
    .from('canon_violations')
    .select('id, lock_id, memory_id, npc_id, attempted_content, severity, created_at')
    .eq('studio_id', ctx.organizationId)
    .eq('npc_id', npcId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 20), 500));

  if (error) throw new Error(`npc_canon_load_failed:${error.message}`);
  return (data || []) as Record<string, unknown>[];
}

function timelineStats(events: NpcTimelineEvent[]): NpcTimelineData['stats'] {
  return {
    totalEvents: events.length,
    memoryEvents: events.filter((event) => event.type === 'memory').length,
    canonHits: events.filter((event) => event.type === 'canon-hit').length,
    gossipEvents: events.filter((event) => event.type === 'gossip').length,
    moderationEvents: events.filter((event) => event.type === 'moderation').length,
  };
}

export function buildTimelineTicks(events: NpcTimelineEvent[], count = 6): NpcTimelineTick[] {
  if (events.length === 0) {
    const now = new Date();
    return [{ at: now.toISOString(), label: 'Now' }];
  }

  const times = events
    .map((event) => Date.parse(event.occurredAt))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  const start = times[0] || Date.now();
  const end = times[times.length - 1] || start;
  const span = Math.max(end - start, 1);
  const tickCount = Math.min(Math.max(count, 2), 8);

  return Array.from({ length: tickCount }, (_, index) => {
    const at = new Date(start + (span * index) / (tickCount - 1));
    return {
      at: at.toISOString(),
      label: new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(at),
    };
  });
}

export async function loadNpcTimeline(
  ctx: NpcGraphContext,
  npcId: string,
  options: LoadOptions = {}
): Promise<NpcTimelineData> {
  const limit = Math.min(Math.max(options.limit || 500, 1), 1000);
  const [memoryRows, gossipRows, beliefRows, canonRows] = await Promise.all([
    loadMemoryRows(ctx, limit),
    loadGossipRows(ctx, limit),
    loadBeliefRows(ctx, limit),
    loadCanonRows(ctx, npcId, limit),
  ]);

  const events: NpcTimelineEvent[] = [];
  for (const row of memoryRows.filter((item) => matchesNpc(item, npcId))) {
    const moderationStatus = normalizeString(row.moderation_status);
    const occurredAt = sourceTime(row, 'updated_at', 'created_at');
    const memoryType = normalizeString(row.memory_type) || 'memory';
    events.push({
      id: `memory:${row.id}`,
      type: 'memory',
      title: `${memoryType} memory`,
      body: bodyText(row.content),
      occurredAt,
      weight: eventWeight(row.importance),
      sourceId: normalizeString(row.id),
      metadata: { namespace: row.namespace, tags: row.tags },
    });

    if (moderationStatus && moderationStatus !== 'clean') {
      events.push({
        id: `moderation:${row.id}`,
        type: 'moderation',
        title: `Moderation ${moderationStatus}`,
        body: bodyText(row.content),
        occurredAt,
        weight: 8,
        sourceId: normalizeString(row.id),
      });
    }
  }

  for (const row of gossipRows.filter((item) => item.from_entity_id === npcId || item.to_entity_id === npcId)) {
    events.push({
      id: `gossip:${row.id}`,
      type: 'gossip',
      title: `${row.from_entity_id} -> ${row.to_entity_id}`,
      body: bodyText(row.fact_transmitted || row.fact_original),
      occurredAt: sourceTime(row, 'propagated_at'),
      weight: Math.max(2, Math.round(toNumber(row.confidence, 0.7) * 10)),
      sourceId: normalizeString(row.id),
      metadata: { channel: row.channel, model: row.distortion_model },
    });
  }

  for (const row of beliefRows.filter((item) => item.holder_entity_id === npcId)) {
    events.push({
      id: `belief:${row.id}`,
      type: 'memory',
      title: `${row.source_type || 'direct'} belief`,
      body: `Believes fact ${String(row.about_fact_id).slice(0, 8)}`,
      occurredAt: sourceTime(row, 'observed_at'),
      weight: Math.max(2, Math.round(toNumber(row.confidence, 1) * 10)),
      sourceId: normalizeString(row.id),
      metadata: { aboutFactId: row.about_fact_id },
    });
  }

  for (const row of canonRows) {
    events.push({
      id: `canon:${row.id}`,
      type: 'canon-hit',
      title: `${row.severity || 'hard'} canon hit`,
      body: bodyText(row.attempted_content),
      occurredAt: sourceTime(row, 'created_at'),
      weight: row.severity === 'soft' ? 6 : 9,
      sourceId: normalizeString(row.id),
    });
  }

  const sorted = events
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .slice(-limit);
  const ticks = buildTimelineTicks(sorted);
  const range = {
    start: ticks[0]?.at || new Date().toISOString(),
    end: ticks[ticks.length - 1]?.at || new Date().toISOString(),
  };

  return {
    npcId,
    generatedAt: new Date().toISOString(),
    range,
    ticks,
    events: sorted,
    stats: timelineStats(sorted),
  };
}

function edgeKindFromText(text: string, fallback: NpcGraphEdgeType): NpcGraphEdgeType {
  const lower = text.toLowerCase();
  if (/\b(trust|trusted|ally|allied|friend|loyal|protect)\b/.test(lower)) return 'trust';
  if (/\b(hate|hates|enemy|rival|betray|betrayed|feud|hostile)\b/.test(lower)) return 'rivalry';
  return fallback;
}

function relatedEntityFromMemory(row: Record<string, unknown>): string | null {
  const meta = metaObject(row);
  return (
    normalizeString(meta.related_entity_id) ||
    normalizeString(meta.relatedEntityId) ||
    normalizeString(meta.target_entity_id) ||
    normalizeString(meta.targetEntityId) ||
    normalizeString(meta.target_npc_id) ||
    normalizeString(meta.targetNpcId)
  );
}

function addNode(nodes: Map<string, NpcGraphNode>, id: string, weight = 1, type = entityType(id)) {
  const current = nodes.get(id);
  if (current) {
    current.weight = Math.max(current.weight, weight);
    return current;
  }
  const node: NpcGraphNode = {
    id,
    label: entityLabel(id),
    type,
    weight,
    latestAt: null,
  };
  nodes.set(id, node);
  return node;
}

function addEdge(edges: Map<string, NpcGraphEdge>, input: Omit<NpcGraphEdge, 'id' | 'events'> & { id?: string }) {
  const key = input.id || `${input.source}->${input.target}:${input.type}`;
  const current = edges.get(key);
  if (current) {
    current.events += 1;
    current.weight = clamp(current.weight + input.weight, 1, 12);
    current.confidence = Math.max(current.confidence, input.confidence);
    current.latestAt = [current.latestAt, input.latestAt].filter(Boolean).sort().at(-1) || current.latestAt;
    return;
  }
  edges.set(key, {
    id: key,
    events: 1,
    ...input,
  });
}

function graphStats(nodes: NpcGraphNode[], edges: NpcGraphEdge[]): NpcRelationshipGraphData['stats'] {
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    trustEdges: edges.filter((edge) => edge.type === 'trust').length,
    rivalryEdges: edges.filter((edge) => edge.type === 'rivalry').length,
    knowledgeEdges: edges.filter((edge) => edge.type === 'knowledge').length,
    gossipEdges: edges.filter((edge) => edge.type === 'gossip').length,
  };
}

export async function loadNpcRelationshipGraph(
  ctx: NpcGraphContext,
  npcId: string,
  options: LoadOptions = {}
): Promise<NpcRelationshipGraphData> {
  const limit = Math.min(Math.max(options.limit || 500, 1), 1500);
  const [memoryRows, gossipRows, beliefRows] = await Promise.all([
    loadMemoryRows(ctx, limit),
    loadGossipRows(ctx, limit),
    loadBeliefRows(ctx, limit),
  ]);
  const nodes = new Map<string, NpcGraphNode>();
  const edges = new Map<string, NpcGraphEdge>();
  addNode(nodes, npcId, 10);

  for (const row of gossipRows.filter((item) => item.from_entity_id === npcId || item.to_entity_id === npcId)) {
    const source = String(row.from_entity_id);
    const target = String(row.to_entity_id);
    const confidence = clamp(toNumber(row.confidence, 0.7), 0, 1);
    addNode(nodes, source, Math.round(confidence * 10));
    addNode(nodes, target, Math.round(confidence * 10));
    const text = `${row.fact_original || ''} ${row.fact_transmitted || ''}`;
    const fallback = row.distortion_model && row.distortion_model !== 'none' ? 'gossip' : 'knowledge';
    const type = edgeKindFromText(text, fallback);
    addEdge(edges, {
      source,
      target,
      type,
      label: type === 'gossip' ? String(row.channel || 'gossip') : type,
      weight: Math.max(1, Math.round(confidence * 6)),
      confidence,
      latestAt: sourceTime(row, 'propagated_at'),
    });
  }

  for (const row of beliefRows.filter((item) => item.holder_entity_id === npcId)) {
    const source = String(row.holder_entity_id);
    const factNodeId = `fact:${String(row.about_fact_id).slice(0, 8)}`;
    const confidence = clamp(toNumber(row.confidence, 1), 0, 1);
    addNode(nodes, source, 8);
    addNode(nodes, factNodeId, Math.round(confidence * 8), 'fact');
    addEdge(edges, {
      source,
      target: factNodeId,
      type: 'knowledge',
      label: String(row.source_type || 'belief'),
      weight: Math.max(1, Math.round(confidence * 5)),
      confidence,
      latestAt: sourceTime(row, 'observed_at'),
    });
  }

  for (const row of memoryRows.filter((item) => item.memory_type === 'relationship')) {
    const source = deriveNpcId(row);
    const target = relatedEntityFromMemory(row);
    if (!source || !target || (source !== npcId && target !== npcId)) continue;
    const text = bodyText(row.content, 500);
    const type = edgeKindFromText(text, 'knowledge');
    addNode(nodes, source, eventWeight(row.importance));
    addNode(nodes, target, eventWeight(row.importance));
    addEdge(edges, {
      source,
      target,
      type,
      label: type,
      weight: Math.max(1, Math.round(eventWeight(row.importance) / 2)),
      confidence: 1,
      latestAt: sourceTime(row, 'updated_at', 'created_at'),
    });
  }

  const nodeList = [...nodes.values()].sort((a, b) => b.weight - a.weight).slice(0, 150);
  const nodeIds = new Set(nodeList.map((node) => node.id));
  const edgeList = [...edges.values()]
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 300);

  return {
    npcId,
    generatedAt: new Date().toISOString(),
    nodes: nodeList,
    edges: edgeList,
    stats: graphStats(nodeList, edgeList),
  };
}

export function createSampleTimelineData(npcId: string, count = 500): NpcTimelineData {
  const now = Date.now();
  const types: NpcTimelineEventType[] = ['memory', 'gossip', 'canon-hit', 'moderation'];
  const events = Array.from({ length: count }, (_, index): NpcTimelineEvent => {
    const type = types[index % types.length];
    return {
      id: `sample:${index}`,
      type,
      title: `${type} event ${index + 1}`,
      body: `Synthetic event ${index + 1} for ${npcId}`,
      occurredAt: new Date(now - (count - index) * 36e5).toISOString(),
      weight: (index % 10) + 1,
    };
  });
  const ticks = buildTimelineTicks(events);
  return {
    npcId,
    generatedAt: new Date(now).toISOString(),
    range: {
      start: ticks[0]?.at || new Date(now).toISOString(),
      end: ticks[ticks.length - 1]?.at || new Date(now).toISOString(),
    },
    ticks,
    events,
    stats: timelineStats(events),
  };
}

export function createSampleRelationshipGraph(npcId: string, npcCount = 100): NpcRelationshipGraphData {
  const nodes = [addSampleNode(npcId, 12)];
  const edges: NpcGraphEdge[] = [];
  const types: NpcGraphEdgeType[] = ['trust', 'rivalry', 'knowledge', 'gossip'];
  for (let index = 0; index < npcCount; index += 1) {
    const id = `npc_${String(index + 1).padStart(3, '0')}`;
    const type = types[index % types.length];
    nodes.push(addSampleNode(id, (index % 10) + 1));
    edges.push({
      id: `sample:${index}`,
      source: index % 5 === 0 ? id : npcId,
      target: index % 5 === 0 ? npcId : id,
      type,
      label: type,
      weight: (index % 6) + 1,
      confidence: ((index % 7) + 3) / 10,
      events: (index % 4) + 1,
      latestAt: new Date(Date.now() - index * 6e5).toISOString(),
    });
  }
  return {
    npcId,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: graphStats(nodes, edges),
  };
}

function addSampleNode(id: string, weight: number): NpcGraphNode {
  return {
    id,
    label: entityLabel(id),
    type: entityType(id),
    weight,
    latestAt: new Date().toISOString(),
  };
}
