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

interface VectorRow {
  id: string;
  content?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  distance?: number;
  similarity?: number;
}

interface PgPool {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end: () => Promise<void>;
}

const DEFAULT_DIRECT_POOL_MAX = 10;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function quoteIdentifier(identifier: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new AdapterError('CONFIG_ERROR', `Invalid ${label}: ${identifier}`, false);
  }
  return `"${identifier}"`;
}

function quoteQualifiedIdentifier(value: string, label: string): string {
  const parts = value.split('.');
  if (parts.length === 0 || parts.length > 2) {
    throw new AdapterError('CONFIG_ERROR', `Invalid ${label}: ${value}`, false);
  }
  return parts.map((part) => quoteIdentifier(part, label)).join('.');
}

function parseVectorValue(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized.startsWith('[') || !normalized.endsWith(']')) {
      return undefined;
    }
    const body = normalized.slice(1, -1).trim();
    if (!body) return [];

    const parts = body.split(',');
    const parsed = parts.map((item) => Number(item.trim()));
    if (parsed.some((item) => !Number.isFinite(item))) {
      return undefined;
    }
    return parsed;
  }

  return undefined;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

/**
 * pgvector adapter using direct SQL queries.
 *
 * Supports:
 * - Direct PostgreSQL connection (connectionString)
 * - Supabase PostgREST API (host + apiKey)
 */
export class PgvectorAdapter extends BaseVectorAdapter {
  readonly provider: VectorDBProvider = 'pgvector';

  private connectionString: string;
  private tableName: string;
  private embeddingColumn: string;
  private contentColumn: string;
  private quotedTableName: string;
  private quotedEmbeddingColumn: string;
  private quotedContentColumn: string;
  private supabaseUrl?: string;
  private supabaseKey?: string;
  private useSupabase: boolean;
  private pool: PgPool | null = null;

  constructor(config: GatewayConfig) {
    super(config);

    if (config.connectionString) {
      this.connectionString = config.connectionString;
      this.useSupabase = false;
    } else if (config.host && config.apiKey) {
      this.supabaseUrl = config.host.startsWith('http') ? config.host : `https://${config.host}`;
      this.supabaseKey = config.apiKey;
      this.useSupabase = true;
      this.connectionString = '';
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

    this.quotedTableName = quoteQualifiedIdentifier(this.tableName, 'tableName');
    this.quotedEmbeddingColumn = quoteIdentifier(this.embeddingColumn, 'embedding column');
    this.quotedContentColumn = quoteIdentifier(this.contentColumn, 'content column');
  }

  private get headers(): Record<string, string> {
    if (!this.useSupabase || !this.supabaseKey) {
      return {};
    }
    return {
      'Content-Type': 'application/json',
      apikey: this.supabaseKey,
      Authorization: `Bearer ${this.supabaseKey}`,
      Prefer: 'return=representation',
    };
  }

  private async getDirectPool(): Promise<PgPool> {
    if (this.useSupabase) {
      throw new AdapterError('CONFIG_ERROR', 'Direct pool requested in Supabase mode', false);
    }
    if (this.pool) {
      return this.pool;
    }

    let pgModule: { Pool: new (config: Record<string, unknown>) => PgPool };
    try {
      pgModule = (await import('pg')) as { Pool: new (config: Record<string, unknown>) => PgPool };
    } catch (error) {
      throw new AdapterError(
        'MISSING_DEPENDENCY',
        `Direct pgvector mode requires the "pg" package at runtime: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        false
      );
    }

    const poolMax = parsePositiveInt(process.env.GATEWAY_PGVECTOR_POOL_MAX, DEFAULT_DIRECT_POOL_MAX);
    this.pool = new pgModule.Pool({
      connectionString: this.connectionString,
      max: poolMax,
    });
    return this.pool;
  }

  async connect(): Promise<void> {
    try {
      this.log('info', 'Connecting to pgvector', {
        mode: this.useSupabase ? 'supabase' : 'direct',
        table: this.tableName,
      });

      if (this.useSupabase) {
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
        const pool = await this.getDirectPool();
        await pool.query('SELECT 1');
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
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connected = false;
    this.log('info', 'Disconnected from pgvector');
  }

  async search(payload: SearchPayload): Promise<SearchResponseData> {
    this.validateConnected();

    if (!payload.embedding || payload.embedding.length === 0) {
      throw new AdapterError('INVALID_PAYLOAD', 'pgvector search requires embedding vector', false);
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      if (this.useSupabase) {
        return this.searchViaSupabase(payload);
      }
      return this.searchViaDirect(payload);
    });

    this.log('debug', 'pgvector search completed', {
      latencyMs,
      resultCount: result.length,
    });

    const results: SearchResultItem[] = result.map((row) => ({
      id: row.id,
      score: row.similarity || (row.distance ? 1 / (1 + row.distance) : 1),
      values: payload.includeValues ? row.embedding : undefined,
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
    const rpcBody = {
      query_embedding: payload.embedding,
      match_count: payload.topK || 10,
      filter: payload.filter || {},
    };

    const rpcResponse = await fetch(`${this.supabaseUrl}/rest/v1/rpc/match_${this.tableName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(rpcBody),
    });

    if (rpcResponse.ok) {
      return (await rpcResponse.json()) as VectorRow[];
    }

    const embeddingArray = `[${payload.embedding!.join(',')}]`;
    const limit = payload.topK || 10;

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
      const fallbackResponse = await fetch(
        `${this.supabaseUrl}/rest/v1/${this.tableName}?select=id,${this.contentColumn},metadata&limit=${limit}`,
        { headers: this.headers }
      );

      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text();
        throw new AdapterError('QUERY_FAILED', `pgvector/Supabase query failed: ${errorText}`, false);
      }

      return (await fallbackResponse.json()) as VectorRow[];
    }

    return (await response.json()) as VectorRow[];
  }

  private async searchViaDirect(payload: SearchPayload): Promise<VectorRow[]> {
    const pool = await this.getDirectPool();

    const params: unknown[] = [toVectorLiteral(payload.embedding!), payload.topK || 10];
    const where: string[] = [];

    if (payload.filter && Object.keys(payload.filter).length > 0) {
      params.push(JSON.stringify(payload.filter));
      where.push(`metadata @> $${params.length}::jsonb`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
      SELECT
        id,
        ${this.quotedContentColumn} AS content,
        metadata,
        ${this.quotedEmbeddingColumn} AS embedding,
        (${this.quotedEmbeddingColumn} <=> $1::vector) AS distance,
        (1 - (${this.quotedEmbeddingColumn} <=> $1::vector)) AS similarity
      FROM ${this.quotedTableName}
      ${whereClause}
      ORDER BY ${this.quotedEmbeddingColumn} <=> $1::vector
      LIMIT $2
    `;

    const { rows } = await pool.query(sql, params);
    return rows.map((row) => ({
      id: String(row.id),
      content: typeof row.content === 'string' ? row.content : undefined,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : undefined,
      embedding: parseVectorValue(row.embedding),
      distance: typeof row.distance === 'number' ? row.distance : undefined,
      similarity: typeof row.similarity === 'number' ? row.similarity : undefined,
    }));
  }

  async upsert(payload: UpsertPayload): Promise<UpsertResponseData> {
    this.validateConnected();

    if (!payload.vectors || payload.vectors.length === 0) {
      throw new AdapterError('INVALID_PAYLOAD', 'pgvector upsert requires vectors array', false);
    }

    const { latencyMs } = await this.measureLatency(async () => {
      if (this.useSupabase) {
        return this.upsertViaSupabase(payload);
      }
      return this.upsertViaDirect(payload);
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

    const response = await fetch(`${this.supabaseUrl}/rest/v1/${this.tableName}`, {
      method: 'POST',
      headers: {
        ...this.headers,
        Prefer: 'resolution=merge-duplicates',
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

  private async upsertViaDirect(payload: UpsertPayload): Promise<void> {
    const pool = await this.getDirectPool();

    const valuesSql: string[] = [];
    const params: unknown[] = [];

    payload.vectors.forEach((vector, index) => {
      const offset = index * 4;
      valuesSql.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}::vector, $${offset + 4}::jsonb)`
      );
      params.push(
        vector.id,
        vector.content ?? '',
        toVectorLiteral(vector.values),
        JSON.stringify(vector.metadata ?? {})
      );
    });

    const sql = `
      INSERT INTO ${this.quotedTableName} ("id", ${this.quotedContentColumn}, ${this.quotedEmbeddingColumn}, "metadata")
      VALUES ${valuesSql.join(', ')}
      ON CONFLICT ("id")
      DO UPDATE SET
        ${this.quotedContentColumn} = EXCLUDED.${this.quotedContentColumn},
        ${this.quotedEmbeddingColumn} = EXCLUDED.${this.quotedEmbeddingColumn},
        "metadata" = EXCLUDED."metadata"
    `;

    await pool.query(sql, params);
  }

  async delete(payload: DeletePayload): Promise<DeleteResponseData> {
    this.validateConnected();

    const hasIds = Array.isArray(payload.ids) && payload.ids.length > 0;
    const hasFilter = !!payload.filter && Object.keys(payload.filter).length > 0;
    if (!payload.deleteAll && !hasIds && !hasFilter) {
      throw new AdapterError('INVALID_PAYLOAD', 'pgvector delete requires ids, filter, or deleteAll', false);
    }

    const { result, latencyMs } = await this.measureLatency(async () => {
      if (this.useSupabase) {
        await this.deleteViaSupabase(payload);
        return payload.deleteAll ? -1 : payload.ids?.length || 0;
      }
      return this.deleteViaDirect(payload);
    });

    this.log('info', 'pgvector delete completed', { latencyMs, deletedCount: result });

    return {
      type: 'delete',
      deletedCount: result,
    };
  }

  private async deleteViaSupabase(payload: DeletePayload): Promise<void> {
    let url = `${this.supabaseUrl}/rest/v1/${this.tableName}`;

    if (payload.deleteAll) {
      url += '?id=neq.null';
    } else if (payload.ids && payload.ids.length > 0) {
      url += `?id=in.(${payload.ids.map((id) => `"${id}"`).join(',')})`;
    } else if (payload.filter && Object.keys(payload.filter).length > 0) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(payload.filter)) {
        query.set(key, `eq.${String(value)}`);
      }
      url += `?${query.toString()}`;
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

  private async deleteViaDirect(payload: DeletePayload): Promise<number> {
    const pool = await this.getDirectPool();

    const params: unknown[] = [];
    const where: string[] = [];

    if (!payload.deleteAll && payload.ids?.length) {
      params.push(payload.ids);
      where.push(`"id" = ANY($${params.length}::text[])`);
    }

    if (payload.filter && Object.keys(payload.filter).length > 0) {
      params.push(JSON.stringify(payload.filter));
      where.push(`"metadata" @> $${params.length}::jsonb`);
    }

    const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    const sql = `DELETE FROM ${this.quotedTableName}${whereClause}`;
    const result = await pool.query(sql, params);
    return result.rowCount ?? 0;
  }

  async health(): Promise<HealthResponseData> {
    const start = performance.now();

    try {
      if (this.useSupabase) {
        const response = await fetch(`${this.supabaseUrl}/rest/v1/${this.tableName}?limit=1`, {
          headers: this.headers,
        });

        const latencyMs = Math.round(performance.now() - start);
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
      }

      const pool = await this.getDirectPool();
      const { rows } = await pool.query('SELECT to_regclass($1) AS table_name', [this.tableName]);
      const latencyMs = Math.round(performance.now() - start);
      const tableExists = typeof rows[0]?.table_name === 'string';

      return {
        type: 'health',
        healthy: tableExists,
        provider: 'pgvector',
        details: {
          latencyMs,
          mode: 'direct',
          tableName: this.tableName,
          tableExists,
        },
      };
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
