/**
 * Qdrant Vector Store Implementation
 *
 * BYO connector for Qdrant vector database.
 * Supports both self-hosted and Qdrant Cloud instances.
 */

import { BaseVectorStore } from './base';
import type {
  QdrantStoreConfig,
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

// Qdrant API types
interface QdrantPoint {
  id: string | number;
  vector: number[] | Record<string, number[]>;
  payload?: Record<string, unknown>;
}

interface QdrantScoredPoint {
  id: string | number;
  version: number;
  score: number;
  vector?: number[] | Record<string, number[]>;
  payload?: Record<string, unknown>;
}

interface QdrantSearchResponse {
  result: QdrantScoredPoint[];
  status: string;
  time: number;
}

interface QdrantGetResponse {
  result: {
    points: QdrantPoint[];
  };
  status: string;
  time: number;
}

interface QdrantCollectionInfo {
  result: {
    status: string;
    optimizer_status: string;
    vectors_count: number;
    indexed_vectors_count: number;
    points_count: number;
    segments_count: number;
    config: {
      params: {
        vectors: {
          size: number;
          distance: string;
        };
      };
    };
  };
  status: string;
  time: number;
}

interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

interface QdrantCondition {
  key?: string;
  match?: { value: unknown } | { any: unknown[] };
  range?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
  is_empty?: { key: string };
  is_null?: { key: string };
  filter?: QdrantFilter;
}

export class QdrantStore extends BaseVectorStore {
  readonly provider = 'qdrant' as const;

  private url: string;
  private apiKey?: string;
  private collectionName: string;

  constructor(config: QdrantStoreConfig) {
    super(config);
    // Remove trailing slash if present
    this.url = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.collectionName = config.collectionName;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  async connect(): Promise<void> {
    this.log('Connecting to Qdrant...');

    try {
      // Check cluster health
      const healthResponse = await this.fetchWithTimeout(
        `${this.url}/healthz`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (!healthResponse.ok) {
        throw this.createError(
          `Qdrant health check failed: ${healthResponse.statusText}`,
          'CONNECTION_FAILED'
        );
      }

      // Verify collection exists
      const collectionResponse = await this.fetchWithTimeout(
        `${this.url}/collections/${this.collectionName}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (!collectionResponse.ok) {
        if (collectionResponse.status === 401 || collectionResponse.status === 403) {
          throw this.createError(
            'Invalid Qdrant API key',
            'AUTHENTICATION_FAILED'
          );
        }
        if (collectionResponse.status === 404) {
          throw this.createError(
            `Collection "${this.collectionName}" not found`,
            'NOT_FOUND'
          );
        }
        throw this.createError(
          `Failed to verify Qdrant collection: ${collectionResponse.statusText}`,
          'CONNECTION_FAILED'
        );
      }

      this._connected = true;
      this.log('Connected to Qdrant successfully');
    } catch (error) {
      if (error instanceof Error && error.name === 'VectorStoreError') {
        throw error;
      }
      throw this.createError(
        `Failed to connect to Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.log('Disconnected from Qdrant');
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = performance.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.url}/healthz`,
        {
          method: 'GET',
          headers: this.headers,
        },
        5000
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

  async upsert(records: VectorRecord[], _namespace?: string): Promise<UpsertResult> {
    this.ensureConnected();

    const batchSize = 100;
    const batches = this.batchArray(records, batchSize);
    let totalUpserted = 0;

    for (const batch of batches) {
      await this.withRetry(async () => {
        const points: QdrantPoint[] = batch.map(record => ({
          id: record.id,
          vector: record.vector,
          payload: {
            content: record.content || '',
            ...record.metadata,
          },
        }));

        const response = await this.fetchWithTimeout(
          `${this.url}/collections/${this.collectionName}/points?wait=true`,
          {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify({ points }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw this.createError(`Qdrant upsert failed: ${error}`, 'INTERNAL_ERROR');
        }

        totalUpserted += batch.length;
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
          limit: options.topK || 10,
          with_payload: options.includeMetadata !== false,
          with_vector: options.includeVectors || false,
        };

        if (options.filter && Object.keys(options.filter).length > 0) {
          body.filter = this.convertFilter(options.filter);
        }

        const response = await this.fetchWithTimeout(
          `${this.url}/collections/${this.collectionName}/points/search`,
          {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw this.createError(`Qdrant search failed: ${error}`, 'INTERNAL_ERROR');
        }

        return await response.json() as QdrantSearchResponse;
      }, 'search');
    });

    const results: VectorSearchResult[] = result.result.map(point => ({
      id: String(point.id),
      score: point.score,
      vector: Array.isArray(point.vector) ? point.vector : undefined,
      metadata: point.payload,
      content: point.payload?.content as string | undefined,
    }));

    this.log(`Search returned ${results.length} results in ${latencyMs}ms`);

    return {
      results,
      latencyMs,
    };
  }

  async delete(ids: string[], _namespace?: string): Promise<DeleteResult> {
    this.ensureConnected();

    await this.withRetry(async () => {
      const response = await this.fetchWithTimeout(
        `${this.url}/collections/${this.collectionName}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            points: ids,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Qdrant delete failed: ${error}`, 'INTERNAL_ERROR');
      }
    }, 'delete');

    this.log(`Deleted ${ids.length} vectors`);
    return { deletedCount: ids.length };
  }

  async deleteByFilter(filter: VectorFilter, _namespace?: string): Promise<DeleteResult> {
    this.ensureConnected();

    await this.withRetry(async () => {
      const response = await this.fetchWithTimeout(
        `${this.url}/collections/${this.collectionName}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            filter: this.convertFilter(filter),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Qdrant delete by filter failed: ${error}`, 'INTERNAL_ERROR');
      }
    }, 'deleteByFilter');

    return { deletedCount: -1 }; // Qdrant doesn't return count
  }

  async fetch(ids: string[], _namespace?: string): Promise<FetchResult> {
    this.ensureConnected();

    const result = await this.withRetry(async () => {
      const response = await this.fetchWithTimeout(
        `${this.url}/collections/${this.collectionName}/points`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            ids,
            with_payload: true,
            with_vector: true,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Qdrant fetch failed: ${error}`, 'INTERNAL_ERROR');
      }

      return await response.json() as QdrantGetResponse;
    }, 'fetch');

    const records: VectorRecord[] = result.result.points.map(point => ({
      id: String(point.id),
      vector: Array.isArray(point.vector) ? point.vector : [],
      metadata: point.payload,
      content: point.payload?.content as string | undefined,
    }));

    const foundIds = new Set(records.map(r => r.id));
    const missingIds = ids.filter(id => !foundIds.has(id));

    return {
      records,
      missingIds: missingIds.length > 0 ? missingIds : undefined,
    };
  }

  async stats(): Promise<StoreStats> {
    this.ensureConnected();

    const result = await this.withRetry(async () => {
      const response = await this.fetchWithTimeout(
        `${this.url}/collections/${this.collectionName}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Qdrant stats failed: ${error}`, 'INTERNAL_ERROR');
      }

      return await response.json() as QdrantCollectionInfo;
    }, 'stats');

    return {
      totalVectors: result.result.vectors_count,
      dimension: result.result.config.params.vectors.size,
      raw: result.result as unknown as Record<string, unknown>,
    };
  }

  // ============================================================================
  // Filter Conversion
  // ============================================================================

  /**
   * Convert generic filter to Qdrant filter format
   */
  private convertFilter(filter: VectorFilter): QdrantFilter {
    const qdrantFilter: QdrantFilter = {};

    const mustConditions: QdrantCondition[] = [];
    const shouldConditions: QdrantCondition[] = [];
    const mustNotConditions: QdrantCondition[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and') {
        for (const subFilter of value as VectorFilter[]) {
          const converted = this.convertFilter(subFilter);
          if (converted.must) {
            mustConditions.push(...converted.must);
          }
        }
      } else if (key === '$or') {
        for (const subFilter of value as VectorFilter[]) {
          const converted = this.convertFilter(subFilter);
          if (converted.must) {
            shouldConditions.push({ filter: converted });
          }
        }
      } else if (key === '$not') {
        const notFilter = this.convertFilter(value as VectorFilter);
        if (notFilter.must) {
          mustNotConditions.push(...notFilter.must);
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle field operators
        const conditions = this.convertFieldOperators(key, value as Record<string, unknown>);
        mustConditions.push(...conditions.must);
        if (conditions.mustNot.length > 0) {
          mustNotConditions.push(...conditions.mustNot);
        }
      } else {
        // Direct equality
        mustConditions.push({
          key,
          match: { value },
        });
      }
    }

    if (mustConditions.length > 0) {
      qdrantFilter.must = mustConditions;
    }
    if (shouldConditions.length > 0) {
      qdrantFilter.should = shouldConditions;
    }
    if (mustNotConditions.length > 0) {
      qdrantFilter.must_not = mustNotConditions;
    }

    return qdrantFilter;
  }

  private convertFieldOperators(
    field: string,
    operators: Record<string, unknown>
  ): { must: QdrantCondition[]; mustNot: QdrantCondition[] } {
    const must: QdrantCondition[] = [];
    const mustNot: QdrantCondition[] = [];

    for (const [op, value] of Object.entries(operators)) {
      switch (op) {
        case '$eq':
          must.push({ key: field, match: { value } });
          break;
        case '$ne':
          mustNot.push({ key: field, match: { value } });
          break;
        case '$gt':
          must.push({ key: field, range: { gt: value as number } });
          break;
        case '$gte':
          must.push({ key: field, range: { gte: value as number } });
          break;
        case '$lt':
          must.push({ key: field, range: { lt: value as number } });
          break;
        case '$lte':
          must.push({ key: field, range: { lte: value as number } });
          break;
        case '$in':
          must.push({ key: field, match: { any: value as unknown[] } });
          break;
        case '$nin':
          mustNot.push({ key: field, match: { any: value as unknown[] } });
          break;
        case '$exists':
          if (value) {
            mustNot.push({ is_null: { key: field } });
          } else {
            must.push({ is_null: { key: field } });
          }
          break;
      }
    }

    return { must, mustNot };
  }
}
