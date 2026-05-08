import type { NextRequest } from 'next/server';
import { getAuthorUiService, type AuthorUiService } from '@/lib/author/ui/service';
import { getUsage } from '@/lib/api-keys';
import type { ApiKeyPeriod, ValidatedApiKey } from '@/lib/api-keys';
import { escapePostgrestOrFilter } from '@/lib/postgrest-filters';

type JsonRecord = Record<string, unknown>;

const PUBLIC_DEFAULT_PROJECT_ID = 'saebyeok-main';
const INTERNAL_DEFAULT_PROJECT_ID = 'knot';
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export type PublicProject = {
  id: string;
  name: string;
  description: string;
  last_updated: string;
  entity_count: number;
  conflict_count: number;
};

export type RecallEntity = {
  id: string;
  type: 'character' | 'location' | 'object' | 'event' | 'rule' | 'promise';
  canonicalName: string;
  lastMentions: Array<{
    chapter: string;
    line: number;
    snippet: string;
    timestamp: string;
  }>;
  currentState: Record<string, unknown> | null;
  pendingConflictIds: string[];
  confidence: number;
  approvalStatus: 'approved' | 'suggested';
};

export type ConflictHit = {
  id: string;
  severity: 'P1' | 'P2' | 'P3';
  kind: string;
  episode: string | null;
  title: string;
  rationale: string;
  refs: string[];
};

export type TimelineEntry = {
  id: string;
  chapter: string;
  ordinal: number;
  beats: Array<{ id: string; summary: string; entities: string[] }>;
};

export type GraphSubset = {
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ from: string; to: string; kind: string; weight: number }>;
};

export function authorApiService(userId: string): AuthorUiService {
  return getAuthorUiService(userId);
}

export async function listProjects(service: AuthorUiService): Promise<{ data: PublicProject[] }> {
  const projects = await Promise.resolve(service.listProjects());
  return {
    data: projects.projects.map(toPublicProject),
  };
}

export async function createProject(
  service: AuthorUiService,
  input: JsonRecord
): Promise<{ id: string }> {
  const result = await Promise.resolve(service.createProject({
    name: input.name,
    description: input.description,
    initial_scope: input.initial_scope,
  }));
  return { id: toPublicProjectId(result.project_id) };
}

export async function recallEntities(
  service: AuthorUiService,
  publicProjectId: string,
  query: string
): Promise<{ entities: RecallEntity[] }> {
  const projectId = toInternalProjectId(publicProjectId);
  const [characters, search] = await Promise.all([
    service.listCharacters(projectId),
    query ? service.search(projectId, query) : Promise.resolve({ results: [] }),
  ]);
  const matchingIds = new Set(search.results.map((item) => String(item.id)));
  const entities = characters.characters
    .filter((item) => !query || matchingIds.has(item.id) || includesText(item.name, query) || includesText(item.summary, query))
    .slice(0, 20)
    .map((item, index) => toRecallEntity(item as unknown as JsonRecord, index));

  return { entities };
}

export async function listMentions(
  service: AuthorUiService,
  publicProjectId: string,
  entityId: string,
  request: NextRequest
) {
  const timeline = service.getTimeline(toInternalProjectId(publicProjectId), new URLSearchParams());
  const internalTail = entityId.split('.').pop() ?? entityId;
  const mentions = timeline.events
    .filter((event) =>
      event.who.some((who: string) => publicEntityId(who).endsWith(internalTail) || publicEntityId(who) === entityId)
    )
    .map((event, index) => ({
      id: publicEntityId(`${entityId}.mention.${event.id}`),
      entity_id: entityId,
      chapter: sanitizePublicText(event.day),
      line: index + 1,
      snippet: sanitizePublicText(event.what),
      timestamp: event.date || event.day,
    }));

  return paginate(mentions, request);
}

export async function checkConflicts(
  service: AuthorUiService,
  publicProjectId: string,
  input: JsonRecord
): Promise<{ conflicts: ConflictHit[] }> {
  const text = typeof input.text === 'string' ? input.text : '';
  const params = new URLSearchParams({ status: 'open' });
  const conflicts = await service.listConflicts(toInternalProjectId(publicProjectId), params);
  return {
    conflicts: conflicts.conflicts.slice(0, 20).map((item, index) => ({
      id: publicEntityId(String(item.id)),
      severity: severityFor(String(item.severity)),
      kind: 'canon_conflict',
      episode: null,
      title: sanitizePublicText(item.impact_summary ?? `Conflict ${index + 1}`),
      rationale: sanitizePublicText(item.llm_analysis ?? text.slice(0, 160)),
      refs: [sanitizePublicText(item.existing_fact?.source?.document_id ?? 'author-canon')],
    })),
  };
}

export async function approveCanon(
  service: AuthorUiService,
  publicProjectId: string,
  entityId: string,
  input: JsonRecord
): Promise<{ entityId: string; status: 'approved' | 'suggested'; candidateId: string; decisionId: string }> {
  const fact = typeof input.fact === 'string' && input.fact.trim()
    ? input.fact.trim()
    : typeof input.content === 'string'
      ? input.content.trim()
      : '';
  const candidate = await service.createCandidate(toInternalProjectId(publicProjectId), {
    content: fact || `Approved fact for ${entityId}`,
    type: 'fact',
    suggested_status: 'canon',
    target_entity_id: entityId,
    tags: ['api-v1'],
  });
  const decision = await service.decideCandidate(toInternalProjectId(publicProjectId), candidate.candidate_id, {
    action: 'approve',
  });
  return {
    entityId,
    status: decision.new_status === 'canon' ? 'approved' : 'suggested',
    candidateId: publicEntityId(candidate.candidate_id),
    decisionId: decision.decision_id,
  };
}

export async function searchEntities(
  service: AuthorUiService,
  publicProjectId: string,
  query: string,
  request: NextRequest
) {
  const safeQuery = escapePostgrestOrFilter(query);
  const result = safeQuery
    ? await service.search(toInternalProjectId(publicProjectId), safeQuery)
    : { results: [] };
  const entities = result.results.map((item, index) => toRecallEntity(item, index));
  const page = paginate(entities, request);
  return {
    ...page,
    entities: page.data,
  };
}

export function timelineEntries(
  service: AuthorUiService,
  publicProjectId: string,
  request: NextRequest
) {
  const { searchParams } = new URL(request.url);
  const internalParams = new URLSearchParams(searchParams);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from && to && !internalParams.get('day_range')) {
    internalParams.set('day_range', `${from},${to}`);
  }

  const timeline = service.getTimeline(toInternalProjectId(publicProjectId), internalParams);
  const entries = timeline.events.map((event, index) => ({
    id: publicEntityId(String(event.id)),
    chapter: sanitizePublicText(event.day),
    ordinal: index + 1,
    beats: [{
      id: publicEntityId(String(event.id)),
      summary: sanitizePublicText(event.what),
      entities: event.who.map(publicEntityId),
    }],
  }));
  const page = paginate(entries, request);
  return {
    ...page,
    timeline: page.data,
  };
}

export function graphSubset(
  service: AuthorUiService,
  publicProjectId: string,
  request: NextRequest
): GraphSubset {
  const { searchParams } = new URL(request.url);
  const graph = service.getGraph(toInternalProjectId(publicProjectId), searchParams);
  return {
    nodes: graph.nodes.map((node) => ({
      id: publicEntityId(node.id),
      label: sanitizePublicText(node.label),
      type: node.type === 'person' ? 'character' : sanitizePublicText(node.type),
    })),
    edges: graph.edges.map((edge) => ({
      from: publicEntityId(edge.from),
      to: publicEntityId(edge.to),
      kind: sanitizePublicText(edge.type),
      weight: edge.intensity,
    })),
  };
}

export async function usageSummary(apiKey: ValidatedApiKey) {
  const period = apiKey.monthlyQuotaPeriod as ApiKeyPeriod;
  const used = await getUsage(apiKey.apiKeyId, period);
  return {
    api_key_id: apiKey.apiKeyId,
    period,
    used,
    quota: apiKey.monthlyQuota,
    remaining: Math.max(0, apiKey.monthlyQuota - used),
    rate_limit_per_minute: apiKey.rateLimitPerMinute,
  };
}

function toPublicProject(project: {
  id: string;
  name?: string;
  description?: string;
  last_updated?: string;
  entity_count?: number;
  conflict_count?: number;
}): PublicProject {
  return {
    id: toPublicProjectId(String(project.id)),
    name: sanitizePublicText(String(project.name ?? 'Saebyeok Project')),
    description: sanitizePublicText(String(project.description ?? '')),
    last_updated: String(project.last_updated ?? ''),
    entity_count: Number(project.entity_count ?? 0),
    conflict_count: Number(project.conflict_count ?? 0),
  };
}

function toRecallEntity(item: JsonRecord, index: number): RecallEntity {
  const id = publicEntityId(String(item.id ?? `entity.${index + 1}`));
  const label = String(item.name ?? item.label ?? item.id ?? `Entity ${index + 1}`);
  const summary = String(item.summary ?? item.snippet ?? '');
  return {
    id,
    type: 'character',
    canonicalName: sanitizePublicText(label),
    lastMentions: summary
      ? [{
          chapter: 'current',
          line: index + 1,
          snippet: sanitizePublicText(summary),
          timestamp: new Date(0).toISOString(),
        }]
      : [],
    currentState: summary ? { summary: sanitizePublicText(summary) } : null,
    pendingConflictIds: [],
    confidence: 0.8,
    approvalStatus: 'approved',
  };
}

function paginate<T extends { id: string }>(
  items: T[],
  request: NextRequest
): { data: T[]; has_more: boolean; next_starting_after?: string } {
  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get('limit'), DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const startingAfter = searchParams.get('starting_after');
  const startIndex = startingAfter
    ? Math.max(0, items.findIndex((item) => item.id === startingAfter) + 1)
    : 0;
  const data = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  return {
    data,
    has_more: hasMore,
    ...(hasMore && data.length > 0 ? { next_starting_after: data[data.length - 1].id } : {}),
  };
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function includesText(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function toInternalProjectId(projectId: string): string {
  return projectId === PUBLIC_DEFAULT_PROJECT_ID ? INTERNAL_DEFAULT_PROJECT_ID : projectId;
}

function toPublicProjectId(projectId: string): string {
  return projectId === INTERNAL_DEFAULT_PROJECT_ID ? PUBLIC_DEFAULT_PROJECT_ID : sanitizeId(projectId);
}

function publicEntityId(value: string): string {
  return sanitizeId(value)
    .replaceAll('char-sori', 'saebyeok-entity-primary')
    .replaceAll('knot', 'saebyeok')
    .replaceAll('short1', 'series-main');
}

function sanitizeId(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replaceAll('.', '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'entity';
}

function sanitizePublicText(value: string): string {
  return value
    .replaceAll('KNOT', 'Saebyeok')
    .replaceAll('knot', 'saebyeok')
    .replaceAll('short1', 'series-main')
    .replaceAll('char.sori', 'saebyeok.entity.primary')
    .replaceAll('청학여', 'Saebyeok Academy');
}

function severityFor(value: string): 'P1' | 'P2' | 'P3' {
  if (value === 'critical' || value === 'high' || value === 'P1') {
    return 'P1';
  }
  if (value === 'medium' || value === 'P2') {
    return 'P2';
  }
  return 'P3';
}
