/**
 * Seizn Winter - Source Connector
 *
 * Abstract connector interface and implementations for various
 * federated data source providers.
 */

import type {
  FederatedSource,
  FederatedSourceConfig,
  FederatedQueryFilter,
  ResultHighlight,
  SupabaseSourceConfig,
  PineconeSourceConfig,
  WeaviateSourceConfig,
  QdrantSourceConfig,
  HttpApiSourceConfig,
} from './types';

// ============================================
// Connector Types
// ============================================

/**
 * Search options for source connectors
 */
export interface ConnectorSearchOptions {
  query: string;
  embedding?: number[];
  topK: number;
  threshold?: number;
  filter?: FederatedQueryFilter;
}

/**
 * Search result from a connector
 */
export interface ConnectorSearchResult {
  id: string;
  documentId?: string;
  content: string;
  score: number;
  rawScore?: number;
  metadata?: Record<string, unknown>;
  highlights?: ResultHighlight[];
}

/**
 * Abstract source connector interface
 */
export interface SourceConnector {
  /** Source identifier */
  readonly sourceId: string;
  /** Provider type */
  readonly provider: string;

  /** Connect to the source */
  connect(): Promise<void>;
  /** Disconnect from the source */
  disconnect(): Promise<void>;
  /** Check source health */
  healthCheck(): Promise<boolean>;
  /** Execute a search query */
  search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]>;
}

// ============================================
// Base Connector Implementation
// ============================================

abstract class BaseConnector implements SourceConnector {
  protected connected: boolean = false;

  constructor(
    public readonly sourceId: string,
    public readonly provider: string,
    protected readonly config: FederatedSourceConfig
  ) {}

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract healthCheck(): Promise<boolean>;
  abstract search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]>;

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`Connector ${this.sourceId} is not connected`);
    }
  }
}

// ============================================
// Supabase Connector
// ============================================

class SupabaseConnector extends BaseConnector {
  private client: ReturnType<typeof createSupabaseClient> | null = null;

  constructor(source: FederatedSource) {
    super(source.id, 'supabase', source.config);
  }

  async connect(): Promise<void> {
    const config = this.config as SupabaseSourceConfig;
    this.client = createSupabaseClient(config.url, config.anonKey);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const config = this.config as SupabaseSourceConfig;
      const { error } = await this.client
        .from(config.tableName)
        .select('id')
        .limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]> {
    this.ensureConnected();
    if (!this.client) throw new Error('Client not initialized');

    const config = this.config as SupabaseSourceConfig;

    if (!options.embedding) {
      // Keyword search fallback
      const { data, error } = await this.client
        .from(config.tableName)
        .select('*')
        .textSearch(config.contentColumn, options.query)
        .limit(options.topK);

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>, index: number) => ({
        id: row.id as string,
        documentId: (row.document_id || row.id) as string,
        content: row[config.contentColumn] as string,
        score: 1 - index * 0.1, // Approximate score based on rank
        metadata: this.extractMetadata(row, config),
      }));
    }

    // Vector search using RPC function
    const { data, error } = await this.client.rpc('match_documents', {
      query_embedding: options.embedding,
      match_count: options.topK,
      filter_json: options.filter?.metadata || {},
    });

    if (error) throw error;

    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      documentId: (row.document_id as string) || (row.id as string),
      content: row[config.contentColumn] as string,
      score: row.similarity as number,
      rawScore: row.similarity as number,
      metadata: this.extractMetadata(row, config),
    }));
  }

  private extractMetadata(
    row: Record<string, unknown>,
    config: SupabaseSourceConfig
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    const excludeColumns = [
      'id',
      config.contentColumn,
      config.embeddingColumn,
      'similarity',
    ];

    for (const [key, value] of Object.entries(row)) {
      if (!excludeColumns.includes(key)) {
        metadata[key] = value;
      }
    }

    return metadata;
  }
}

// ============================================
// Pinecone Connector
// ============================================

class PineconeConnector extends BaseConnector {
  private baseUrl: string = '';
  private headers: Record<string, string> = {};

  constructor(source: FederatedSource) {
    super(source.id, 'pinecone', source.config);
  }

  async connect(): Promise<void> {
    const config = this.config as PineconeSourceConfig;
    this.baseUrl = `https://${config.indexName}-${config.projectId || ''}.svc.${config.environment}.pinecone.io`;
    this.headers = {
      'Api-Key': config.apiKey,
      'Content-Type': 'application/json',
    };
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/describe_index_stats`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({}),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]> {
    this.ensureConnected();

    if (!options.embedding) {
      throw new Error('Pinecone requires embedding for search');
    }

    const config = this.config as PineconeSourceConfig;

    const body: Record<string, unknown> = {
      vector: options.embedding,
      topK: options.topK,
      includeMetadata: true,
    };

    if (config.namespace) {
      body.namespace = config.namespace;
    }

    if (options.filter?.metadata) {
      body.filter = options.filter.metadata;
    }

    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Pinecone query failed: ${response.statusText}`);
    }

    const data = await response.json();

    return (data.matches || []).map((match: Record<string, unknown>) => ({
      id: match.id as string,
      documentId: match.id as string,
      content: (match.metadata as Record<string, unknown>)?.content as string || '',
      score: match.score as number,
      rawScore: match.score as number,
      metadata: match.metadata as Record<string, unknown>,
    }));
  }
}

// ============================================
// Weaviate Connector
// ============================================

class WeaviateConnector extends BaseConnector {
  private baseUrl: string = '';
  private headers: Record<string, string> = {};

  constructor(source: FederatedSource) {
    super(source.id, 'weaviate', source.config);
  }

  async connect(): Promise<void> {
    const config = this.config as WeaviateSourceConfig;
    this.baseUrl = `${config.scheme}://${config.host}`;
    this.headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/.well-known/ready`, {
        headers: this.headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]> {
    this.ensureConnected();

    const config = this.config as WeaviateSourceConfig;

    let nearVector = '';
    if (options.embedding) {
      nearVector = `nearVector: { vector: [${options.embedding.join(',')}] }`;
    } else {
      nearVector = `nearText: { concepts: ["${options.query}"] }`;
    }

    const graphqlQuery = `
      {
        Get {
          ${config.className}(
            limit: ${options.topK}
            ${nearVector}
          ) {
            _additional {
              id
              distance
            }
            content
            title
            metadata
          }
        }
      }
    `;

    const response = await fetch(`${this.baseUrl}/v1/graphql`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query: graphqlQuery }),
    });

    if (!response.ok) {
      throw new Error(`Weaviate query failed: ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.data?.Get?.[config.className] || [];

    return results.map((item: Record<string, unknown>) => {
      const additional = item._additional as Record<string, unknown>;
      return {
        id: additional.id as string,
        documentId: additional.id as string,
        content: item.content as string || '',
        score: 1 - ((additional.distance as number) || 0), // Convert distance to similarity
        rawScore: additional.distance as number,
        metadata: (item.metadata as Record<string, unknown>) || {},
      };
    });
  }
}

// ============================================
// Qdrant Connector
// ============================================

class QdrantConnector extends BaseConnector {
  private baseUrl: string = '';
  private headers: Record<string, string> = {};

  constructor(source: FederatedSource) {
    super(source.id, 'qdrant', source.config);
  }

  async connect(): Promise<void> {
    const config = this.config as QdrantSourceConfig;
    this.baseUrl = config.url;
    this.headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      this.headers['api-key'] = config.apiKey;
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        headers: this.headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]> {
    this.ensureConnected();

    if (!options.embedding) {
      throw new Error('Qdrant requires embedding for search');
    }

    const config = this.config as QdrantSourceConfig;

    const body: Record<string, unknown> = {
      vector: options.embedding,
      limit: options.topK,
      with_payload: true,
    };

    if (options.threshold) {
      body.score_threshold = options.threshold;
    }

    if (options.filter?.metadata) {
      body.filter = { must: this.buildQdrantFilter(options.filter.metadata) };
    }

    const response = await fetch(
      `${this.baseUrl}/collections/${config.collectionName}/points/search`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new Error(`Qdrant query failed: ${response.statusText}`);
    }

    const data = await response.json();

    return (data.result || []).map((point: Record<string, unknown>) => {
      const payload = point.payload as Record<string, unknown>;
      return {
        id: point.id as string,
        documentId: (payload.document_id as string) || (point.id as string),
        content: (payload.content as string) || '',
        score: point.score as number,
        rawScore: point.score as number,
        metadata: payload,
      };
    });
  }

  private buildQdrantFilter(
    metadata: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    return Object.entries(metadata).map(([key, value]) => ({
      key,
      match: { value },
    }));
  }
}

// ============================================
// HTTP API Connector
// ============================================

class HttpApiConnector extends BaseConnector {
  constructor(source: FederatedSource) {
    super(source.id, 'http_api', source.config);
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async healthCheck(): Promise<boolean> {
    const config = this.config as HttpApiSourceConfig;

    try {
      const response = await fetch(config.baseUrl, {
        method: 'HEAD',
        headers: this.buildHeaders(config),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(options: ConnectorSearchOptions): Promise<ConnectorSearchResult[]> {
    this.ensureConnected();

    const config = this.config as HttpApiSourceConfig;
    const url = `${config.baseUrl}${config.searchEndpoint}`;
    const headers = this.buildHeaders(config);

    let response: Response;

    if (config.method === 'GET') {
      const params = new URLSearchParams({
        query: options.query,
        limit: options.topK.toString(),
      });
      response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers,
      });
    } else {
      const body = this.transformRequest(options, config);
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP API query failed: ${response.statusText}`);
    }

    const data = await response.json();
    return this.transformResponse(data, config);
  }

  private buildHeaders(config: HttpApiSourceConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (config.auth) {
      switch (config.auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${config.auth.token}`;
          break;
        case 'api_key':
          headers[config.auth.headerName || 'X-API-Key'] = config.auth.token || '';
          break;
        case 'basic':
          const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
          headers['Authorization'] = `Basic ${credentials}`;
          break;
      }
    }

    return headers;
  }

  private transformRequest(
    options: ConnectorSearchOptions,
    config: HttpApiSourceConfig
  ): Record<string, unknown> {
    // Default request structure
    return {
      query: options.query,
      embedding: options.embedding,
      limit: options.topK,
      threshold: options.threshold,
      filter: options.filter?.metadata,
    };
  }

  private transformResponse(
    data: unknown,
    _config: HttpApiSourceConfig
  ): ConnectorSearchResult[] {
    // Default response transformation (expects array of results)
    const results: unknown[] = Array.isArray(data)
      ? data
      : ((data as Record<string, unknown>).results as unknown[]) || [];

    return results.map((item: unknown, index: number) => {
      const row = item as Record<string, unknown>;
      return {
        id: (row.id as string) || `result_${index}`,
        documentId: (row.document_id as string) || (row.id as string) || `result_${index}`,
        content: (row.content as string) || (row.text as string) || '',
        score: (row.score as number) || (row.similarity as number) || 1 - index * 0.1,
        metadata: (row.metadata as Record<string, unknown>) || {},
      };
    });
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a source connector based on provider type
 */
export function createConnector(source: FederatedSource): SourceConnector {
  switch (source.provider) {
    case 'supabase':
      return new SupabaseConnector(source);
    case 'pinecone':
      return new PineconeConnector(source);
    case 'weaviate':
      return new WeaviateConnector(source);
    case 'qdrant':
      return new QdrantConnector(source);
    case 'http_api':
      return new HttpApiConnector(source);
    default:
      throw new Error(`Unsupported provider: ${source.provider}`);
  }
}

// ============================================
// Helper: Create Supabase Client
// ============================================

function createSupabaseClient(url: string, anonKey: string) {
  // Dynamic import would be ideal, but for simplicity we'll use fetch
  return {
    from: (table: string) => ({
      select: (columns: string = '*') => ({
        textSearch: (column: string, query: string) => ({
          limit: async (count: number) => {
            const response = await fetch(
              `${url}/rest/v1/${table}?select=${columns}&${column}=fts.${encodeURIComponent(query)}&limit=${count}`,
              {
                headers: {
                  apikey: anonKey,
                  Authorization: `Bearer ${anonKey}`,
                },
              }
            );

            if (!response.ok) {
              return { data: null, error: new Error(response.statusText) };
            }

            const data = await response.json();
            return { data, error: null };
          },
        }),
        limit: async (count: number) => {
          const response = await fetch(
            `${url}/rest/v1/${table}?select=${columns}&limit=${count}`,
            {
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
              },
            }
          );

          if (!response.ok) {
            return { data: null, error: new Error(response.statusText) };
          }

          const data = await response.json();
          return { data, error: null };
        },
      }),
    }),
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        return { data: null, error: new Error(response.statusText) };
      }

      const data = await response.json();
      return { data, error: null };
    },
  };
}
