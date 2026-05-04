/**
 * Minimal API client for Seizn memory endpoints.
 * Wraps `/api/v1/memories` (POST / GET) with bearer-token auth.
 */

const DEFAULT_BASE_URL = "https://www.seizn.com";

export interface ApiContext {
  apiKey: string;
  baseUrl: string;
}

function readContext(overrideBase?: string): ApiContext {
  const apiKey = process.env.SEIZN_API_KEY;
  if (!apiKey) {
    console.error("Error: SEIZN_API_KEY environment variable is not set.");
    console.error("Get a key at https://www.seizn.com/dashboard/api-keys");
    process.exit(1);
  }
  return {
    apiKey,
    baseUrl: overrideBase ?? process.env.SEIZN_BASE_URL ?? DEFAULT_BASE_URL,
  };
}

async function request<T>(
  path: string,
  init: RequestInit & { ctx: ApiContext }
): Promise<T> {
  const { ctx, ...rest } = init;
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      "Content-Type": "application/json",
      ...(rest.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export interface SaveBody {
  content: string;
  tags?: string[];
  agent_id?: string;
  scope?: string;
  auto_score?: boolean;
  dedup?: boolean;
}

export interface MemoryRecord {
  id: string;
  content: string;
  tags: string[];
  created_at: string;
  importance?: number;
}

export async function save(
  body: SaveBody,
  baseUrl?: string
): Promise<MemoryRecord> {
  const ctx = readContext(baseUrl);
  const data = await request<{ memory: MemoryRecord }>("/api/v1/memories", {
    ctx,
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.memory;
}

export interface SearchParams {
  query: string;
  mode?: "hybrid" | "vector" | "lexical";
  limit?: number;
  agent_id?: string;
  scope?: string;
}

export async function search(
  params: SearchParams,
  baseUrl?: string
): Promise<MemoryRecord[]> {
  const ctx = readContext(baseUrl);
  const qs = new URLSearchParams();
  qs.set("query", params.query);
  if (params.mode) qs.set("mode", params.mode);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.agent_id) qs.set("agent_id", params.agent_id);
  if (params.scope) qs.set("scope", params.scope);
  const data = await request<{ memories: MemoryRecord[] }>(
    `/api/v1/memories?${qs.toString()}`,
    { ctx, method: "GET" }
  );
  return data.memories ?? [];
}

export interface ExportParams {
  format?: "json" | "ndjson";
  agent_id?: string;
  scope?: string;
}

export async function exportAll(
  params: ExportParams,
  baseUrl?: string
): Promise<MemoryRecord[]> {
  const ctx = readContext(baseUrl);
  const qs = new URLSearchParams();
  if (params.agent_id) qs.set("agent_id", params.agent_id);
  if (params.scope) qs.set("scope", params.scope);
  qs.set("limit", "1000");
  const data = await request<{ memories: MemoryRecord[] }>(
    `/api/v1/memories?${qs.toString()}`,
    { ctx, method: "GET" }
  );
  return data.memories ?? [];
}
