/**
 * Weaviate Adapter
 *
 * Vector database adapter for Weaviate.
 * Supports search, upsert, and delete operations via GraphQL and REST APIs.
 */

import { BaseVectorAdapter, AdapterError } from './base';
import type {
  VectorDBProvider,
  GatewayConfig,
  SearchPayload,
  UpsertPayload,
  DeletePayload,
  SearchResponseData,
  UpsertResponseData,
  DeleteResponseData,
  HealthResponseData,
  SearchResultItem,
} from '../types';

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

interface WeaviateGetResponse {
  data: {
    Get: {
      [className: string]: WeaviateObject[];
    };
  };
  errors?: Array<{ message: string }>;
}

interface WeaviateBatchResponse {
  results: Array<{
    id: string;
    status?: string;
    errors?: Array<{ message: string }>;
  }>;
}

export class WeaviateAdapter extends BaseVectorAdapter {
  readonly provider: VectorDBProvider = 'weaviate';

  private host: string;
  private apiKey?: string;
  private scheme: 'http' | 'https';
  private className: string;
  private tenant?: string;

  constructor(config: GatewayConfig) {
    super(config);

    if (!config.host) {
      throw new AdapterError('CONFIG_ERROR', 'Weaviate host is required', false);
    }

    if (!config.className) {
      throw new AdapterError('CONFIG_ERROR', 'Weaviate className is required', false);
    }

    this.host = config.host;
    this.apiKey = config.apiKey;
    this.scheme = config.scheme || 'https';
    this.className = config.className;
    this.tenant = config.namespace; // Weaviate uses tenant instead of namespace
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

  async connect(): Promise<void> {
    try {
      this.log('info', 'Connecting to Weaviate', { host: this.host });

      const response = await fetch(`${this.baseUrl}/v1/.well-known/ready`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new AdapterError(
          'CONNECTION_FAILED',
          `Weaviate connection failed: ${response.status}`,
          response.status >= 500
        );
      }

      this.connected = true;
      this.log('info', 'Connected to Weaviate successfully');
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(
        'CONNECTION_FAILED',
        `Failed to connect to Weaviate: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.log('info', 'Disconnected from Weaviate');
  }

  async search(payload: SearchPayload): Promise<SearchResponseData> {
    this.validateConnected();

    const { result, latencyMs } = await this.measureLatency(async () => {
      const limit = payload.topK || 10;
      const additionalFields = ['certainty', 'distance', 'id'];

      // Build search type: nearVector or nearText
      let nearClause = '';
      if (payload.embedding && payload.embedding.length > 0) {
        nearClause = `nearVector: { vector: [${payload.embedding.join(',')}] }`;
      } else if (payload.query) {
        nearClause = `nearText: { concepts: ["${payload.query.replace(/"/g, '\\"')}"] }`;
      } else {
        throw new AdapterError(
          'INVALID_PAYLOAD',
          'Weaviate search requires embedding or query',
          false
        );
      }

      // Build where filter
      let whereClause = '';
      if (payload.filter && Object.keys(payload.filter).length > 0) {
        whereClause = `, where: ${this.buildWhereFilter(payload.filter)}`;
      }

      // Build tenant clause
      let tenantClause = '';
      if (this.tenant) {
        tenantClause = `, tenant: "${this.tenant}"`;
      }

      const query = `
        {
          Get {
            ${this.className}(
              ${nearClause}
              limit: ${limit}
              ${whereClause}
              ${tenantClause}
            ) {
              _additional {
                ${additionalFields.join('\n                ')}
              }
              content
              text
              title
            }
          }
        }
      `;

      const response = await fetch(`${this.baseUrl}/v1/graphql`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'QUERY_FAILED',
          `Weaviate query failed: ${errorText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return (await response.json()) as WeaviateGetResponse;
    });

    if (result.errors && result.errors.length > 0) {
      throw new AdapterError(
        'QUERY_FAILED',
        `Weaviate GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`,
        false
      );
    }

    const objects = result.data?.Get?.[this.className] || [];

    this.log('debug', 'Weaviate search completed', {
      latencyMs,
      resultCount: objects.length,
    });

    const results: SearchResultItem[] = objects.map((obj) => ({
      id: obj._additional?.id || obj.id || '',
      score: obj._additional?.certainty || (1 - (obj._additional?.distance || 0)),
      values: obj.vector,
      metadata: obj.properties,
      content: (obj.properties?.content as string) || (obj.properties?.text as string) || '',
    }));

    return {
      type: 'search',
      results,
      count: results.length,
    };
  }

  private buildWhereFilter(filter: Record<string, unknown>): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'string') {
        conditions.push(`{ path: ["${key}"], operator: Equal, valueText: "${value}" }`);
      } else if (typeof value === 'number') {
        conditions.push(`{ path: ["${key}"], operator: Equal, valueNumber: ${value} }`);
      } else if (typeof value === 'boolean') {
        conditions.push(`{ path: ["${key}"], operator: Equal, valueBoolean: ${value} }`);
      }
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return `{ operator: And, operands: [${conditions.join(', ')}] }`;
  }

  async upsert(payload: UpsertPayload): Promise<UpsertResponseData> {
    this.validateConnected();

    if (!payload.vectors || payload.vectors.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'Weaviate upsert requires vectors array',
        false
      );
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      const objects = payload.vectors.map((vec) => ({
        class: this.className,
        id: vec.id,
        properties: {
          content: vec.content || '',
          ...vec.metadata,
        },
        vector: vec.values,
        tenant: this.tenant,
      }));

      const response = await fetch(`${this.baseUrl}/v1/batch/objects`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ objects }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'UPSERT_FAILED',
          `Weaviate upsert failed: ${errorText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return (await response.json()) as WeaviateBatchResponse;
    });

    const successCount = result.results?.filter((r) => !r.errors || r.errors.length === 0).length || 0;

    this.log('info', 'Weaviate upsert completed', {
      latencyMs,
      upsertedCount: successCount,
    });

    return {
      type: 'upsert',
      upsertedCount: successCount,
    };
  }

  async delete(payload: DeletePayload): Promise<DeleteResponseData> {
    this.validateConnected();

    if (!payload.ids || payload.ids.length === 0) {
      if (!payload.deleteAll && !payload.filter) {
        throw new AdapterError(
          'INVALID_PAYLOAD',
          'Weaviate delete requires ids, deleteAll, or filter',
          false
        );
      }
    }

    let deletedCount = 0;

    if (payload.deleteAll) {
      // Delete all objects in class (requires special handling)
      const { result } = await this.measureLatency(async () => {
        const response = await fetch(
          `${this.baseUrl}/v1/batch/objects?class=${this.className}`,
          {
            method: 'DELETE',
            headers: this.headers,
            body: JSON.stringify({
              match: {
                class: this.className,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new AdapterError(
            'DELETE_FAILED',
            `Weaviate batch delete failed: ${errorText}`,
            response.status >= 500
          );
        }

        return response.json();
      });

      deletedCount = (result as { results?: { successful?: number } }).results?.successful || -1;
    } else if (payload.ids) {
      // Delete individual objects
      for (const id of payload.ids) {
        try {
          const response = await fetch(
            `${this.baseUrl}/v1/objects/${this.className}/${id}`,
            {
              method: 'DELETE',
              headers: this.headers,
            }
          );

          if (response.ok || response.status === 204) {
            deletedCount++;
          }
        } catch {
          // Continue on individual delete failures
          this.log('warn', `Failed to delete object ${id}`);
        }
      }
    }

    this.log('info', 'Weaviate delete completed', { deletedCount });

    return {
      type: 'delete',
      deletedCount,
    };
  }

  async health(): Promise<HealthResponseData> {
    const start = performance.now();

    try {
      const [readyResponse, nodesResponse] = await Promise.all([
        fetch(`${this.baseUrl}/v1/.well-known/ready`, { headers: this.headers }),
        fetch(`${this.baseUrl}/v1/nodes`, { headers: this.headers }).catch(() => null),
      ]);

      const latencyMs = Math.round(performance.now() - start);

      if (!readyResponse.ok) {
        return {
          type: 'health',
          healthy: false,
          provider: 'weaviate',
          details: {
            latencyMs,
            error: `HTTP ${readyResponse.status}`,
          },
        };
      }

      let nodeInfo = {};
      if (nodesResponse && nodesResponse.ok) {
        nodeInfo = await nodesResponse.json();
      }

      return {
        type: 'health',
        healthy: true,
        provider: 'weaviate',
        details: {
          latencyMs,
          className: this.className,
          nodes: nodeInfo,
        },
      };
    } catch (error) {
      return {
        type: 'health',
        healthy: false,
        provider: 'weaviate',
        details: {
          latencyMs: Math.round(performance.now() - start),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
