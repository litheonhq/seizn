/**
 * Weaviate Connector
 *
 * Connect to Weaviate vector database for federated search
 */

import { BaseConnector } from './base';
import type {
  WeaviateConfig,
  VectorDocument,
  SearchOptions,
  SearchResult,
} from './types';

interface WeaviateObject {
  id: string;
  class: string;
  properties: Record<string, unknown>;
  vector?: number[];
  _additional?: {
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
}

export class WeaviateConnector extends BaseConnector {
  private host: string;
  private apiKey?: string;
  private scheme: 'http' | 'https';
  private className: string;
  private tenant?: string;

  constructor(config: WeaviateConfig) {
    super(config);
    this.host = config.config.host;
    this.apiKey = config.config.apiKey;
    this.scheme = config.config.scheme || 'https';
    this.className = config.config.className;
    this.tenant = config.config.tenant;
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
      const response = await fetch(`${this.baseUrl}/v1/.well-known/ready`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Weaviate connection failed: ${response.statusText}`);
      }

      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Weaviate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    this.validateConnected();

    const { latency_ms, result } = await this.measureLatency(async () => {
      // Build GraphQL query
      const limit = options.topK || 10;
      const additionalFields = ['certainty', 'distance', 'id'];

      let nearVector = '';
      if (options.embedding) {
        nearVector = `nearVector: { vector: [${options.embedding.join(',')}] }`;
      } else if (options.query) {
        // Use nearText if embedding not provided
        nearVector = `nearText: { concepts: ["${options.query.replace(/"/g, '\\"')}"] }`;
      }

      let where = '';
      if (options.filter && Object.keys(options.filter).length > 0) {
        where = `, where: ${this.buildWhereFilter(options.filter)}`;
      }

      let tenant = '';
      if (this.tenant) {
        tenant = `, tenant: "${this.tenant}"`;
      }

      const query = `
        {
          Get {
            ${this.className}(
              ${nearVector}
              limit: ${limit}
              ${where}
              ${tenant}
            ) {
              _additional {
                ${additionalFields.join('\n                ')}
              }
              ... on ${this.className} {
                content
                title
                metadata
              }
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
        const error = await response.text();
        throw new Error(`Weaviate query failed: ${error}`);
      }

      return (await response.json()) as WeaviateGetResponse;
    });

    const objects = result.data?.Get?.[this.className] || [];

    const documents: VectorDocument[] = objects.map((obj) => ({
      id: obj._additional?.id || obj.id || '',
      content: (obj.properties?.content as string) || '',
      metadata: {
        ...obj.properties,
        certainty: obj._additional?.certainty,
        distance: obj._additional?.distance,
      },
      score: obj._additional?.certainty || 1 - (obj._additional?.distance || 0),
      source: this.name,
    }));

    return {
      documents,
      latency_ms,
      source: this.name,
    };
  }

  private buildWhereFilter(filter: Record<string, unknown>): string {
    // Convert simple filter to Weaviate where clause
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

  async upsert(documents: VectorDocument[]): Promise<{ count: number }> {
    this.validateConnected();

    // Batch upsert
    const objects = documents.map((doc) => ({
      class: this.className,
      id: doc.id,
      properties: {
        content: doc.content,
        ...doc.metadata,
      },
      vector: doc.metadata.embedding as number[] | undefined,
      tenant: this.tenant,
    }));

    const response = await fetch(`${this.baseUrl}/v1/batch/objects`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ objects }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Weaviate upsert failed: ${error}`);
    }

    const result = (await response.json()) as { results: unknown[] };
    return { count: result.results?.length || documents.length };
  }

  async delete(ids: string[]): Promise<{ count: number }> {
    this.validateConnected();

    let deletedCount = 0;

    for (const id of ids) {
      const response = await fetch(`${this.baseUrl}/v1/objects/${this.className}/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });

      if (response.ok) {
        deletedCount++;
      }
    }

    return { count: deletedCount };
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms: number }> {
    const start = performance.now();

    try {
      const response = await fetch(`${this.baseUrl}/v1/.well-known/ready`, {
        headers: this.headers,
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
