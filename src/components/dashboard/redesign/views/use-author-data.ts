'use client';

import { useMemo } from 'react';
import {
  useAuthorCharacters,
  useAuthorConflicts,
  useAuthorGraph,
  useAuthorProjects,
  useAuthorSyncStatus,
} from '@/hooks/useAuthorMemoryV3';
import type {
  AuthorUiHealth,
  AuthorWorkspaceData,
  CharacterDetail,
  CharacterSummary,
  ConflictItem,
  GraphEdge,
  GraphNode,
  InboxRowDetail,
} from './types';

interface DataState<T> {
  data: T;
  isLoading: boolean;
  error: Error | null;
  isFallback: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const ROLE_PALETTE: Record<string, string> = {
  Lead: '#c96442',
  Supporting: '#7a5c3a',
  Minor: '#bfb39a',
};

const GRAPH_VIEWBOX_WIDTH = 580;
const GRAPH_VIEWBOX_HEIGHT = 380;
const GRAPH_CENTER_X = GRAPH_VIEWBOX_WIDTH / 2;
const GRAPH_CENTER_Y = GRAPH_VIEWBOX_HEIGHT / 2;

function colorForRole(role: string, fallback = '#7a5c3a'): string {
  return ROLE_PALETTE[role] ?? fallback;
}

export type UseAuthorWorkspaceResult = DataState<AuthorWorkspaceData>;

export function useAuthorWorkspace(): UseAuthorWorkspaceResult {
  const projects = useAuthorProjects();
  const project = projects.data?.projects?.[0];

  return useMemo(() => {
    if (project && typeof project === 'object') {
      const record = project as Record<string, unknown>;
      const name = toString(record.name);
      const entityCount = toNumber(record.entity_count);
      const candidateCount = toNumber(record.candidate_count);
      return {
        data: {
          workspaceName: name,
          planLabel: 'Studio',
          episodeCount: entityCount + candidateCount,
          hasMore: false,
        },
        isLoading: projects.isLoading,
        error: (projects.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }
    return {
      data: {
        workspaceName: 'dashboard.workspace.placeholderName',
        planLabel: 'Free',
        episodeCount: 0,
        hasMore: false,
      },
      isLoading: projects.isLoading,
      error: (projects.error as Error | undefined) ?? null,
      isFallback: false,
    };
  }, [project, projects.isLoading, projects.error]);
}

export type UseAuthorInboxResult = DataState<InboxRowDetail[]>;

export function useAuthorInbox(projectId: string | undefined): UseAuthorInboxResult {
  const conflicts = useAuthorConflicts(projectId, { status: 'open' });

  return useMemo(() => {
    const rawConflicts = (conflicts.data?.conflicts ?? []) as unknown[];
    if (!projectId || rawConflicts.length === 0) {
      return {
        data: [],
        isLoading: conflicts.isLoading,
        error: (conflicts.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }
    const rows: InboxRowDetail[] = rawConflicts
      .filter(isRecord)
      .slice(0, 12)
      .map((conflict, index) => {
        const id = toString(conflict.id, `conflict-${index}`);
        const titleSource = isRecord(conflict.payload)
          ? toString(conflict.payload.summary)
          : '';
        const title =
          titleSource || toString(conflict.kind) || 'Memory v3 surfaced a conflict';
        return {
          id,
          kind: 'Conflict' as const,
          title,
          episode: toString(conflict.scope, 'Ch. ?'),
          author: 'Memory v3',
          time: toString(conflict.detected_at, 'recent'),
          priority: severityToPriority(toString(conflict.severity, 'medium')),
          unread: !toString(conflict.resolved_at),
          evidence: [],
        } satisfies InboxRowDetail;
      });
    return {
      data: rows,
      isLoading: conflicts.isLoading,
      error: (conflicts.error as Error | undefined) ?? null,
      isFallback: false,
    };
  }, [projectId, conflicts.data, conflicts.isLoading, conflicts.error]);
}

function severityToPriority(severity: string): InboxRowDetail['priority'] {
  if (severity === 'high' || severity === 'critical') return 'P1';
  if (severity === 'medium' || severity === 'warning') return 'P2';
  return 'P3';
}

export type UseAuthorCharactersResult = DataState<CharacterSummary[]> & {
  detail: (id: string) => CharacterDetail | undefined;
};

export function useAuthorCharactersList(projectId: string | undefined): UseAuthorCharactersResult {
  const characters = useAuthorCharacters(projectId);

  return useMemo(() => {
    const items = (characters.data?.characters ?? []) as unknown[];
    if (!projectId || items.length === 0) {
      return {
        data: [],
        isLoading: characters.isLoading,
        error: (characters.error as Error | undefined) ?? null,
        isFallback: false,
        detail: () => undefined,
      };
    }
    const seenCharacterIds = new Set<string>();
    const characterRecords = items
      .filter(isRecord)
      .map((raw, sourceIndex) => ({
        raw,
        id: toString(raw.id, `character-${sourceIndex}`),
      }))
      .filter(({ id }) => {
        if (seenCharacterIds.has(id)) return false;
        seenCharacterIds.add(id);
        return true;
      });
    const summaries: CharacterSummary[] = characterRecords.map(({ raw, id }, index) => {
      const name = toString(raw.name, 'Unnamed');
      const aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
      return {
        id,
        name,
        aka: aliases.length > 0 ? toString(aliases[0]) : toString(raw.summary, ''),
        role: index < 2 ? 'Lead' : index < 5 ? 'Supporting' : 'Minor',
        episodes: 0,
        relations: 0,
        conflicts: 0,
        color: colorForRole(index < 2 ? 'Lead' : index < 5 ? 'Supporting' : 'Minor'),
      } satisfies CharacterSummary;
    });
    return {
      data: summaries,
      isLoading: characters.isLoading,
      error: (characters.error as Error | undefined) ?? null,
      isFallback: false,
      detail: (id: string) => synthesizeDetail(summaries.find((c) => c.id === id)),
    };
  }, [projectId, characters.data, characters.isLoading, characters.error]);
}

function synthesizeDetail(summary?: CharacterSummary): CharacterDetail | undefined {
  if (!summary) return undefined;
  return {
    ...summary,
    canonFacts: [],
    relationships: [],
  };
}

export type UseAuthorGraphResult = DataState<{ nodes: GraphNode[]; edges: GraphEdge[] }>;

export function useAuthorGraphData(projectId: string | undefined): UseAuthorGraphResult {
  const graph = useAuthorGraph(projectId);

  return useMemo(() => {
    const rawNodes = (graph.data?.nodes ?? []) as unknown[];
    const rawEdges = (graph.data?.edges ?? []) as unknown[];

    if (!projectId || rawNodes.length === 0) {
      return {
        data: { nodes: [], edges: [] },
        isLoading: graph.isLoading,
        error: (graph.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }

    const seenNodeIds = new Set<string>();
    const nodeRecords = rawNodes
      .filter(isRecord)
      .map((record, sourceIndex) => ({
        record,
        sourceIndex,
        sortId: toString(record.id, `node-${sourceIndex}`),
      }))
      .sort(
        (a, b) =>
          a.sortId.localeCompare(b.sortId) ||
          a.sourceIndex - b.sourceIndex
      )
      .filter(({ sortId }) => {
        if (seenNodeIds.has(sortId)) return false;
        seenNodeIds.add(sortId);
        return true;
      });
    if (nodeRecords.length === 0) {
      return {
        data: { nodes: [], edges: [] },
        isLoading: graph.isLoading,
        error: (graph.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }

    const drafts = nodeRecords.map(({ record, sortId }, index) => {
      const role = graphRoleForIndex(index);
      return {
        raw: record,
        sortId,
        role,
        r: radiusForRole(role),
      };
    });
    const layout = graphLayout(drafts.map((draft) => draft.r));
    const nodes: GraphNode[] = drafts.map((draft, index) => {
      const raw = draft.raw;
      const id = toString(raw.id, draft.sortId);
      const label = toString(raw.label, id);
      const point = layout[index] ?? { x: GRAPH_CENTER_X, y: GRAPH_CENTER_Y };
      return {
        id,
        label,
        role: draft.role,
        x: point.x,
        y: point.y,
        r: draft.r,
      };
    });

    const edges: GraphEdge[] = rawEdges.filter(isRecord).map((raw) => ({
      a: toString(raw.from),
      b: toString(raw.to),
      kind: toString(raw.type, 'Tie'),
      strength: toNumber(raw.intensity, 0.5),
      conflict: false,
    }));

    return {
      data: { nodes, edges },
      isLoading: graph.isLoading,
      error: (graph.error as Error | undefined) ?? null,
      isFallback: false,
    };
  }, [projectId, graph.data, graph.isLoading, graph.error]);
}

function graphRoleForIndex(index: number): GraphNode['role'] {
  if (index < 2) return 'Lead';
  if (index < 5) return 'Supporting';
  return 'Minor';
}

function radiusForRole(role: GraphNode['role']): number {
  if (role === 'Lead') return 32;
  if (role === 'Supporting') return 22;
  return 16;
}

function graphLayout(radii: number[]) {
  const count = radii.length;
  if (count === 0) return [];
  if (count === 1) {
    return [clampGraphPoint({ x: GRAPH_CENTER_X, y: GRAPH_CENTER_Y }, radii[0])];
  }
  if (count === 2) {
    const horizontalGap = Math.max(86, radii[0] + radii[1] + 28);
    return [
      clampGraphPoint({ x: GRAPH_CENTER_X - horizontalGap, y: GRAPH_CENTER_Y }, radii[0]),
      clampGraphPoint({ x: GRAPH_CENTER_X + horizontalGap, y: GRAPH_CENTER_Y }, radii[1]),
    ];
  }
  if (count > 18) {
    return twoRingLayout(radii);
  }

  const radius = Math.max(110, Math.min(160, 18 + (count * 50) / Math.PI));
  const slots = distributedSlots(count);
  return radii.map((r, index) =>
    clampGraphPoint(pointOnRing(slots[index], count, radius), r)
  );
}

function twoRingLayout(radii: number[]) {
  const innerCount = 7;
  const outerCount = radii.length - innerCount;
  const points = new Array<{ x: number; y: number }>(radii.length);
  const innerSlots = distributedSlots(innerCount);
  const outerSlots = distributedSlots(outerCount);

  for (let index = 0; index < innerCount; index += 1) {
    points[index] = clampGraphPoint(
      pointOnRing(innerSlots[index], innerCount, 95),
      radii[index]
    );
  }

  for (let index = 0; index < outerCount; index += 1) {
    const nodeIndex = innerCount + index;
    points[nodeIndex] = clampGraphPoint(
      pointOnRing(outerSlots[index], outerCount, 160),
      radii[nodeIndex]
    );
  }

  return points;
}

function distributedSlots(count: number): number[] {
  const slots: number[] = [];
  const used = new Set<number>();
  const oppositeOffset = Math.floor(count / 2);

  for (let offset = 0; slots.length < count; offset += 1) {
    for (const slot of [offset % count, (offset + oppositeOffset) % count]) {
      if (!used.has(slot)) {
        used.add(slot);
        slots.push(slot);
      }
    }
  }

  return slots;
}

function pointOnRing(slot: number, count: number, radius: number) {
  const angle = (slot / count) * Math.PI * 2 - Math.PI / 2;
  return {
    x: GRAPH_CENTER_X + Math.cos(angle) * radius,
    y: GRAPH_CENTER_Y + Math.sin(angle) * radius,
  };
}

function clampGraphPoint(point: { x: number; y: number }, r: number) {
  return {
    x: clamp(point.x, r + 4, GRAPH_VIEWBOX_WIDTH - r - 4),
    y: clamp(point.y, r + 14, GRAPH_VIEWBOX_HEIGHT - r - 26),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type UseAuthorConflictsResult = DataState<ConflictItem[]>;

export function useAuthorConflictsList(projectId: string | undefined): UseAuthorConflictsResult {
  const conflicts = useAuthorConflicts(projectId, { status: 'open' });

  return useMemo(() => {
    const raw = (conflicts.data?.conflicts ?? []) as unknown[];

    if (!projectId || raw.length === 0) {
      return {
        data: [],
        isLoading: conflicts.isLoading,
        error: (conflicts.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }

    const items: ConflictItem[] = raw.filter(isRecord).map((conflict, index) => {
      const id = toString(conflict.id, `conflict-${index}`);
      const payload = isRecord(conflict.payload) ? conflict.payload : {};
      return {
        id,
        severity: severityToPriority(toString(conflict.severity, 'medium')),
        kind: toString(conflict.kind, 'Conflict'),
        title: toString(payload.summary, 'Memory v3 surfaced a conflict'),
        episode: toString(conflict.scope, 'Ch. ?'),
        why: toString(payload.detail) || undefined,
        refs: Array.isArray(payload.refs)
          ? (payload.refs as unknown[]).map((r) => toString(r))
          : [],
      } satisfies ConflictItem;
    });

    return {
      data: items,
      isLoading: conflicts.isLoading,
      error: (conflicts.error as Error | undefined) ?? null,
      isFallback: false,
    };
  }, [projectId, conflicts.data, conflicts.isLoading, conflicts.error]);
}

export type UseAuthorUiHealthResult = DataState<AuthorUiHealth>;

export function useAuthorUiHealth(projectId: string | undefined): UseAuthorUiHealthResult {
  const sync = useAuthorSyncStatus(projectId);

  return useMemo(() => {
    if (!projectId) {
      return {
        data: {
          status: 'synced',
          lastSyncedAt: new Date(0),
          factsCount: 0,
        },
        isLoading: sync.isLoading,
        error: (sync.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }

    const status = sync.data as Record<string, unknown> | undefined;
    if (status) {
      const ts = toString(status.last_synced_at);
      return {
        data: {
          status: 'synced',
          lastSyncedAt: ts ? new Date(ts) : new Date(),
          factsCount: toNumber(status.fact_count, 0),
        },
        isLoading: sync.isLoading,
        error: (sync.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }
    return {
      data: {
        status: 'synced',
        lastSyncedAt: new Date(),
        factsCount: 0,
      },
      isLoading: sync.isLoading,
      error: (sync.error as Error | undefined) ?? null,
      isFallback: false,
    };
  }, [projectId, sync.data, sync.isLoading, sync.error]);
}

export function useAuthorProjectId(): string | undefined {
  const projects = useAuthorProjects();
  const project = projects.data?.projects?.[0] as Record<string, unknown> | undefined;
  return project ? toString(project.id) || undefined : undefined;
}
