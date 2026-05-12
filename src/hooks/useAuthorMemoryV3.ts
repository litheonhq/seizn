'use client';

import { useMemo } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import useSWRMutation from 'swr/mutation';
import { csrfFetch } from '@/lib/client/csrf-fetch';

type JsonRecord = Record<string, unknown>;
type LoadOptions = { enabled?: boolean };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await csrfFetch(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, { arg }: { arg?: JsonRecord }): Promise<T> {
  const response = await csrfFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg ?? {}),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

async function patchJson<T>(url: string, { arg }: { arg?: JsonRecord }): Promise<T> {
  const response = await csrfFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg ?? {}),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

async function deleteJson<T>(url: string): Promise<T> {
  const response = await csrfFetch(url, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function queryString(filters?: JsonRecord): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function useAuthorProjects() {
  return useSWR<{ projects: JsonRecord[] }>('/api/projects', fetchJson, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
  });
}

export function useCreateAuthorProject() {
  return useSWRMutation<{ project_id: string }, Error, string, JsonRecord>('/api/projects', postJson, {
    onSuccess: () => {
      void globalMutate('/api/projects');
    },
  });
}

export function useAuthorImports(projectId?: string) {
  return useSWR<{ imports: JsonRecord[]; summary: JsonRecord }>(
    projectId ? `/api/projects/${projectId}/imports` : null,
    fetchJson,
    {
      refreshInterval: (data) => {
        const active = data?.imports.some((item) =>
          item.parse_status === 'parsing' || item.extract_status === 'extracting'
        );
        return active ? 10000 : 0;
      },
    }
  );
}

export function useUploadAuthorImport(projectId?: string) {
  return useSWRMutation<{ import_id: string }, Error, string | null, FormData>(
    projectId ? `/api/projects/${projectId}/imports` : null,
    async (url, { arg }) => {
      const response = await csrfFetch(url, {
        method: 'POST',
        body: arg,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json() as Promise<{ import_id: string }>;
    },
    {
      onSuccess: (_, key) => {
        if (key) void globalMutate(key);
        if (projectId) void globalMutate((cacheKey) =>
          typeof cacheKey === 'string' && cacheKey.includes(`/api/projects/${projectId}/audit`)
        );
      },
    }
  );
}

export function useAuthorCandidates(projectId?: string, filters?: JsonRecord) {
  const key = useMemo(
    () => projectId ? `/api/projects/${projectId}/candidates${queryString(filters)}` : null,
    [projectId, filters]
  );
  return useSWR<{ candidates: JsonRecord[]; total: number; page: number }>(key, fetchJson, {
    revalidateOnFocus: false,
    refreshInterval: 60000,
  });
}

export function useAuthorCandidate(projectId?: string, candidateId?: string) {
  return useSWR<{ candidate: JsonRecord }>(
    projectId && candidateId ? `/api/projects/${projectId}/candidates/${candidateId}` : null,
    fetchJson
  );
}

export function useDecideAuthorCandidate(projectId?: string, candidateId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId && candidateId ? `/api/projects/${projectId}/candidates/${candidateId}/decide` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/candidates`));
          void globalMutate(`/api/projects/${projectId}/characters`);
          void globalMutate(`/api/projects/${projectId}/graph`);
          void globalMutate(`/api/projects/${projectId}/timeline`);
          void globalMutate(`/api/projects/${projectId}/conflicts`);
        }
      },
    }
  );
}

export function useBatchDecideAuthorCandidates(projectId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId ? `/api/projects/${projectId}/candidates/batch_decide` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/candidates`));
          void globalMutate(`/api/projects/${projectId}/characters`);
        }
      },
    }
  );
}

export function useCreateAuthorCandidate(projectId?: string) {
  return useSWRMutation<{ candidate_id: string }, Error, string | null, JsonRecord>(
    projectId ? `/api/projects/${projectId}/candidates` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/candidates`));
        }
      },
    }
  );
}

export function useAuthorCharacters(projectId?: string, options?: LoadOptions) {
  return useSWR<{ characters: JsonRecord[] }>(
    projectId && options?.enabled !== false ? `/api/projects/${projectId}/characters` : null,
    fetchJson,
    { refreshInterval: 60000 }
  );
}

export function useAuthorCharacter(projectId?: string, characterId?: string) {
  return useSWR<{ character: JsonRecord }>(
    projectId && characterId ? `/api/projects/${projectId}/characters/${characterId}` : null,
    fetchJson
  );
}

export function useUpdateAuthorCharacter(projectId?: string, characterId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId && characterId ? `/api/projects/${projectId}/characters/${characterId}` : null,
    patchJson,
    {
      onSuccess: () => {
        if (projectId && characterId) {
          void globalMutate(`/api/projects/${projectId}/characters/${characterId}`);
          void globalMutate(`/api/projects/${projectId}/characters`);
          void globalMutate(`/api/projects/${projectId}/graph`);
          void globalMutate(`/api/projects/${projectId}/timeline`);
          void globalMutate(`/api/projects/${projectId}/conflicts`);
        }
      },
    }
  );
}

export function useGenerateAuthorBacklog(projectId?: string, characterId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId && characterId ? `/api/projects/${projectId}/characters/${characterId}/backlog` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId && characterId) {
          void globalMutate(`/api/projects/${projectId}/characters/${characterId}`);
          void globalMutate(`/api/projects/${projectId}/characters`);
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/candidates`));
          void globalMutate(`/api/projects/${projectId}/conflicts`);
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/audit`));
        }
      },
    }
  );
}

export function useAuthorGraph(projectId?: string, filters?: JsonRecord, options?: LoadOptions) {
  const key = useMemo(
    () => projectId && options?.enabled !== false ? `/api/projects/${projectId}/graph${queryString(filters)}` : null,
    [projectId, filters, options?.enabled]
  );
  return useSWR<{ nodes: JsonRecord[]; edges: JsonRecord[] }>(key, fetchJson, {
    refreshInterval: 60000,
  });
}

export function useAuthorTimeline(projectId?: string, filters?: JsonRecord) {
  const key = useMemo(
    () => projectId ? `/api/projects/${projectId}/timeline${queryString(filters)}` : null,
    [projectId, filters]
  );
  return useSWR<{ events: JsonRecord[]; phase_markers: JsonRecord[] }>(key, fetchJson, {
    refreshInterval: 60000,
  });
}

export function useAuthorConflicts(projectId?: string, filters?: JsonRecord, options?: LoadOptions) {
  const key = useMemo(
    () => projectId && options?.enabled !== false ? `/api/projects/${projectId}/conflicts${queryString(filters)}` : null,
    [projectId, filters, options?.enabled]
  );
  return useSWR<{ conflicts: JsonRecord[] }>(key, fetchJson, {
    revalidateOnFocus: false,
    refreshInterval: 60000,
  });
}

export function useResolveAuthorConflict(projectId?: string, conflictId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId && conflictId ? `/api/projects/${projectId}/conflicts/${conflictId}/resolve` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/conflicts`));
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/candidates`));
        }
      },
    }
  );
}

export function useRunAuthorSimulation(projectId?: string) {
  return useSWRMutation<{ simulation_id: string; status: string; stream_url?: string }, Error, string | null, JsonRecord>(
    projectId ? `/api/projects/${projectId}/simulate` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/audit`));
        }
      },
    }
  );
}

export function useAuthorSimulation(projectId?: string, simulationId?: string) {
  return useSWR<JsonRecord>(
    projectId && simulationId ? `/api/projects/${projectId}/simulations/${simulationId}` : null,
    fetchJson,
    {
      refreshInterval: (data) => data?.status === 'running' ? 3000 : 0,
    }
  );
}

export function useReplayAuthorSimulation(projectId?: string, simulationId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId && simulationId ? `/api/projects/${projectId}/simulations/${simulationId}/replay` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId && simulationId) {
          void globalMutate(`/api/projects/${projectId}/simulations/${simulationId}`);
        }
      },
    }
  );
}

export function useAuthorAuditLogs(projectId?: string, filters?: JsonRecord, options?: LoadOptions) {
  const key = useMemo(
    () => projectId && options?.enabled !== false ? `/api/projects/${projectId}/audit${queryString(filters)}` : null,
    [projectId, filters, options?.enabled]
  );
  return useSWR<{ audit_logs: JsonRecord[]; total: number; replay_available: boolean }>(key, fetchJson, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
  });
}

export function useReplayAuthorAuditDecision(projectId?: string, decisionId?: string) {
  return useSWR<JsonRecord>(
    projectId && decisionId
      ? `/api/projects/${projectId}/audit?replay=1&decision_id=${encodeURIComponent(decisionId)}`
      : null,
    fetchJson
  );
}

export function useAuthorSettings(projectId?: string) {
  return useSWR<JsonRecord>(projectId ? `/api/projects/${projectId}/settings` : null, fetchJson, {
    refreshInterval: 60000,
  });
}

export function useUpdateAuthorSettings(projectId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null, JsonRecord>(
    projectId ? `/api/projects/${projectId}/settings` : null,
    patchJson,
    {
      onSuccess: (_, key) => {
        if (key) void globalMutate(key);
        if (projectId) void globalMutate((cacheKey) =>
          typeof cacheKey === 'string' && cacheKey.includes(`/api/projects/${projectId}/audit`)
        );
      },
    }
  );
}

export function useAuthorByok() {
  return useSWR<JsonRecord>('/api/account/byok', fetchJson, {
    refreshInterval: 300000,
  });
}

export function useSaveAuthorByok() {
  return useSWRMutation<JsonRecord, Error, string, JsonRecord>('/api/account/byok', postJson, {
    onSuccess: () => {
      void globalMutate('/api/account/byok');
      void globalMutate('/api/account/usage');
    },
  });
}

export function useAuthorUsage() {
  return useSWR<JsonRecord>('/api/account/usage', fetchJson, {
    refreshInterval: 60000,
  });
}

export function useAuthorSyncStatus(projectId?: string, options?: LoadOptions) {
  return useSWR<JsonRecord>(
    projectId && options?.enabled !== false ? `/api/projects/${projectId}/sync/status` : null,
    fetchJson,
    { refreshInterval: 30000 }
  );
}

export function useAuthorSearch(projectId?: string, query?: string) {
  return useSWR<{ results: JsonRecord[] }>(
    projectId && query ? `/api/projects/${projectId}/search?q=${encodeURIComponent(query)}` : null,
    fetchJson
  );
}

export function useDeleteAuthorImport(projectId?: string, importId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null>(
    projectId && importId ? `/api/projects/${projectId}/imports/${importId}` : null,
    deleteJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate(`/api/projects/${projectId}/imports`);
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/candidates`));
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/audit`));
        }
      },
    }
  );
}

export function useRetryAuthorImport(projectId?: string, importId?: string) {
  return useSWRMutation<JsonRecord, Error, string | null>(
    projectId && importId ? `/api/projects/${projectId}/imports/${importId}/retry` : null,
    postJson,
    {
      onSuccess: () => {
        if (projectId) {
          void globalMutate(`/api/projects/${projectId}/imports`);
          void globalMutate((key) => typeof key === 'string' && key.includes(`/api/projects/${projectId}/audit`));
        }
      },
    }
  );
}
