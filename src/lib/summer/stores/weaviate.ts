/**
 * Weaviate Vector Store Implementation
 *
 * BYO connector for Weaviate vector database.
 * Supports both self-hosted and Weaviate Cloud instances.
 */

import { BaseVectorStore } from './base';
import type {
  WeaviateStoreConfig,
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

// Weaviate API response types
interface WeaviateObject {
  id: string;
  class: string;
  properties: Record<string, unknown>;
  vector?: number[];
  _additional?: {
    id?: string;
    certainty?: number;
    distance?: number;
    score?: number;
  };
}

interface WeaviateGraphQLResponse {
  data: {
    Get?: {
      [className: string]: WeaviateObject[];
    };
    Aggregate?: {
      [className: string]: Array<{
        meta: {
          count: number;
        };
      }>;
    };
  };
  errors?: Array<{
    message: string;
    path: string[];
  }>;
}

interface WeaviateBatchResponse {
  id: string;
  result?: {
    status: string;
    errors?: Array<{ message: string }>;
  };
}

export class WeaviateStore extends BaseVectorStore {
  readonly provider = 'weaviate' as const;

  private host: string;
  private scheme: 'http' | 'https';
  private apiKey?: string;
  private className: string;
  private tenant?: string;

  constructor(config: WeaviateStoreConfig) {
    super(config);
    this.host = config.host;
    this.scheme = config.scheme || 'https';
    this.apiKey = config.apiKey;
    this.className = config.className;
    this.tenant = config.tenant;
  }

  private get baseUrl(): string {
    return `${this.scheme}://${this.host}`;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  async connect(): Promise<void> {
    this.log('Connecting to Weaviate...');

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/.well-known/ready`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw this.createError(
            'Invalid Weaviate API key',
            'AUTHENTICATION_FAILED'
          );
        }
        throw this.createError(
          `Weaviate not ready: ${response.statusText}`,
          'CONNECTION_FAILED'
        );
      }

      // Verify class exists
      const schemaResponse = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/schema/${this.className}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (!schemaResponse.ok && schemaResponse.status !== 404) {
        const error = await schemaResponse.text();
        throw this.createError(
          `Failed to verify Weaviate class: ${error}`,
          'CONNECTION_FAILED'
        );
      }

      this._connected = true;
      this.log('Connected to Weaviate successfully');
    } catch (error) {
      if (error instanceof Error && error.name === 'VectorStoreError') {
        throw error;
      }
      throw this.createError(
        `Failed to connect to Weaviate: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.log('Disconnected from Weaviate');
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = performance.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/.well-known/ready`,
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
        const objects = batch.map(record => ({
          class: this.className,
          id: record.id,
          properties: {
            content: record.content || '',
            ...record.metadata,
          },
          vector: record.vector,
          tenant: this.tenant,
        }));

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/batch/objects`,
          {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ objects }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw this.createError(`Weaviate batch upsert failed: ${error}`, 'INTERNAL_ERROR');
        }

        const results = await response.json() as WeaviateBatchResponse[];
        const successCount = results.filter(r => !r.result?.errors?.length).length;
        totalUpserted += successCount;
      }, 'upsert');
    }

    this.log(`Upserted ${totalUpserted} vectors`);
    return { upsertedCount: totalUpserted };
  }

  async search(options: VectorSearchOptions): Promise<SearchResponse> {
    this.ensureConnected();

    const { result, latencyMs } = await this.measureLatency(async () => {
      return this.withRetry(async () => {
        const limit = options.topK || 10;
        const additionalFields = ['id', 'certainty', 'distance'];
        if (options.includeVectors) {
          additionalFields.push('vector');
        }

        let nearVector = '';
        nearVector = `nearVector: { vector: [${options.vector.join(',')}] }`;

        let where = '';
        if (options.filter && Object.keys(options.filter).length > 0) {
          where = `, where: ${this.buildWhereClause(options.filter)}`;
        }

        let tenantClause = '';
        if (this.tenant) {
          tenantClause = `, tenant: "${this.tenant}"`;
        }

        // Build properties to fetch
        const properties = options.includeMetadata !== false
          ? ['content', 'metadata']
          : [];

        const query = `
          {
            Get {
              ${this.className}(
                ${nearVector}
                limit: ${limit}
                ${where}
                ${tenantClause}
              ) {
                _additional {
                  ${additionalFields.join('\n                  ')}
                }
                ${properties.length > 0 ? properties.join('\n                ') : ''}
              }
            }
          }
        `;

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/graphql`,
          {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ query }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw this.createError(`Weaviate query failed: ${error}`, 'INTERNAL_ERROR');
        }

        const data = await response.json() as WeaviateGraphQLResponse;

        if (data.errors?.length) {
          throw this.createError(
            `Weaviate GraphQL error: ${data.errors[0].message}`,
            'INTERNAL_ERROR'
          );
        }

        return data;
      }, 'search');
    });

    const objects = result.data?.Get?.[this.className] || [];

    const results: VectorSearchResult[] = objects.map(obj => ({
      id: obj._additional?.id || obj.id,
      score: obj._additional?.certainty ?? (1 - (obj._additional?.distance || 0)),
      vector: obj.vector,
      metadata: obj.properties,
      content: obj.properties?.content as string | undefined,
    }));

    this.log(`Search returned ${results.length} results in ${latencyMs}ms`);

    return {
      results,
      latencyMs,
    };
  }

  async delete(ids: string[], _namespace?: string): Promise<DeleteResult> {
    this.ensureConnected();

    let deletedCount = 0;

    for (const id of ids) {
      try {
        await this.withRetry(async () => {
          let url = `${this.baseUrl}/v1/objects/${this.className}/${id}`;
          if (this.tenant) {
            url += `?tenant=${this.tenant}`;
          }

          const response = await this.fetchWithTimeout(url, {
            method: 'DELETE',
            headers: this.headers,
          });

          if (response.ok || response.status === 204) {
            deletedCount++;
          } else if (response.status !== 404) {
            const error = await response.text();
            throw this.createError(`Weaviate delete failed: ${error}`, 'INTERNAL_ERROR');
          }
        }, `delete:${id}`);
      } catch {
        // Log but continue with other deletes
        this.log(`Failed to delete ${id}`);
      }
    }

    this.log(`Deleted ${deletedCount} vectors`);
    return { deletedCount };
  }

  async deleteByFilter(filter: VectorFilter, _namespace?: string): Promise<DeleteResult> {
    this.ensureConnected();

    await this.withRetry(async () => {
      const whereClause = this.buildWhereClause(filter);

      const url = `${this.baseUrl}/v1/batch/objects`;
      const body: Record<string, unknown> = {
        match: {
          class: this.className,
          where: JSON.parse(whereClause.replace(/'/g, '"')),
        },
      };

      if (this.tenant) {
        body.tenant = this.tenant;
      }

      const response = await this.fetchWithTimeout(url, {
        method: 'DELETE',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Weaviate batch delete failed: ${error}`, 'INTERNAL_ERROR');
      }
    }, 'deleteByFilter');

    return { deletedCount: -1 }; // Weaviate doesn't return count
  }

  async fetch(ids: string[], _namespace?: string): Promise<FetchResult> {
    this.ensureConnected();

    const records: VectorRecord[] = [];
    const missingIds: string[] = [];

    for (const id of ids) {
      try {
        let url = `${this.baseUrl}/v1/objects/${this.className}/${id}`;
        if (this.tenant) {
          url += `?tenant=${this.tenant}`;
        }

        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.headers,
        });

        if (response.ok) {
          const obj = await response.json() as WeaviateObject;
          records.push({
            id: obj.id,
            vector: obj.vector || [],
            metadata: obj.properties,
            content: obj.properties?.content as string | undefined,
          });
        } else if (response.status === 404) {
          missingIds.push(id);
        }
      } catch {
        missingIds.push(id);
      }
    }

    return {
      records,
      missingIds: missingIds.length > 0 ? missingIds : undefined,
    };
  }

  async stats(): Promise<StoreStats> {
    this.ensureConnected();

    const result = await this.withRetry(async () => {
      const query = `
        {
          Aggregate {
            ${this.className} {
              meta {
                count
              }
            }
          }
        }
      `;

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/graphql`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ query }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw this.createError(`Weaviate stats query failed: ${error}`, 'INTERNAL_ERROR');
      }

      return await response.json() as WeaviateGraphQLResponse;
    }, 'stats');

    const aggregate = result.data?.Aggregate?.[this.className]?.[0];
    const count = aggregate?.meta?.count || 0;

    return {
      totalVectors: count,
      raw: result.data as unknown as Record<string, unknown>,
    };
  }

  // ============================================================================
  // Filter Conversion
  // ============================================================================

  /**
   * Build Weaviate GraphQL where clause from generic filter
   */
  private buildWhereClause(filter: VectorFilter): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and') {
        const andConditions = (value as VectorFilter[]).map(f => this.buildWhereClause(f));
        conditions.push(`{ operator: And, operands: [${andConditions.join(', ')}] }`);
      } else if (key === '$or') {
        const orConditions = (value as VectorFilter[]).map(f => this.buildWhereClause(f));
        conditions.push(`{ operator: Or, operands: [${orConditions.join(', ')}] }`);
      } else if (key === '$not') {
        const notCondition = this.buildWhereClause(value as VectorFilter);
        conditions.push(`{ operator: Not, operands: [${notCondition}] }`);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle field operators
        conditions.push(this.buildFieldCondition(key, value as Record<string, unknown>));
      } else {
        // Direct equality
        conditions.push(this.buildEqualityCondition(key, value));
      }
    }

    if (conditions.length === 0) {
      return '{}';
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return `{ operator: And, operands: [${conditions.join(', ')}] }`;
  }

  private buildFieldCondition(field: string, filter: Record<string, unknown>): string {
    const conditions: string[] = [];

    for (const [op, value] of Object.entries(filter)) {
      let operator: string;
      let valueKey: string;
      let valueStr: string;

      switch (op) {
        case '$eq':
          operator = 'Equal';
          break;
        case '$ne':
          operator = 'NotEqual';
          break;
        case '$gt':
          operator = 'GreaterThan';
          break;
        case '$gte':
          operator = 'GreaterThanEqual';
          break;
        case '$lt':
          operator = 'LessThan';
          break;
        case '$lte':
          operator = 'LessThanEqual';
          break;
        case '$contains':
          operator = 'ContainsAny';
          break;
        default:
          continue;
      }

      // Determine value type
      if (typeof value === 'string') {
        valueKey = 'valueText';
        valueStr = `"${value}"`;
      } else if (typeof value === 'number') {
        valueKey = Number.isInteger(value) ? 'valueInt' : 'valueNumber';
        valueStr = String(value);
      } else if (typeof value === 'boolean') {
        valueKey = 'valueBoolean';
        valueStr = String(value);
      } else if (Array.isArray(value)) {
        valueKey = 'valueText';
        valueStr = `[${value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]`;
      } else {
        continue;
      }

      conditions.push(`{ path: ["${field}"], operator: ${operator}, ${valueKey}: ${valueStr} }`);
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return `{ operator: And, operands: [${conditions.join(', ')}] }`;
  }

  private buildEqualityCondition(field: string, value: unknown): string {
    let valueKey: string;
    let valueStr: string;

    if (typeof value === 'string') {
      valueKey = 'valueText';
      valueStr = `"${value}"`;
    } else if (typeof value === 'number') {
      valueKey = Number.isInteger(value) ? 'valueInt' : 'valueNumber';
      valueStr = String(value);
    } else if (typeof value === 'boolean') {
      valueKey = 'valueBoolean';
      valueStr = String(value);
    } else {
      valueKey = 'valueText';
      valueStr = `"${String(value)}"`;
    }

    return `{ path: ["${field}"], operator: Equal, ${valueKey}: ${valueStr} }`;
  }
}
