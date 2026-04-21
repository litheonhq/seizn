import { resolveBaseUrl, requireToken } from "./config-store.js";
import type { CanonLock, MemoryResult } from "./types.js";

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

export interface ClientOptions {
  baseUrl?: string;
  token?: string;
}

export class SeiznApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "SeiznApiError";
  }
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function encodeQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export class SeiznApiClient {
  private constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  static async create(options: ClientOptions = {}) {
    const [baseUrl, token] = await Promise.all([
      resolveBaseUrl(options.baseUrl),
      requireToken(options.token),
    ]);
    return new SeiznApiClient(baseUrl, token);
  }

  async request<T>(apiPath: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(apiPath, this.baseUrl);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...init, headers });
    const payload = (await parseResponse(response)) as ApiEnvelope<T> | string | null;

    if (!response.ok) {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const envelope = payload as ApiEnvelope<T>;
        throw new SeiznApiError(
          envelope.error?.message || envelope.message || `Seizn API failed with ${response.status}`,
          response.status,
          envelope.error?.code
        );
      }
      throw new SeiznApiError(`Seizn API failed with ${response.status}`, response.status);
    }

    if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
      return (payload as ApiEnvelope<T>).data as T;
    }
    return payload as T;
  }

  async requestBinary(apiPath: string, init: RequestInit = {}) {
    const url = new URL(apiPath, this.baseUrl);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);

    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      const payload = (await parseResponse(response)) as ApiEnvelope<unknown> | string | null;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        throw new SeiznApiError(
          payload.error?.message || payload.message || `Seizn API failed with ${response.status}`,
          response.status,
          payload.error?.code
        );
      }
      throw new SeiznApiError(`Seizn API failed with ${response.status}`, response.status);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async listMemories(options: {
    limit?: number;
    namespace?: string;
    agentId?: string;
    query?: string;
  } = {}) {
    return this.request<{
      results: MemoryResult[];
      count: number;
      total: number;
      mode: string;
    }>(
      `/api/v1/memories${encodeQuery({
        limit: Math.min(Math.max(options.limit || 20, 1), 100),
        namespace: options.namespace,
        agent_id: options.agentId,
        query: options.query,
      })}`
    );
  }

  async getReplay(traceId: string) {
    return this.request<{ snapshot: Record<string, unknown> }>(
      `/api/v1/replay/${encodeURIComponent(traceId)}`
    );
  }

  async listCanon() {
    return this.request<{ locks: CanonLock[]; violations: unknown[] }>("/api/canon/locks");
  }

  async createCanonLock(lock: CanonLock) {
    return this.request<{ lock: CanonLock }>("/api/canon/locks", {
      method: "POST",
      body: JSON.stringify({
        npcId: lock.npcId || null,
        scope: lock.scope,
        statement: lock.statement,
        regexFastpath: lock.regexFastpath || null,
        severity: lock.severity,
        active: lock.active,
      }),
    });
  }

  async updateCanonLock(id: string, lock: CanonLock) {
    return this.request<{ lock: CanonLock }>(`/api/canon/locks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        npcId: lock.npcId || null,
        scope: lock.scope,
        statement: lock.statement,
        regexFastpath: lock.regexFastpath || null,
        severity: lock.severity,
        active: lock.active,
      }),
    });
  }

  async exportSaveFile(npcId: string) {
    return this.requestBinary(`/api/save-file/export/${encodeURIComponent(npcId)}`);
  }

  async importSaveFile(file: Buffer) {
    return this.request<{
      npcId: string;
      imported: {
        memories: number;
        beliefs: number;
        canonLocks: number;
      };
    }>("/api/save-file/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.seizn.savefile",
      },
      body: file as unknown as BodyInit,
    });
  }

  async exportNpcVisualizationSvg(
    npcId: string,
    view: 'timeline' | 'graph',
    options: { limit?: number } = {}
  ) {
    const search = new URLSearchParams({ format: 'svg' });
    if (options.limit) search.set('limit', String(options.limit));
    return this.requestBinary(`/api/npcs/${encodeURIComponent(npcId)}/${view}?${search.toString()}`);
  }
}
