/**
 * Seizn Author REST API client (Layer 1).
 * Used by MCP tools to call seizn.com/api/v1/* endpoints with Bearer auth.
 */

const DEFAULT_BASE_URL = 'https://seizn.com/api/v1';

export interface SeiznClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface RecallEntity {
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
}

export interface ConflictHit {
  id: string;
  severity: 'P1' | 'P2' | 'P3';
  kind: string;
  episode: string | null;
  title: string;
  rationale: string;
  refs: string[];
}

export interface TimelineEntry {
  id: string;
  chapter: string;
  ordinal: number;
  beats: Array<{ id: string; summary: string; entities: string[] }>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
  weight: number;
}

export interface GraphSubset {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class SeiznApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'SeiznApiError';
  }
}

export class SeiznAuthorClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(config: SeiznClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetcher = config.fetch ?? globalThis.fetch;
  }

  async recall(projectId: string, query: string): Promise<RecallEntity[]> {
    const params = new URLSearchParams({ q: query });
    const result = await this.request<{ entities: RecallEntity[] }>(
      `/projects/${encodeURIComponent(projectId)}/recall?${params.toString()}`,
    );
    return result.entities;
  }

  async check(projectId: string, text: string): Promise<ConflictHit[]> {
    const result = await this.request<{ conflicts: ConflictHit[] }>(
      `/projects/${encodeURIComponent(projectId)}/conflicts/check`,
      { method: 'POST', body: JSON.stringify({ text }) },
    );
    return result.conflicts;
  }

  async remember(
    projectId: string,
    entityId: string,
    fact: string,
  ): Promise<{ entityId: string; status: 'approved' | 'suggested' }> {
    return this.request(
      `/projects/${encodeURIComponent(projectId)}/canon/${encodeURIComponent(entityId)}/approve`,
      { method: 'POST', body: JSON.stringify({ fact }) },
    );
  }

  async search(
    projectId: string,
    query: string,
    limit = 20,
  ): Promise<RecallEntity[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const result = await this.request<{ data: RecallEntity[] }>(
      `/projects/${encodeURIComponent(projectId)}/search?${params.toString()}`,
    );
    return result.data;
  }

  async timeline(
    projectId: string,
    fromChapter?: string,
    toChapter?: string,
  ): Promise<TimelineEntry[]> {
    const params = new URLSearchParams();
    if (fromChapter) params.set('from', fromChapter);
    if (toChapter) params.set('to', toChapter);
    const qs = params.toString();
    const result = await this.request<{ data: TimelineEntry[] }>(
      `/projects/${encodeURIComponent(projectId)}/timeline${qs ? `?${qs}` : ''}`,
    );
    return result.data;
  }

  async graph(projectId: string, rootEntityId: string): Promise<GraphSubset> {
    const params = new URLSearchParams({ root: rootEntityId });
    return this.request(
      `/projects/${encodeURIComponent(projectId)}/graph?${params.toString()}`,
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        'authorization': `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'user-agent': '@seizn/author-mcp-server',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await safeReadJson(response);
      throw new SeiznApiError(
        `Seizn API ${response.status} ${response.statusText} on ${path}`,
        response.status,
        body,
      );
    }

    return (await response.json()) as T;
  }
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
