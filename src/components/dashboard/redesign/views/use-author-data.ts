'use client';

import { useMemo } from 'react';
import {
  useAuthorCharacters,
  useAuthorConflicts,
  useAuthorGraph,
  useAuthorProjects,
  useAuthorSyncStatus,
} from '@/hooks/useAuthorMemoryV3';
import { MOCK_AUTHOR_DATA } from './mock-data';
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

type AuthorProjectsResult = ReturnType<typeof useAuthorProjects>;

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

function colorForRole(role: string, fallback = '#7a5c3a'): string {
  return ROLE_PALETTE[role] ?? fallback;
}

export type UseAuthorWorkspaceResult = DataState<AuthorWorkspaceData>;

export function useAuthorWorkspace(projects: AuthorProjectsResult): UseAuthorWorkspaceResult {
  const project = projects.data?.projects?.[0];

  return useMemo(() => {
    if (project && typeof project === 'object') {
      const record = project as Record<string, unknown>;
      const name = toString(record.name) || MOCK_AUTHOR_DATA.workspace.name;
      const entityCount = toNumber(record.entity_count);
      const candidateCount = toNumber(record.candidate_count);
      return {
        data: {
          workspaceName: name,
          planLabel: 'Studio',
          episodeCount: entityCount + candidateCount || MOCK_AUTHOR_DATA.workspace.episodes,
          hasMore: false,
        },
        isLoading: projects.isLoading,
        error: (projects.error as Error | undefined) ?? null,
        isFallback: false,
      };
    }
    return {
      data: {
        workspaceName: MOCK_AUTHOR_DATA.workspace.name,
        planLabel: 'Studio',
        episodeCount: MOCK_AUTHOR_DATA.workspace.episodes,
        hasMore: false,
      },
      isLoading: projects.isLoading,
      error: (projects.error as Error | undefined) ?? null,
      isFallback: !projects.isLoading,
    };
  }, [project, projects.isLoading, projects.error]);
}

export type UseAuthorInboxResult = DataState<InboxRowDetail[]>;

export function useAuthorInbox(
  projectId: string | undefined,
  conflicts: ReturnType<typeof useAuthorConflicts>
): UseAuthorInboxResult {

  return useMemo(() => {
    const rawConflicts = (conflicts.data?.conflicts ?? []) as unknown[];
    if (!projectId || rawConflicts.length === 0) {
      return {
        data: MOCK_AUTHOR_DATA.inbox,
        isLoading: conflicts.isLoading,
        error: (conflicts.error as Error | undefined) ?? null,
        isFallback: true,
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
      data: rows.length > 0 ? rows : MOCK_AUTHOR_DATA.inbox,
      isLoading: conflicts.isLoading,
      error: (conflicts.error as Error | undefined) ?? null,
      isFallback: rows.length === 0,
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

export function useAuthorCharactersList(
  projectId: string | undefined,
  options?: { enabled?: boolean }
): UseAuthorCharactersResult {
  const characters = useAuthorCharacters(projectId, options);

  return useMemo(() => {
    const items = (characters.data?.characters ?? []) as unknown[];
    if (!projectId || items.length === 0) {
      return {
        data: MOCK_AUTHOR_DATA.characters,
        isLoading: characters.isLoading,
        error: (characters.error as Error | undefined) ?? null,
        isFallback: true,
        detail: (id: string) =>
          MOCK_AUTHOR_DATA.characterDetails.find((c) => c.id === id),
      };
    }
    const summaries: CharacterSummary[] = items.filter(isRecord).map((raw, index) => {
      const id = toString(raw.id, `character-${index}`);
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
      detail: (id: string) =>
        MOCK_AUTHOR_DATA.characterDetails.find((c) => c.id === id) ??
        synthesizeDetail(summaries.find((c) => c.id === id)),
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

export function useAuthorGraphData(
  projectId: string | undefined,
  options?: { enabled?: boolean }
): UseAuthorGraphResult {
  const graph = useAuthorGraph(projectId, undefined, options);

  return useMemo(() => {
    const rawNodes = (graph.data?.nodes ?? []) as unknown[];
    const rawEdges = (graph.data?.edges ?? []) as unknown[];

    if (!projectId || rawNodes.length === 0) {
      return {
        data: {
          nodes: MOCK_AUTHOR_DATA.graphNodes,
          edges: MOCK_AUTHOR_DATA.graphEdges,
        },
        isLoading: graph.isLoading,
        error: (graph.error as Error | undefined) ?? null,
        isFallback: true,
      };
    }

    const layout = circularLayout(rawNodes.length, 290, 190, 130);
    const nodes: GraphNode[] = rawNodes.filter(isRecord).map((raw, index) => {
      const id = toString(raw.id, `node-${index}`);
      const label = toString(raw.label, id);
      const role: GraphNode['role'] =
        index < 2 ? 'Lead' : index < 5 ? 'Supporting' : 'Minor';
      const point = layout[index] ?? { x: 290, y: 190 };
      return {
        id,
        label,
        role,
        x: point.x,
        y: point.y,
        r: role === 'Lead' ? 32 : role === 'Supporting' ? 22 : 16,
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

function circularLayout(count: number, cx: number, cy: number, radius: number) {
  if (count === 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

export type UseAuthorConflictsResult = DataState<ConflictItem[]>;

export function useAuthorConflictsList(
  projectId: string | undefined,
  conflicts: ReturnType<typeof useAuthorConflicts>
): UseAuthorConflictsResult {

  return useMemo(() => {
    const raw = (conflicts.data?.conflicts ?? []) as unknown[];

    if (!projectId || raw.length === 0) {
      return {
        data: MOCK_AUTHOR_DATA.conflicts,
        isLoading: conflicts.isLoading,
        error: (conflicts.error as Error | undefined) ?? null,
        isFallback: true,
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
      data: items.length > 0 ? items : MOCK_AUTHOR_DATA.conflicts,
      isLoading: conflicts.isLoading,
      error: (conflicts.error as Error | undefined) ?? null,
      isFallback: items.length === 0,
    };
  }, [projectId, conflicts.data, conflicts.isLoading, conflicts.error]);
}

export type UseAuthorUiHealthResult = DataState<AuthorUiHealth>;

export function useAuthorUiHealth(projectId: string | undefined): UseAuthorUiHealthResult {
  const sync = useAuthorSyncStatus(projectId, { enabled: Boolean(projectId) });

  return useMemo(() => {
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
      isFallback: !sync.isLoading,
    };
  }, [sync.data, sync.isLoading, sync.error]);
}

export function useAuthorProjectId(projects: AuthorProjectsResult): string | undefined {
  const project = projects.data?.projects?.[0] as Record<string, unknown> | undefined;
  return project ? toString(project.id) || undefined : undefined;
}
