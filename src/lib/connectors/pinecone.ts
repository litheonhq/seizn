/**
 * Pinecone Connector
 *
 * Connect to Pinecone vector database for federated search
 */

import { BaseConnector } from './base';
import type {
  PineconeConfig,
  VectorDocument,
  SearchOptions,
  SearchResult,
} from './types';

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

export class PineconeConnector extends BaseConnector {
  private apiKey: string;
  private host: string;
  private indexName: string;
  private namespace: string;

  constructor(config: PineconeConfig) {
    super(config);
    this.apiKey = config.config.apiKey;
    this.indexName = config.config.indexName;
    this.namespace = config.config.namespace || '';

    // Construct host from environment and index name
    // Pinecone v3+ uses direct host URLs
    this.host = config.config.environment.includes('.')
      ? config.config.environment // Already a full host
      : `${config.config.indexName}-${config.config.environment}.svc.pinecone.io`;
  }

  async connect(): Promise<void> {
    // Verify connection by describing index
    try {
      const response = await fetch(`https://${this.host}/describe_index_stats`, {
        method: 'POST',
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Pinecone connection failed: ${response.statusText}`);
      }

      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    this.validateConnected();

    const { latency_ms, result } = await this.measureLatency(async () => {
      if (!options.embedding) {
        throw new Error('Pinecone requires embedding vector for search');
      }

      const body: Record<string, unknown> = {
        vector: options.embedding,
        topK: options.topK || 10,
        includeMetadata: options.includeMetadata !== false,
        includeValues: options.includeValues || false,
      };

      if (options.namespace || this.namespace) {
        body.namespace = options.namespace || this.namespace;
      }

      if (options.filter) {
        body.filter = options.filter;
      }

      const response = await fetch(`https://${this.host}/query`, {
        method: 'POST',
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pinecone query failed: ${error}`);
      }

      return (await response.json()) as PineconeQueryResponse;
    });

    const documents: VectorDocument[] = result.matches.map((match) => ({
      id: match.id,
      content: (match.metadata?.content as string) || (match.metadata?.text as string) || '',
      metadata: match.metadata || {},
      score: match.score,
      source: this.name,
    }));

    return {
      documents,
      latency_ms,
      source: this.name,
    };
  }

  async upsert(documents: VectorDocument[]): Promise<{ count: number }> {
    this.validateConnected();

    // Batch upsert in chunks of 100
    const chunkSize = 100;
    let totalUpserted = 0;

    for (let i = 0; i < documents.length; i += chunkSize) {
      const chunk = documents.slice(i, i + chunkSize);

      const vectors = chunk.map((doc) => ({
        id: doc.id,
        values: doc.metadata.embedding as number[],
        metadata: {
          ...doc.metadata,
          content: doc.content,
        },
      }));

      const body: Record<string, unknown> = { vectors };
      if (this.namespace) {
        body.namespace = this.namespace;
      }

      const response = await fetch(`https://${this.host}/vectors/upsert`, {
        method: 'POST',
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pinecone upsert failed: ${error}`);
      }

      const result = (await response.json()) as { upsertedCount: number };
      totalUpserted += result.upsertedCount;
    }

    return { count: totalUpserted };
  }

  async delete(ids: string[]): Promise<{ count: number }> {
    this.validateConnected();

    const body: Record<string, unknown> = { ids };
    if (this.namespace) {
      body.namespace = this.namespace;
    }

    const response = await fetch(`https://${this.host}/vectors/delete`, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinecone delete failed: ${error}`);
    }

    return { count: ids.length };
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms: number }> {
    const start = performance.now();

    try {
      const response = await fetch(`https://${this.host}/describe_index_stats`, {
        method: 'POST',
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      return {
        healthy: response.ok,
        latency_ms: Math.round(performance.now() - start),
      };
    } catch {
      return {
        healthy: false,
        latency_ms: Math.round(performance.now() - start),
      };
    }
  }
}
