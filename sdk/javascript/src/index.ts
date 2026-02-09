/**
 * Seizn - AI Memory SDK for JavaScript/TypeScript
 *
 * Persistent memory for your AI applications.
 */

// ── Interfaces ────────────────────────────────────────────

export interface SeiznConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface Memory {
  id: string;
  content: string;
  memory_type: string;
  tags: string[];
  namespace?: string;
  similarity?: number;
  created_at: string;
}

export interface AddMemoryOptions {
  memory_type?: 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
  tags?: string[];
  namespace?: string;
  scope?: 'user' | 'session' | 'agent';
  session_id?: string;
  agent_id?: string;
  source?: string;
  dedup?: boolean;
  auto_score?: boolean;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  namespace?: string;
  mode?: 'auto' | 'vector' | 'hybrid' | 'keyword';
  agent_id?: string;
  scope?: 'user' | 'session' | 'agent';
}

export interface MemoryHistory {
  current: Memory;
  history: Array<{
    id: string;
    content: string;
    memory_type: string;
    tags: string[];
    importance: number;
    version: number;
    changed_by: string;
    created_at: string;
  }>;
  versionCount: number;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  namespace: string | null;
  is_active: boolean;
  secret?: string;
  created_at: string;
}

export interface CreateWebhookOptions {
  name: string;
  url: string;
  events?: ('memory.created' | 'memory.updated' | 'memory.deleted')[];
  namespace?: string;
}

export interface ExtractOptions {
  model?: 'haiku' | 'sonnet';
  auto_store?: boolean;
  namespace?: string;
}

export interface ExtractResult {
  message: string;
  extracted: Array<{
    content: string;
    memory_type: string;
    tags: string[];
    confidence: number;
    importance: number;
  }>;
  stored: Memory[] | null;
}

export interface QueryOptions {
  model?: 'haiku' | 'sonnet';
  top_k?: number;
  namespace?: string;
  include_memories?: boolean;
}

export interface QueryResult {
  response: string;
  memories_used?: Array<{
    id: string;
    content: string;
    similarity: number;
  }>;
  model_used: string;
}

// ── Profile ───────────────────────────────────────────────

export interface Profile {
  aboutMe: string;
  preferences: Record<string, unknown>;
  constraints: string[];
  tools: string[];
  workstyle: string;
  customFields: Record<string, unknown>;
}

export interface ProfileUpdateOptions {
  aboutMe?: string;
  preferences?: Record<string, unknown>;
  constraints?: string[];
  tools?: string[];
  workstyle?: string;
  customFields?: Record<string, unknown>;
}

// ── Graph ─────────────────────────────────────────────────

export interface Graph {
  id: string;
  name: string;
  description: string;
  entity_count: number;
  relationship_count: number;
  created_at: string;
  updated_at: string;
}

export interface GraphEntity {
  id: string;
  type: string;
  name: string;
  description: string;
  aliases?: string[];
  confidence: number;
  created_at?: string;
}

export interface GraphRelationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  type: string;
  label: string;
  confidence: number;
}

export interface GraphExtractOptions {
  text: string;
  document_id?: string;
  entity_types?: string[];
  max_entities?: number;
  min_confidence?: number;
}

export interface GraphExtractResult {
  document_id: string;
  entities_extracted: number;
  relationships_extracted: number;
  processing_time_ms: number;
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

export interface GraphContextOptions {
  query: string;
  max_entities?: number;
  max_depth?: number;
  include_relationships?: boolean;
}

export interface GraphContextResult {
  graph_id: string;
  graph_name: string;
  query: string;
  context: {
    entities: GraphEntity[];
    relationships: GraphRelationship[];
    subgraph_description: string;
    relevance_score: number;
  };
}

// ── Evidence ──────────────────────────────────────────────

export interface EvidencePack {
  id: string;
  version: string;
  created: string;
  hash: string;
  purpose?: string;
  entity_count: number;
  activity_count?: number;
  agent_count?: number;
}

export interface CreateEvidenceOptions {
  trace_id?: string;
  purpose?: string;
  rag_interaction?: {
    query: string;
    query_id: string;
    contexts: Array<{ id: string; content: string; source: string }>;
    response: string;
    response_id: string;
    model_id: string;
  };
  entities?: Array<{ id: string; label?: string; value?: unknown; generated_at?: string }>;
  activities?: Array<{ id: string; label?: string; started_at?: string; ended_at?: string }>;
  agents?: Array<{ id: string; label?: string; type?: 'Person' | 'Organization' | 'SoftwareAgent' }>;
  sign?: boolean;
}

export interface EvidenceVerification {
  pack_id: string;
  valid: boolean;
  hash_verified: boolean;
  signature_verified: boolean | null;
  structure_valid: boolean;
  errors?: string[];
  verified_at: string;
}

// ── Security ──────────────────────────────────────────────

export interface ScanOptions {
  mode?: 'fast' | 'standard' | 'strict';
  action?: 'allow' | 'mask' | 'redact' | 'hash' | 'deny';
  include_secrets?: boolean;
  include_pii?: boolean;
  min_confidence?: number;
  return_masked?: boolean;
}

export interface ScanResult {
  clean: boolean;
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  pii?: {
    found: boolean;
    count: number;
    types: string[];
    entities: Array<{
      type: string;
      masked_value?: string;
      start: number;
      end: number;
      confidence: number;
    }>;
  };
  secrets?: {
    found: boolean;
    count: number;
    types: string[];
  };
  processed_text?: string;
  processing_time_ms: number;
}

export interface RedTeamOptions {
  categories?: string[];
  max_tests?: number;
  stop_on_critical?: boolean;
  mutation_depth?: number;
  timeout_ms?: number;
}

export interface RedTeamRun {
  id: string;
  status: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  started_at: string;
  completed_at?: string;
}

// ── Audit ─────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  sequence_number: number;
  entry_hash: string;
  prev_hash: string;
  created_at: string;
}

export interface AuditLogOptions {
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  status?: 'success' | 'failed' | 'denied';
}

// ── Errors ────────────────────────────────────────────────

export class SeiznError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'SeiznError';
  }
}

export class AuthenticationError extends SeiznError {
  constructor(message = 'Invalid API key') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends SeiznError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

// ── Client ────────────────────────────────────────────────

export class Seizn {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: SeiznConfig) {
    this.apiKey = config.apiKey || process.env.SEIZN_API_KEY || '';
    if (!this.apiKey) {
      throw new AuthenticationError(
        'API key required. Pass apiKey in config or set SEIZN_API_KEY environment variable.',
      );
    }

    this.baseUrl = (config.baseUrl || process.env.SEIZN_BASE_URL || 'https://seizn.com').replace(
      /\/$/,
      '',
    );
    this.timeout = config.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      params?: Record<string, string | number>;
    },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new AuthenticationError();
      }
      if (response.status === 429) {
        throw new RateLimitError();
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new SeiznError(error.error || 'Request failed', response.status);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SeiznError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SeiznError('Request timeout');
      }
      throw new SeiznError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ── Memory CRUD ───────────────────────────────────────

  async add(content: string, options: AddMemoryOptions = {}): Promise<Memory & { deduplicated?: boolean }> {
    const result = await this.request<{ success: boolean; data: { memory: Memory; deduplicated?: boolean } }>(
      'POST', '/api/v1/memories', {
        body: {
          content,
          memory_type: options.memory_type || 'fact',
          tags: options.tags || [],
          namespace: options.namespace || 'default',
          scope: options.scope,
          session_id: options.session_id,
          agent_id: options.agent_id,
          source: options.source || 'sdk',
          dedup: options.dedup,
          auto_score: options.auto_score,
        },
      },
    );
    return { ...result.data.memory, deduplicated: result.data.deduplicated };
  }

  async search(query: string, options: SearchOptions = {}): Promise<Memory[]> {
    const params: Record<string, string | number> = {
      query,
      limit: options.limit || 10,
      threshold: options.threshold || 0.7,
    };
    if (options.namespace) params.namespace = options.namespace;
    if (options.mode) params.mode = options.mode;
    if (options.agent_id) params.agent_id = options.agent_id;
    if (options.scope) params.scope = options.scope;

    const result = await this.request<{ success: boolean; data: { results: Memory[] } }>(
      'GET', '/api/v1/memories', { params },
    );
    return result.data.results;
  }

  async delete(ids: string[]): Promise<number> {
    const result = await this.request<{ success: boolean; data: { deleted: number } }>(
      'DELETE', '/api/v1/memories', { params: { ids: ids.join(',') } },
    );
    return result.data.deleted;
  }

  async history(memoryId: string): Promise<MemoryHistory> {
    const result = await this.request<{ success: boolean; data: MemoryHistory }>(
      'GET', '/api/v1/memories/history', { params: { memory_id: memoryId } },
    );
    return result.data;
  }

  // ── AI Features ───────────────────────────────────────

  async extract(conversation: string, options: ExtractOptions = {}): Promise<ExtractResult> {
    return this.request<ExtractResult>('POST', '/api/extract', {
      body: {
        conversation,
        model: options.model || 'haiku',
        auto_store: options.auto_store ?? true,
        namespace: options.namespace || 'default',
      },
    });
  }

  async query(query: string, options: QueryOptions = {}): Promise<QueryResult> {
    return this.request<QueryResult>('POST', '/api/query', {
      body: {
        query,
        model: options.model || 'haiku',
        top_k: options.top_k || 5,
        namespace: options.namespace,
        include_memories: options.include_memories ?? true,
      },
    });
  }

  // ── Profile ───────────────────────────────────────────

  async getProfile(): Promise<Profile> {
    const result = await this.request<{ success: boolean; profile: Profile }>(
      'GET', '/api/v1/profile',
    );
    return result.profile;
  }

  async updateProfile(options: ProfileUpdateOptions): Promise<Profile> {
    const result = await this.request<{ success: boolean; profile: Profile }>(
      'PUT', '/api/v1/profile', { body: options as Record<string, unknown> },
    );
    return result.profile;
  }

  async deriveProfile(): Promise<Profile> {
    const result = await this.request<{ success: boolean; profile: Profile }>(
      'POST', '/api/v1/profile/derive',
    );
    return result.profile;
  }

  // ── Knowledge Graphs ──────────────────────────────────

  async createGraph(name: string, description?: string): Promise<Graph> {
    const result = await this.request<{ graph: Graph }>(
      'POST', '/api/v1/graph', { body: { name, description } },
    );
    return result.graph;
  }

  async listGraphs(options?: { limit?: number; offset?: number }): Promise<{ graphs: Graph[]; pagination: { total: number; has_more: boolean } }> {
    const params: Record<string, string | number> = {};
    if (options?.limit) params.limit = options.limit;
    if (options?.offset) params.offset = options.offset;
    return this.request('GET', '/api/v1/graph', { params });
  }

  async extractToGraph(graphId: string, options: GraphExtractOptions): Promise<GraphExtractResult> {
    const result = await this.request<{ extraction: GraphExtractResult }>(
      'POST', `/api/v1/graph/${graphId}/extract`, { body: options as unknown as Record<string, unknown> },
    );
    return result.extraction;
  }

  async searchGraph(graphId: string, query: string, options?: { type?: string; limit?: number }): Promise<GraphEntity[]> {
    const params: Record<string, string | number> = { q: query };
    if (options?.type) params.type = options.type;
    if (options?.limit) params.limit = options.limit;
    const result = await this.request<{ entities: GraphEntity[] }>(
      'GET', `/api/v1/graph/${graphId}/search`, { params },
    );
    return result.entities;
  }

  async getGraphContext(graphId: string, options: GraphContextOptions): Promise<GraphContextResult> {
    return this.request<GraphContextResult>(
      'POST', `/api/v1/graph/${graphId}/context`, { body: options as unknown as Record<string, unknown> },
    );
  }

  // ── Evidence Packs (Provenance) ───────────────────────

  async createEvidence(options: CreateEvidenceOptions): Promise<EvidencePack> {
    const result = await this.request<{ evidence_pack: EvidencePack }>(
      'POST', '/api/v1/evidence', { body: options as Record<string, unknown> },
    );
    return result.evidence_pack;
  }

  async listEvidence(options?: { trace_id?: string; limit?: number; offset?: number }): Promise<EvidencePack[]> {
    const params: Record<string, string | number> = {};
    if (options?.trace_id) params.trace_id = options.trace_id;
    if (options?.limit) params.limit = options.limit;
    if (options?.offset) params.offset = options.offset;
    const result = await this.request<{ evidence_packs: EvidencePack[] }>(
      'GET', '/api/v1/evidence', { params },
    );
    return result.evidence_packs;
  }

  async getEvidence(id: string): Promise<EvidencePack & { provenance: Record<string, unknown> }> {
    const result = await this.request<{ evidence_pack: EvidencePack & { provenance: Record<string, unknown> } }>(
      'GET', `/api/v1/evidence/${id}`,
    );
    return result.evidence_pack;
  }

  async verifyEvidence(id: string): Promise<EvidenceVerification> {
    const result = await this.request<{ verification: EvidenceVerification }>(
      'GET', `/api/v1/evidence/${id}/verify`,
    );
    return result.verification;
  }

  // ── Security ──────────────────────────────────────────

  async scan(text: string, options: ScanOptions = {}): Promise<ScanResult> {
    return this.request<ScanResult>('POST', '/api/v1/security/scan', {
      body: { text, ...options } as Record<string, unknown>,
    });
  }

  async runRedTeam(options: RedTeamOptions = {}): Promise<RedTeamRun> {
    const result = await this.request<{ run: RedTeamRun }>(
      'POST', '/api/v1/security/red-team', { body: options as Record<string, unknown> },
    );
    return result.run;
  }

  async listRedTeamRuns(options?: { limit?: number; offset?: number; status?: string }): Promise<RedTeamRun[]> {
    const params: Record<string, string | number> = {};
    if (options?.limit) params.limit = options.limit;
    if (options?.offset) params.offset = options.offset;
    if (options?.status) params.status = options.status;
    const result = await this.request<{ runs: RedTeamRun[] }>(
      'GET', '/api/v1/security/red-team', { params },
    );
    return result.runs;
  }

  // ── Audit ─────────────────────────────────────────────

  async auditLog(options: AuditLogOptions): Promise<AuditLogEntry> {
    const result = await this.request<{ success: boolean; entry: AuditLogEntry }>(
      'POST', '/api/v1/audit/log', { body: options as unknown as Record<string, unknown> },
    );
    return result.entry;
  }

  // ── Webhooks ──────────────────────────────────────────

  async listWebhooks(): Promise<Webhook[]> {
    const result = await this.request<{ success: boolean; webhooks: Webhook[] }>(
      'GET', '/api/webhooks',
    );
    return result.webhooks;
  }

  async createWebhook(options: CreateWebhookOptions): Promise<Webhook> {
    const result = await this.request<{ success: boolean; webhook: Webhook }>(
      'POST', '/api/webhooks', { body: options as unknown as Record<string, unknown> },
    );
    return result.webhook;
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', '/api/webhooks', { params: { id } });
  }
}

export default Seizn;
