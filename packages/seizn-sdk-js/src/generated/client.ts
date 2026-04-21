import type {
  AddMemoryRequest,
  ApiEnvelope,
  CanonCheckRequest,
  CanonCheckResult,
  DeleteMemoriesRequest,
  MemoryRecord,
  ReplaySnapshot,
  SearchMemoriesRequest,
} from "./models";

export interface SeiznClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class SeiznApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "SeiznApiError";
    this.status = status;
    this.body = body;
  }
}

export class SeiznClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SeiznClientOptions) {
    if (!options.apiKey) throw new Error("Seizn API key is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://www.seizn.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async createMemory(request: AddMemoryRequest): Promise<MemoryRecord> {
    const envelope = await this.request<ApiEnvelope<{ memory: MemoryRecord }>>("/api/v1/memories", {
      method: "POST",
      body: request,
    });
    return envelope.data.memory;
  }

  async searchMemories(request: SearchMemoriesRequest = {}): Promise<MemoryRecord[]> {
    const query = new URLSearchParams();
    append(query, "query", request.query);
    append(query, "limit", request.limit);
    append(query, "offset", request.offset);
    append(query, "namespace", request.namespace);
    append(query, "memory_type", request.memory_type);
    append(query, "tags", Array.isArray(request.tags) ? request.tags.join(",") : request.tags);
    append(query, "agent_id", request.agent_id);
    append(query, "scope", request.scope);
    append(query, "mode", request.mode);
    append(query, "threshold", request.threshold);

    const suffix = query.toString() ? `?${query.toString()}` : "";
    const envelope = await this.request<ApiEnvelope<{ memories?: MemoryRecord[]; results?: MemoryRecord[] }>>(
      `/api/v1/memories${suffix}`
    );
    return envelope.data.memories || envelope.data.results || [];
  }

  async deleteMemories(request: DeleteMemoriesRequest): Promise<ApiEnvelope<{ deleted?: number; ids?: string[] }>> {
    return this.request<ApiEnvelope<{ deleted?: number; ids?: string[] }>>("/api/v1/memories", {
      method: "DELETE",
      body: request,
    });
  }

  async checkCanon(request: CanonCheckRequest): Promise<CanonCheckResult> {
    const envelope = await this.request<ApiEnvelope<CanonCheckResult>>("/api/canon/check", {
      method: "POST",
      body: request,
    });
    return envelope.data;
  }

  async fetchReplay(traceId: string): Promise<ReplaySnapshot> {
    const envelope = await this.request<ApiEnvelope<{ snapshot: ReplaySnapshot }>>(
      `/api/v1/replay/${encodeURIComponent(traceId)}`
    );
    return envelope.data.snapshot;
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
    let body: string | undefined;

    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method || "GET",
      headers,
      body,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = parsed?.error?.message || response.statusText || "Seizn request failed";
      throw new SeiznApiError(response.status, message, parsed);
    }

    return parsed as T;
  }
}

function append(query: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value === undefined || value === "") return;
  query.set(key, String(value));
}
