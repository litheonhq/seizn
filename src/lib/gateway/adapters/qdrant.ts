/**
 * Qdrant Adapter
 *
 * Vector database adapter for Qdrant.
 * Supports search, upsert, and delete operations via REST API.
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

// Qdrant API response types
interface QdrantPoint {
  id: string | number;
  score: number;
  vector?: number[];
  payload?: Record<string, unknown>;
}

interface QdrantSearchResponse {
  result: QdrantPoint[];
  status: string;
  time: number;
}

interface QdrantUpsertResponse {
  result: {
    operation_id: number;
    status: string;
  };
  status: string;
  time: number;
}

interface QdrantDeleteResponse {
  result: {
    operation_id: number;
    status: string;
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

export class QdrantAdapter extends BaseVectorAdapter {
  readonly provider: VectorDBProvider = 'qdrant';

  private host: string;
  private apiKey?: string;
  private collectionName: string;
  private scheme: 'http' | 'https';

  constructor(config: GatewayConfig) {
    super(config);

    if (!config.host) {
      throw new AdapterError('CONFIG_ERROR', 'Qdrant host is required', false);
    }

    if (!config.collectionName) {
      throw new AdapterError('CONFIG_ERROR', 'Qdrant collectionName is required', false);
    }

    this.host = config.host;
    this.apiKey = config.apiKey;
    this.collectionName = config.collectionName;
    this.scheme = config.scheme || 'https';
  }

  private get baseUrl(): string {
    return `${this.scheme}://${this.host}`;
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

  async connect(): Promise<void> {
    try {
      this.log('info', 'Connecting to Qdrant', {
        host: this.host,
        collection: this.collectionName,
      });

      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new AdapterError(
          'CONNECTION_FAILED',
          `Qdrant connection failed: ${response.status}`,
          response.status >= 500
        );
      }

      this.connected = true;
      this.log('info', 'Connected to Qdrant successfully');
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(
        'CONNECTION_FAILED',
        `Failed to connect to Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.log('info', 'Disconnected from Qdrant');
  }

  async search(payload: SearchPayload): Promise<SearchResponseData> {
    this.validateConnected();

    if (!payload.embedding || payload.embedding.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'Qdrant search requires embedding vector',
        false
      );
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      const body: Record<string, unknown> = {
        vector: payload.embedding,
        limit: payload.topK || 10,
        with_payload: payload.includeMetadata !== false,
        with_vectors: payload.includeValues || false,
      };

      if (payload.filter) {
        body.filter = this.buildFilter(payload.filter);
      }

      const response = await fetch(
        `${this.baseUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'QUERY_FAILED',
          `Qdrant query failed: ${errorText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return (await response.json()) as QdrantSearchResponse;
    });

    this.log('debug', 'Qdrant search completed', {
      latencyMs,
      resultCount: result.result.length,
    });

    const results: SearchResultItem[] = result.result.map((point) => ({
      id: String(point.id),
      score: point.score,
      values: point.vector,
      metadata: point.payload,
      content: (point.payload?.content as string) || (point.payload?.text as string),
    }));

    return {
      type: 'search',
      results,
      count: results.length,
    };
  }

  private buildFilter(filter: Record<string, unknown>): Record<string, unknown> {
    // Convert simple key-value filter to Qdrant filter format
    const must: Array<Record<string, unknown>> = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'string') {
        must.push({
          key,
          match: { value },
        });
      } else if (typeof value === 'number') {
        must.push({
          key,
          match: { value },
        });
      } else if (typeof value === 'boolean') {
        must.push({
          key,
          match: { value },
        });
      } else if (Array.isArray(value)) {
        must.push({
          key,
          match: { any: value },
        });
      }
    }

    return { must };
  }

  async upsert(payload: UpsertPayload): Promise<UpsertResponseData> {
    this.validateConnected();

    if (!payload.vectors || payload.vectors.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'Qdrant upsert requires vectors array',
        false
      );
    }

    const chunkSize = 100;
    let totalUpserted = 0;

    // Process in batches
    for (let i = 0; i < payload.vectors.length; i += chunkSize) {
      const chunk = payload.vectors.slice(i, i + chunkSize);

      const { result } = await this.measureLatency(async () => {
        const points = chunk.map((vec) => ({
          id: vec.id,
          vector: vec.values,
          payload: {
            content: vec.content || '',
            ...vec.metadata,
          },
        }));

        const response = await fetch(
          `${this.baseUrl}/collections/${this.collectionName}/points?wait=true`,
          {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify({ points }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new AdapterError(
            'UPSERT_FAILED',
            `Qdrant upsert failed: ${errorText}`,
            response.status >= 500 || response.status === 429
          );
        }

        return (await response.json()) as QdrantUpsertResponse;
      });

      if (result.status === 'ok') {
        totalUpserted += chunk.length;
      }
    }

    this.log('info', 'Qdrant upsert completed', { totalUpserted });

    return {
      type: 'upsert',
      upsertedCount: totalUpserted,
    };
  }

  async delete(payload: DeletePayload): Promise<DeleteResponseData> {
    this.validateConnected();

    if (!payload.ids || payload.ids.length === 0) {
      if (!payload.deleteAll && !payload.filter) {
        throw new AdapterError(
          'INVALID_PAYLOAD',
          'Qdrant delete requires ids, deleteAll, or filter',
          false
        );
      }
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      let body: Record<string, unknown>;

      if (payload.deleteAll) {
        // Delete all points (clear collection)
        body = {
          filter: {
            must: [{ has_id: [] }], // Empty array to match all
          },
        };

        // Actually, Qdrant doesn't have a simple "delete all"
        // We need to use a filter that matches everything or recreate collection
        // For safety, we'll require explicit IDs or filter
        throw new AdapterError(
          'NOT_SUPPORTED',
          'Qdrant deleteAll requires explicit filter. Use filter parameter instead.',
          false
        );
      } else if (payload.filter) {
        body = {
          filter: this.buildFilter(payload.filter),
        };
      } else {
        body = {
          points: payload.ids,
        };
      }

      const response = await fetch(
        `${this.baseUrl}/collections/${this.collectionName}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'DELETE_FAILED',
          `Qdrant delete failed: ${errorText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return (await response.json()) as QdrantDeleteResponse;
    });

    const deletedCount = payload.ids?.length || -1;

    this.log('info', 'Qdrant delete completed', {
      latencyMs,
      deletedCount,
      status: result.status,
    });

    return {
      type: 'delete',
      deletedCount,
    };
  }

  async health(): Promise<HealthResponseData> {
    const start = performance.now();

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
        headers: this.headers,
      });

      const latencyMs = Math.round(performance.now() - start);

      if (!response.ok) {
        return {
          type: 'health',
          healthy: false,
          provider: 'qdrant',
          details: {
            latencyMs,
            error: `HTTP ${response.status}`,
          },
        };
      }

      const info = (await response.json()) as QdrantCollectionInfo;

      return {
        type: 'health',
        healthy: info.result.status === 'green' || info.result.status === 'yellow',
        provider: 'qdrant',
        details: {
          latencyMs,
          collectionName: this.collectionName,
          status: info.result.status,
          vectorsCount: info.result.vectors_count,
          pointsCount: info.result.points_count,
          optimizerStatus: info.result.optimizer_status,
          vectorSize: info.result.config.params.vectors?.size,
          distance: info.result.config.params.vectors?.distance,
        },
      };
    } catch (error) {
      return {
        type: 'health',
        healthy: false,
        provider: 'qdrant',
        details: {
          latencyMs: Math.round(performance.now() - start),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
