/**
 * pgvector Adapter
 *
 * Vector database adapter for PostgreSQL with pgvector extension.
 * Supports search, upsert, and delete operations via SQL.
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

// SQL row types
interface VectorRow {
  id: string;
  content?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  distance?: number;
  similarity?: number;
}

/**
 * pgvector adapter using direct SQL queries.
 *
 * Note: This adapter expects a PostgreSQL client to be provided
 * or uses the Supabase REST API for serverless environments.
 */
export class PgvectorAdapter extends BaseVectorAdapter {
  readonly provider: VectorDBProvider = 'pgvector';

  private connectionString: string;
  private tableName: string;
  private embeddingColumn: string;
  private contentColumn: string;
  private supabaseUrl?: string;
  private supabaseKey?: string;
  private useSupabase: boolean;

  constructor(config: GatewayConfig) {
    super(config);

    // Support both direct connection and Supabase
    if (config.connectionString) {
      this.connectionString = config.connectionString;
      this.useSupabase = false;
    } else if (config.host && config.apiKey) {
      // Assume Supabase-style REST API
      this.supabaseUrl = config.host.startsWith('http') ? config.host : `https://${config.host}`;
      this.supabaseKey = config.apiKey;
      this.useSupabase = true;
      this.connectionString = ''; // Not used in Supabase mode
    } else {
      throw new AdapterError(
        'CONFIG_ERROR',
        'pgvector requires connectionString or host+apiKey for Supabase',
        false
      );
    }

    this.tableName = config.tableName || 'vectors';
    this.embeddingColumn = 'embedding';
    this.contentColumn = 'content';
  }

  private get headers(): Record<string, string> {
    if (!this.useSupabase || !this.supabaseKey) {
      return {};
    }
    return {
      'Content-Type': 'application/json',
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Prefer': 'return=representation',
    };
  }

  async connect(): Promise<void> {
    try {
      this.log('info', 'Connecting to pgvector', {
        mode: this.useSupabase ? 'supabase' : 'direct',
        table: this.tableName,
      });

      if (this.useSupabase) {
        // Test Supabase connection
        const response = await fetch(`${this.supabaseUrl}/rest/v1/${this.tableName}?limit=1`, {
          headers: this.headers,
        });

        if (!response.ok && response.status !== 404) {
          throw new AdapterError(
            'CONNECTION_FAILED',
            `Supabase connection failed: ${response.status}`,
            response.status >= 500
          );
        }
      } else {
        // For direct connection, we'd need a PostgreSQL client
        // This would typically use 'pg' or 'postgres' package
        this.log('warn', 'Direct PostgreSQL connection not implemented in this adapter');
      }

      this.connected = true;
      this.log('info', 'Connected to pgvector successfully');
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(
        'CONNECTION_FAILED',
        `Failed to connect to pgvector: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.log('info', 'Disconnected from pgvector');
  }

  async search(payload: SearchPayload): Promise<SearchResponseData> {
    this.validateConnected();

    if (!payload.embedding || payload.embedding.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'pgvector search requires embedding vector',
        false
      );
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      if (this.useSupabase) {
        return this.searchViaSupabase(payload);
      } else {
        return this.searchViaDirect(payload);
      }
    });

    this.log('debug', 'pgvector search completed', {
      latencyMs,
      resultCount: result.length,
    });

    const results: SearchResultItem[] = result.map((row) => ({
      id: row.id,
      score: row.similarity || (row.distance ? 1 / (1 + row.distance) : 1),
      values: row.embedding,
      metadata: row.metadata,
      content: row.content,
    }));

    return {
      type: 'search',
      results,
      count: results.length,
    };
  }

  private async searchViaSupabase(payload: SearchPayload): Promise<VectorRow[]> {
    // Use Supabase RPC function for vector similarity search
    const rpcBody = {
      query_embedding: payload.embedding,
      match_count: payload.topK || 10,
      filter: payload.filter || {},
    };

    // Try to call a stored function first (preferred)
    const rpcResponse = await fetch(`${this.supabaseUrl}/rest/v1/rpc/match_${this.tableName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(rpcBody),
    });

    if (rpcResponse.ok) {
      return (await rpcResponse.json()) as VectorRow[];
    }

    // Fallback: Use PostgREST with embedding operator
    // Note: This requires pgvector extension and proper index
    const embeddingArray = `[${payload.embedding!.join(',')}]`;
    const limit = payload.topK || 10;

    // Using cosine distance operator <=>
    const url = new URL(`${this.supabaseUrl}/rest/v1/${this.tableName}`);
    url.searchParams.set('select', `id,${this.contentColumn},${this.embeddingColumn},metadata`);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('order', `${this.embeddingColumn}.distance.${embeddingArray}`);

    if (payload.filter) {
      for (const [key, value] of Object.entries(payload.filter)) {
        url.searchParams.set(key, `eq.${value}`);
      }
    }

    const response = await fetch(url.toString(), {
      headers: this.headers,
    });

    if (!response.ok) {
      // Try simple query without ordering (for basic connectivity)
      const fallbackResponse = await fetch(
        `${this.supabaseUrl}/rest/v1/${this.tableName}?select=id,${this.contentColumn},metadata&limit=${limit}`,
        { headers: this.headers }
      );

      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text();
        throw new AdapterError(
          'QUERY_FAILED',
          `pgvector/Supabase query failed: ${errorText}`,
          false
        );
      }

      return (await fallbackResponse.json()) as VectorRow[];
    }

    return (await response.json()) as VectorRow[];
  }

  private async searchViaDirect(payload: SearchPayload): Promise<VectorRow[]> {
    // Direct PostgreSQL query would go here
    // This is a placeholder - actual implementation would use 'pg' package

    const _sql = `
      SELECT id, ${this.contentColumn}, metadata,
             1 - (${this.embeddingColumn} <=> $1::vector) as similarity
      FROM ${this.tableName}
      ORDER BY ${this.embeddingColumn} <=> $1::vector
      LIMIT $2
    `;

    // Placeholder - would execute SQL here
    this.log('warn', 'Direct PostgreSQL queries not implemented, returning empty results');

    // For now, we throw an error indicating this needs configuration
    throw new AdapterError(
      'NOT_IMPLEMENTED',
      'Direct PostgreSQL connection requires additional setup. Use Supabase mode instead.',
      false
    );

    // Would return query results
    // return rows as VectorRow[];
  }

  async upsert(payload: UpsertPayload): Promise<UpsertResponseData> {
    this.validateConnected();

    if (!payload.vectors || payload.vectors.length === 0) {
      throw new AdapterError(
        'INVALID_PAYLOAD',
        'pgvector upsert requires vectors array',
        false
      );
    }

    const { latencyMs } = await this.measureLatency(async () => {
      if (this.useSupabase) {
        return this.upsertViaSupabase(payload);
      } else {
        return this.upsertViaDirect(payload);
      }
    });

    this.log('info', 'pgvector upsert completed', {
      latencyMs,
      upsertedCount: payload.vectors.length,
    });

    return {
      type: 'upsert',
      upsertedCount: payload.vectors.length,
    };
  }

  private async upsertViaSupabase(payload: UpsertPayload): Promise<void> {
    const records = payload.vectors.map((vec) => ({
      id: vec.id,
      [this.contentColumn]: vec.content || '',
      [this.embeddingColumn]: vec.values,
      metadata: vec.metadata || {},
    }));

    // Use upsert (requires unique constraint on id)
    const response = await fetch(`${this.supabaseUrl}/rest/v1/${this.tableName}`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(records),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AdapterError(
        'UPSERT_FAILED',
        `pgvector/Supabase upsert failed: ${errorText}`,
        response.status >= 500 || response.status === 429
      );
    }
  }

  private async upsertViaDirect(_payload: UpsertPayload): Promise<void> {
    throw new AdapterError(
      'NOT_IMPLEMENTED',
      'Direct PostgreSQL upsert requires additional setup. Use Supabase mode instead.',
      false
    );
  }

  async delete(payload: DeletePayload): Promise<DeleteResponseData> {
    this.validateConnected();

    if (!payload.ids || payload.ids.length === 0) {
      if (!payload.deleteAll) {
        throw new AdapterError(
          'INVALID_PAYLOAD',
          'pgvector delete requires ids or deleteAll',
          false
        );
      }
    }

    const { latencyMs } = await this.measureLatency(async () => {
      if (this.useSupabase) {
        return this.deleteViaSupabase(payload);
      } else {
        return this.deleteViaDirect(payload);
      }
    });

    const deletedCount = payload.deleteAll ? -1 : (payload.ids?.length || 0);

    this.log('info', 'pgvector delete completed', { latencyMs, deletedCount });

    return {
      type: 'delete',
      deletedCount,
    };
  }

  private async deleteViaSupabase(payload: DeletePayload): Promise<void> {
    let url = `${this.supabaseUrl}/rest/v1/${this.tableName}`;

    if (payload.deleteAll) {
      // Delete all - be careful with this!
      url += '?id=neq.null'; // Match all records
    } else if (payload.ids && payload.ids.length > 0) {
      // Delete by IDs
      url += `?id=in.(${payload.ids.map((id) => `"${id}"`).join(',')})`;
    }

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AdapterError(
        'DELETE_FAILED',
        `pgvector/Supabase delete failed: ${errorText}`,
        response.status >= 500
      );
    }
  }

  private async deleteViaDirect(_payload: DeletePayload): Promise<void> {
    throw new AdapterError(
      'NOT_IMPLEMENTED',
      'Direct PostgreSQL delete requires additional setup. Use Supabase mode instead.',
      false
    );
  }

  async health(): Promise<HealthResponseData> {
    const start = performance.now();

    try {
      if (this.useSupabase) {
        const response = await fetch(`${this.supabaseUrl}/rest/v1/${this.tableName}?limit=1`, {
          headers: this.headers,
        });

        const latencyMs = Math.round(performance.now() - start);

        // 404 is OK - table might be empty
        const healthy = response.ok || response.status === 404;

        return {
          type: 'health',
          healthy,
          provider: 'pgvector',
          details: {
            latencyMs,
            mode: 'supabase',
            tableName: this.tableName,
            status: response.status,
          },
        };
      } else {
        // Direct connection health check
        return {
          type: 'health',
          healthy: false,
          provider: 'pgvector',
          details: {
            latencyMs: Math.round(performance.now() - start),
            mode: 'direct',
            error: 'Direct connection not implemented',
          },
        };
      }
    } catch (error) {
      return {
        type: 'health',
        healthy: false,
        provider: 'pgvector',
        details: {
          latencyMs: Math.round(performance.now() - start),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
