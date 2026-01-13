/**
 * Pinecone Vector Store Implementation
 *
 * BYO connector for Pinecone vector database.
 * Supports serverless and pod-based indexes.
 */

import { BaseVectorStore } from './base';
import type {
  PineconeStoreConfig,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
  VectorFilter,
  HealthCheckResult,
  UpsertResult,
  SearchResponse,
  DeleteResult,
  FetchResult,
  StoreStats,
} from './types';

// Pinecone API response types
interface PineconeMatch {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, unknown>;
}

interface PineconeQueryResponse {
  matches: PineconeMatch[];
  namespace: string;
}

interface PineconeDescribeResponse {
  namespaces: Record<string, { vectorCount: number }>;
  dimension: number;
  indexFullness: number;
  totalVectorCount: number;
}

interface PineconeFetchResponse {
  vectors: Record<string, {
    id: string;
    values: number[];
    metadata?: Record<string, unknown>;
  }>;
  namespace: string;
}

export class PineconeStore extends BaseVectorStore {
  readonly provider = 'pinecone' as const;

  private apiKey: string;
  private host: string;
  private defaultNamespace: string;

  constructor(config: PineconeStoreConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.host = config.host;
    this.defaultNamespace = config.namespace || '';
  }

  private get headers(): Record<string, string> {
    return {
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  private get baseUrl(): string {
    // Support both full URLs and just host
    if (this.host.startsWith('http')) {
      return this.host;
    }
    return `https://${this.host}`;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  async connect(): Promise<void> {
    this.log('Connecting to Pinecone...');

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/describe_index_stats`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw this.createError(
            'Invalid Pinecone API key',
            'AUTHENTICATION_FAILED'
          );
        }
        const error = await response.text();
        throw this.createError(
          `Failed to connect to Pinecone: ${error}`,
          'CONNECTION_FAILED'
        );
      }

      this._connected = true;
      this.log('Connected to Pinecone successfully');
    } catch (error) {
      if (error instanceof Error && error.name === 'VectorStoreError') {
        throw error;
      }
      throw this.createError(
        `Failed to connect to Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.log('Disconnected from Pinecone');
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = performance.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/describe_index_stats`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({}),
        },
        5000 // Short timeout for health check
      );

      return {
        healthy: response.ok,
        latencyMs: Math.round(performance.now() - start),
        message: response.ok ? 'OK' : `Status: ${response.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async upsert(records: VectorRecord[], namespace?: string): Promise<UpsertResult> {
    this.ensureConnected();

    const ns = namespace || this.defaultNamespace;
    const batchSize = 100; // Pinecone limit
    const batches = this.batchArray(records, batchSize);

    let totalUpserted = 0;

    for (const batch of batches) {
      await this.withRetry(async () => {
        const vectors = batch.map(record => ({
          id: record.id,
          values: record.vector,
          metadata: {
            ...record.metadata,
            ...(record.content ? { content: record.content } : {}),
          },
        }));

        const body: Record<string, unknown> = { vectors };
        if (ns) {
          body.namespace = ns;
        }

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/vectors/upsert`,
          {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw this.createError(`Pinecone upsert failed: ${error}`, 'INTERNAL_ERROR');
        }

        const result = await response.json() as { upsertedCount: number };
        totalUpserted += result.upsertedCount;
      }, 'upsert');
    }

    this.log(`Upserted ${totalUpserted} vectors`);
    return { upsertedCount: totalUpserted };
  }

  async search(options: VectorSearchOptions): Promise<SearchResponse> {
    this.ensureConnected();

    const { result, latencyMs } = await this.measureLatency(async () => {
      return this.withRetry(async () => {
        const body: Record<string, unknown> = {
          vector: options.vector,
          topK: options.topK || 10,
          includeMetadata: options.includeMetadata !== false,
          includeValues: options.includeVectors || false,
        };

        const ns = options.namespace || this.defaultNamespace;
        if (ns) {
          body.namespace = ns;
        }

        if (options.filter) {
          body.filter = this.convertFilter(options.filter);
        }

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/query`,
          {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw this.createError(`Pinecone query failed: ${error}`, 'INTERNAL_ERROR');
        }

        return await response.json() as PineconeQueryResponse;
      }, 'search');
    });

    const results: VectorSearchResult[] = result.matches.map(match => ({
      id: match.id,
      score: match.score,
      vector: match.values,
      metadata: match.metadata,
      content: match.metadata?.content as string | undefined,
    }));

    this.log(`Search returned ${results.length} results in ${latencyMs}ms`);

    return {
      results,
      latencyMs,
      namespace: options.namespace || this.defaultNamespace,
    };
  }

  async delete(ids: string[], namespace?: string): Promise<DeleteResult> {
    this.ensureConnected();

    const ns = namespace || this.defaultNamespace;

    await this.withRetry(async () => {
      const body: Record<string, unknown> = { ids };
      if (ns) {
        body.namespace = ns;
      }

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/vectors/delete`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Pinecone delete failed: ${error}`, 'INTERNAL_ERROR');
      }
    }, 'delete');

    this.log(`Deleted ${ids.length} vectors`);
    return { deletedCount: ids.length };
  }

  async deleteByFilter(filter: VectorFilter, namespace?: string): Promise<DeleteResult> {
    this.ensureConnected();

    const ns = namespace || this.defaultNamespace;

    await this.withRetry(async () => {
      const body: Record<string, unknown> = {
        filter: this.convertFilter(filter),
      };
      if (ns) {
        body.namespace = ns;
      }

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/vectors/delete`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Pinecone delete by filter failed: ${error}`, 'INTERNAL_ERROR');
      }
    }, 'deleteByFilter');

    // Pinecone doesn't return count for filter-based deletes
    return { deletedCount: -1 };
  }

  async fetch(ids: string[], namespace?: string): Promise<FetchResult> {
    this.ensureConnected();

    const ns = namespace || this.defaultNamespace;

    const result = await this.withRetry(async () => {
      const params = new URLSearchParams();
      ids.forEach(id => params.append('ids', id));
      if (ns) {
        params.append('namespace', ns);
      }

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/vectors/fetch?${params.toString()}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Pinecone fetch failed: ${error}`, 'INTERNAL_ERROR');
      }

      return await response.json() as PineconeFetchResponse;
    }, 'fetch');

    const records: VectorRecord[] = Object.values(result.vectors).map(v => ({
      id: v.id,
      vector: v.values,
      metadata: v.metadata,
      content: v.metadata?.content as string | undefined,
    }));

    const foundIds = new Set(records.map(r => r.id));
    const missingIds = ids.filter(id => !foundIds.has(id));

    return { records, missingIds: missingIds.length > 0 ? missingIds : undefined };
  }

  async stats(): Promise<StoreStats> {
    this.ensureConnected();

    const result = await this.withRetry(async () => {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/describe_index_stats`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Pinecone stats failed: ${error}`, 'INTERNAL_ERROR');
      }

      return await response.json() as PineconeDescribeResponse;
    }, 'stats');

    return {
      totalVectors: result.totalVectorCount,
      dimension: result.dimension,
      indexFullness: result.indexFullness,
      namespaces: result.namespaces,
      raw: result as unknown as Record<string, unknown>,
    };
  }

  // ============================================================================
  // Filter Conversion
  // ============================================================================

  /**
   * Convert generic filter to Pinecone filter format
   */
  private convertFilter(filter: VectorFilter): Record<string, unknown> {
    const pineconeFilter: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and') {
        pineconeFilter['$and'] = (value as VectorFilter[]).map(f => this.convertFilter(f));
      } else if (key === '$or') {
        pineconeFilter['$or'] = (value as VectorFilter[]).map(f => this.convertFilter(f));
      } else if (key === '$not') {
        // Pinecone uses $ne for not equal
        const notFilter = this.convertFilter(value as VectorFilter);
        for (const [nk, nv] of Object.entries(notFilter)) {
          pineconeFilter[nk] = { $ne: nv };
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle field operators
        pineconeFilter[key] = this.convertFieldFilter(value as Record<string, unknown>);
      } else {
        // Direct equality
        pineconeFilter[key] = { $eq: value };
      }
    }

    return pineconeFilter;
  }

  private convertFieldFilter(filter: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};

    for (const [op, value] of Object.entries(filter)) {
      switch (op) {
        case '$eq':
        case '$ne':
        case '$gt':
        case '$gte':
        case '$lt':
        case '$lte':
        case '$in':
        case '$nin':
          converted[op] = value;
          break;
        case '$exists':
          // Pinecone doesn't support exists directly
          // Skip or throw error
          break;
        case '$contains':
          // Not directly supported
          break;
        default:
          converted[op] = value;
      }
    }

    return converted;
  }
}
