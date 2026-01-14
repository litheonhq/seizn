/**
 * Pinecone Adapter
 *
 * Vector database adapter for Pinecone.
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

interface PineconeUpsertResponse {
  upsertedCount: number;
}

interface PineconeDescribeResponse {
  namespaces?: Record<string, { vectorCount: number }>;
  dimension?: number;
  indexFullness?: number;
  totalVectorCount?: number;
}

export class PineconeAdapter extends BaseVectorAdapter {
  readonly provider: VectorDBProvider = 'pinecone';

  private apiKey: string;
  private host: string;
  private namespace: string;

  constructor(config: GatewayConfig) {
    super(config);

    if (!config.apiKey) {
      throw new AdapterError('CONFIG_ERROR', 'Pinecone API key is required', false);
    }

    this.apiKey = config.apiKey;
    this.namespace = config.namespace || '';

    // Construct host from environment and index name, or use host directly
    if (config.host) {
      this.host = config.host;
    } else if (config.environment && config.indexName) {
      // Pinecone v3+ uses direct host URLs
      this.host = config.environment.includes('.')
        ? config.environment
        : `${config.indexName}-${config.environment}.svc.pinecone.io`;
    } else {
      throw new AdapterError(
        'CONFIG_ERROR',
        'Either host or environment+indexName required for Pinecone',
        false
      );
    }
  }

  private get headers(): Record<string, string> {
    return {
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async connect(): Promise<void> {
    try {
      this.log('info', 'Connecting to Pinecone', { host: this.host });

      const response = await fetch(`https://${this.host}/describe_index_stats`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'CONNECTION_FAILED',
          `Pinecone connection failed: ${response.status} - ${errorText}`,
          response.status >= 500
        );
      }

      this.connected = true;
      this.log('info', 'Connected to Pinecone successfully');
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(
        'CONNECTION_FAILED',
        `Failed to connect to Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.log('info', 'Disconnected from Pinecone');
  }

  async search(payload: SearchPayload): Promise<SearchResponseData> {
    this.validateConnected();

    if (!payload.embedding || payload.embedding.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'Pinecone search requires embedding vector',
        false
      );
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      const body: Record<string, unknown> = {
        vector: payload.embedding,
        topK: payload.topK || 10,
        includeMetadata: payload.includeMetadata !== false,
        includeValues: payload.includeValues || false,
      };

      const namespace = payload.namespace || this.namespace;
      if (namespace) {
        body.namespace = namespace;
      }

      if (payload.filter) {
        body.filter = payload.filter;
      }

      const response = await fetch(`https://${this.host}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'QUERY_FAILED',
          `Pinecone query failed: ${errorText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return (await response.json()) as PineconeQueryResponse;
    });

    this.log('debug', 'Pinecone search completed', {
      latencyMs,
      matchCount: result.matches.length,
    });

    const results: SearchResultItem[] = result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      values: match.values,
      metadata: match.metadata,
      content: (match.metadata?.content as string) || (match.metadata?.text as string),
    }));

    return {
      type: 'search',
      results,
      count: results.length,
      namespace: result.namespace || this.namespace,
    };
  }

  async upsert(payload: UpsertPayload): Promise<UpsertResponseData> {
    this.validateConnected();

    if (!payload.vectors || payload.vectors.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'Pinecone upsert requires vectors array',
        false
      );
    }

    const chunkSize = 100;
    let totalUpserted = 0;

    // Process in batches of 100 (Pinecone limit)
    for (let i = 0; i < payload.vectors.length; i += chunkSize) {
      const chunk = payload.vectors.slice(i, i + chunkSize);

      const { result } = await this.measureLatency(async () => {
        const vectors = chunk.map((vec) => ({
          id: vec.id,
          values: vec.values,
          metadata: {
            ...vec.metadata,
            ...(vec.content && { content: vec.content }),
          },
        }));

        const body: Record<string, unknown> = { vectors };

        const namespace = payload.namespace || this.namespace;
        if (namespace) {
          body.namespace = namespace;
        }

        const response = await fetch(`https://${this.host}/vectors/upsert`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new AdapterError(
            'UPSERT_FAILED',
            `Pinecone upsert failed: ${errorText}`,
            response.status >= 500 || response.status === 429
          );
        }

        return (await response.json()) as PineconeUpsertResponse;
      });

      totalUpserted += result.upsertedCount;
    }

    this.log('info', 'Pinecone upsert completed', { totalUpserted });

    return {
      type: 'upsert',
      upsertedCount: totalUpserted,
      namespace: payload.namespace || this.namespace,
    };
  }

  async delete(payload: DeletePayload): Promise<DeleteResponseData> {
    this.validateConnected();

    if (!payload.ids || payload.ids.length === 0) {
      if (!payload.deleteAll && !payload.filter) {
        throw new AdapterError(
          'INVALID_PAYLOAD',
          'Pinecone delete requires ids, deleteAll, or filter',
          false
        );
      }
    }

    const { latencyMs } = await this.measureLatency(async () => {
      const body: Record<string, unknown> = {};

      if (payload.deleteAll) {
        body.deleteAll = true;
      } else if (payload.filter) {
        body.filter = payload.filter;
      } else {
        body.ids = payload.ids;
      }

      const namespace = payload.namespace || this.namespace;
      if (namespace) {
        body.namespace = namespace;
      }

      const response = await fetch(`https://${this.host}/vectors/delete`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AdapterError(
          'DELETE_FAILED',
          `Pinecone delete failed: ${errorText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return response.json();
    });

    const deletedCount = payload.deleteAll ? -1 : (payload.ids?.length || 0);

    this.log('info', 'Pinecone delete completed', { latencyMs, deletedCount });

    return {
      type: 'delete',
      deletedCount,
      namespace: payload.namespace || this.namespace,
    };
  }

  async health(): Promise<HealthResponseData> {
    const start = performance.now();

    try {
      const response = await fetch(`https://${this.host}/describe_index_stats`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({}),
      });

      const latencyMs = Math.round(performance.now() - start);

      if (!response.ok) {
        return {
          type: 'health',
          healthy: false,
          provider: 'pinecone',
          details: {
            latencyMs,
            error: `HTTP ${response.status}`,
          },
        };
      }

      const stats = (await response.json()) as PineconeDescribeResponse;

      return {
        type: 'health',
        healthy: true,
        provider: 'pinecone',
        details: {
          latencyMs,
          dimension: stats.dimension,
          totalVectorCount: stats.totalVectorCount,
          indexFullness: stats.indexFullness,
          namespaces: Object.keys(stats.namespaces || {}),
        },
      };
    } catch (error) {
      return {
        type: 'health',
        healthy: false,
        provider: 'pinecone',
        details: {
          latencyMs: Math.round(performance.now() - start),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
