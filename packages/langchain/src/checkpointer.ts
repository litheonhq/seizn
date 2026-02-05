/**
 * Seizn LangGraph Checkpointer
 *
 * Persists LangGraph StateGraph checkpoints to Seizn's backend via Supabase.
 * Supports time-travel debugging and replay.
 *
 * @packageDocumentation
 * @module @seizn/langchain/checkpointer
 *
 * @example Basic usage with LangGraph
 * ```typescript
 * import { SeiznCheckpointer } from '@seizn/langchain/checkpointer';
 * import { createClient } from '@supabase/supabase-js';
 * import { StateGraph } from '@langchain/langgraph';
 *
 * const supabase = createClient(
 *   process.env.SUPABASE_URL!,
 *   process.env.SUPABASE_SERVICE_ROLE_KEY!,
 * );
 *
 * const checkpointer = new SeiznCheckpointer({ supabase });
 *
 * const graph = new StateGraph({ channels: {...} })
 *   .addNode(...)
 *   .compile({ checkpointer });
 *
 * // Invoke with a thread_id for persistence
 * await graph.invoke(input, {
 *   configurable: { thread_id: 'my-thread' },
 * });
 * ```
 *
 * @example Time-travel: replay from a specific checkpoint
 * ```typescript
 * const checkpointer = new SeiznCheckpointer({ supabase });
 *
 * // List all checkpoints for a thread
 * const history = [];
 * for await (const tuple of checkpointer.list({
 *   configurable: { thread_id: 'my-thread' },
 * })) {
 *   history.push(tuple);
 * }
 *
 * // Resume from a specific checkpoint
 * await graph.invoke(input, {
 *   configurable: {
 *     thread_id: 'my-thread',
 *     checkpoint_id: history[2].checkpoint.id,
 *   },
 * });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// LangGraph Checkpoint Types
// ============================================
// Defined locally to avoid a hard dependency on @langchain/langgraph.
// These mirror the canonical types so the class is drop-in compatible.

/**
 * Metadata attached to every checkpoint describing how it was created.
 */
export interface CheckpointMetadata {
  /** How the checkpoint was produced */
  source: 'input' | 'loop' | 'update';
  /** Step number within the graph execution */
  step: number;
  /** Channel writes that led to this checkpoint, or null */
  writes: Record<string, unknown> | null;
  /** Map of namespace to parent checkpoint ID */
  parents: Record<string, string>;
}

/**
 * A single immutable snapshot of graph state.
 */
export interface Checkpoint {
  /** Schema version */
  v: number;
  /** Unique checkpoint identifier */
  id: string;
  /** ISO-8601 timestamp of checkpoint creation */
  ts: string;
  /** Current values for each channel */
  channel_values: Record<string, unknown>;
  /** Version counter for each channel */
  channel_versions: Record<string, number>;
  /** Per-node view of which channel versions have been consumed */
  versions_seen: Record<string, Record<string, number>>;
  /** Pending send operations not yet processed */
  pending_sends: unknown[];
}

/**
 * A checkpoint together with its configuration and optional parent.
 */
export interface CheckpointTuple {
  /** Config that uniquely identifies this checkpoint */
  config: RunnableConfig;
  /** The checkpoint data */
  checkpoint: Checkpoint;
  /** Metadata for this checkpoint */
  metadata?: CheckpointMetadata;
  /** Config pointing at the parent checkpoint, if any */
  parentConfig?: RunnableConfig;
}

/**
 * Minimal runnable config carrying checkpoint addressing information.
 */
export interface RunnableConfig {
  configurable?: {
    thread_id: string;
    checkpoint_ns?: string;
    checkpoint_id?: string;
  };
}

/**
 * Options accepted by the {@link SeiznCheckpointer.list} method.
 */
export interface CheckpointListOptions {
  /** Maximum number of checkpoints to return */
  limit?: number;
  /** Only return checkpoints created before this one */
  before?: RunnableConfig;
  /** Key-value filter applied to checkpoint metadata (JSONB containment) */
  filter?: Record<string, unknown>;
}

// ============================================
// Checkpointer Configuration
// ============================================

/**
 * Configuration for creating a {@link SeiznCheckpointer}.
 */
export interface SeiznCheckpointerConfig {
  /** Authenticated Supabase client */
  supabase: SupabaseClient;
  /** Table name for checkpoints (default: `'langgraph_checkpoints'`) */
  checkpointTable?: string;
  /** Table name for pending writes (default: `'langgraph_writes'`) */
  writesTable?: string;
  /** Enable debug logging to the console */
  debug?: boolean;
}

// ============================================
// Database Row Shapes
// ============================================

/** Shape of a row in the checkpoints table */
interface CheckpointRow {
  id: string;
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  type: string;
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  created_at: string;
}

/** Shape of a row in the writes table */
interface WriteRow {
  id: string;
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  task_id: string;
  idx: number;
  channel: string;
  type: string;
  value: unknown;
  created_at: string;
}

// ============================================
// SeiznCheckpointer
// ============================================

/**
 * LangGraph-compatible checkpoint saver backed by Supabase.
 *
 * Implements the four methods required by LangGraph's `BaseCheckpointSaver`
 * interface without importing `@langchain/langgraph` at runtime. This keeps
 * the package lightweight -- consumers only need `@langchain/langgraph` as a
 * peer dependency when they wire the checkpointer into a `StateGraph`.
 *
 * ## Storage layout
 *
 * | Table                    | Purpose                                |
 * | ------------------------ | -------------------------------------- |
 * | `langgraph_checkpoints`  | Immutable checkpoint snapshots (JSONB) |
 * | `langgraph_writes`       | Pending writes for in-progress steps   |
 *
 * Both tables are created by the companion migration
 * `supabase/migrations/20260207_langgraph_checkpoints.sql`.
 */
export class SeiznCheckpointer {
  /** Supabase client for database operations */
  private readonly supabase: SupabaseClient;

  /** Checkpoint table name */
  private readonly checkpointTable: string;

  /** Writes table name */
  private readonly writesTable: string;

  /** Debug mode */
  private readonly debug: boolean;

  /**
   * Create a new SeiznCheckpointer.
   *
   * @param config - Checkpointer configuration
   * @throws Error if `config.supabase` is not provided
   *
   * @example
   * ```typescript
   * const checkpointer = new SeiznCheckpointer({
   *   supabase: createClient(url, key),
   * });
   * ```
   */
  constructor(config: SeiznCheckpointerConfig) {
    if (!config.supabase) {
      throw new Error(
        'SeiznCheckpointer requires a configured Supabase client'
      );
    }

    this.supabase = config.supabase;
    this.checkpointTable = config.checkpointTable ?? 'langgraph_checkpoints';
    this.writesTable = config.writesTable ?? 'langgraph_writes';
    this.debug = config.debug ?? false;
  }

  // ============================================
  // BaseCheckpointSaver Interface
  // ============================================

  /**
   * Retrieve a single checkpoint tuple.
   *
   * When `config.configurable.checkpoint_id` is provided the exact checkpoint
   * is fetched. Otherwise the **latest** checkpoint for the given thread and
   * namespace is returned.
   *
   * @param config - Runnable config identifying the checkpoint
   * @returns The matching checkpoint tuple, or `undefined` if none exists
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable');
    }

    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    this.log('getTuple', { threadId, checkpointNs, checkpointId });

    let query = this.supabase
      .from(this.checkpointTable)
      .select('*')
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs);

    if (checkpointId) {
      query = query.eq('checkpoint_id', checkpointId);
    } else {
      // Get the latest checkpoint
      query = query.order('created_at', { ascending: false }).limit(1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get checkpoint: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return undefined;
    }

    const row = data[0] as CheckpointRow;
    return this.rowToTuple(row);
  }

  /**
   * List checkpoints for a thread, yielded in reverse chronological order.
   *
   * Supports pagination via `options.limit` and cursor-based iteration via
   * `options.before`. An optional `options.filter` is matched against the
   * JSONB metadata column using Supabase's `contains` operator.
   *
   * @param config - Runnable config identifying the thread
   * @param options - Pagination and filter options
   * @yields CheckpointTuple for each matching checkpoint
   *
   * @example
   * ```typescript
   * for await (const tuple of checkpointer.list(
   *   { configurable: { thread_id: 'abc' } },
   *   { limit: 10 },
   * )) {
   *   console.log(tuple.checkpoint.id, tuple.metadata?.step);
   * }
   * ```
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable');
    }

    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const limit = options?.limit;
    const beforeCheckpointId =
      options?.before?.configurable?.checkpoint_id;
    const filter = options?.filter;

    this.log('list', { threadId, checkpointNs, limit, beforeCheckpointId, filter });

    let query = this.supabase
      .from(this.checkpointTable)
      .select('*')
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs)
      .order('created_at', { ascending: false });

    // Cursor-based pagination: only return rows older than `before`
    if (beforeCheckpointId) {
      // Fetch the created_at of the cursor checkpoint so we can use it as a
      // boundary. We compare on created_at rather than checkpoint_id to
      // leverage the index.
      const { data: cursorData } = await this.supabase
        .from(this.checkpointTable)
        .select('created_at')
        .eq('thread_id', threadId)
        .eq('checkpoint_ns', checkpointNs)
        .eq('checkpoint_id', beforeCheckpointId)
        .single();

      if (cursorData) {
        query = query.lt('created_at', (cursorData as { created_at: string }).created_at);
      }
    }

    // Metadata containment filter
    if (filter && Object.keys(filter).length > 0) {
      query = query.contains('metadata', filter);
    }

    if (limit !== undefined && limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list checkpoints: ${error.message}`);
    }

    if (!data) {
      return;
    }

    for (const row of data as CheckpointRow[]) {
      yield this.rowToTuple(row);
    }
  }

  /**
   * Persist a checkpoint.
   *
   * Upserts into the checkpoints table using the composite unique key
   * `(thread_id, checkpoint_ns, checkpoint_id)`. The `newVersions` map is
   * merged into the checkpoint's `channel_versions` before storage.
   *
   * @param config - Runnable config for the checkpoint
   * @param checkpoint - The checkpoint data to persist
   * @param metadata - Metadata describing how the checkpoint was produced
   * @param newVersions - Channel version updates to merge
   * @returns Updated runnable config pointing at the saved checkpoint
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, number>
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable');
    }

    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const parentCheckpointId = config.configurable?.checkpoint_id;

    this.log('put', {
      threadId,
      checkpointNs,
      checkpointId: checkpoint.id,
      parentCheckpointId,
      step: metadata.step,
    });

    // Merge new channel versions into the checkpoint
    const mergedCheckpoint: Checkpoint = {
      ...checkpoint,
      channel_versions: {
        ...checkpoint.channel_versions,
        ...newVersions,
      },
    };

    const row = {
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint_id: checkpoint.id,
      parent_checkpoint_id: parentCheckpointId ?? null,
      type: 'json',
      checkpoint: mergedCheckpoint,
      metadata,
    };

    const { error } = await this.supabase
      .from(this.checkpointTable)
      .upsert(row, {
        onConflict: 'thread_id,checkpoint_ns,checkpoint_id',
      });

    if (error) {
      throw new Error(`Failed to save checkpoint: ${error.message}`);
    }

    // Return a config that points at the newly saved checkpoint
    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  /**
   * Persist pending writes for an in-progress step.
   *
   * Each entry in `writes` is a `[channel, value]` tuple that is stored as a
   * separate row in the writes table. The combination of
   * `(thread_id, checkpoint_ns, checkpoint_id, task_id, idx)` forms the
   * composite unique key, so repeated calls with the same arguments are
   * idempotent.
   *
   * @param config - Runnable config identifying the checkpoint
   * @param writes - Array of `[channel, value]` tuples to persist
   * @param taskId - Identifier for the current task / node execution
   */
  async putWrites(
    config: RunnableConfig,
    writes: Array<[string, unknown]>,
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable');
    }

    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!checkpointId) {
      throw new Error('checkpoint_id is required in config.configurable for putWrites');
    }

    this.log('putWrites', {
      threadId,
      checkpointNs,
      checkpointId,
      taskId,
      writeCount: writes.length,
    });

    if (writes.length === 0) {
      return;
    }

    const rows = writes.map(([channel, value], idx) => ({
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint_id: checkpointId,
      task_id: taskId,
      idx,
      channel,
      type: 'json',
      value,
    }));

    const { error } = await this.supabase
      .from(this.writesTable)
      .upsert(rows, {
        onConflict: 'thread_id,checkpoint_ns,checkpoint_id,task_id,idx',
      });

    if (error) {
      throw new Error(`Failed to save writes: ${error.message}`);
    }
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Delete all checkpoints and writes for a given thread.
   *
   * Useful for cleaning up after a conversation is complete or when
   * resetting state during development.
   *
   * @param threadId - The thread whose data should be removed
   * @param checkpointNs - Optional namespace filter (default: all namespaces)
   */
  async deleteThread(threadId: string, checkpointNs?: string): Promise<void> {
    this.log('deleteThread', { threadId, checkpointNs });

    let checkpointQuery = this.supabase
      .from(this.checkpointTable)
      .delete()
      .eq('thread_id', threadId);

    let writesQuery = this.supabase
      .from(this.writesTable)
      .delete()
      .eq('thread_id', threadId);

    if (checkpointNs !== undefined) {
      checkpointQuery = checkpointQuery.eq('checkpoint_ns', checkpointNs);
      writesQuery = writesQuery.eq('checkpoint_ns', checkpointNs);
    }

    const [checkpointResult, writesResult] = await Promise.all([
      checkpointQuery,
      writesQuery,
    ]);

    if (checkpointResult.error) {
      throw new Error(
        `Failed to delete checkpoints: ${checkpointResult.error.message}`
      );
    }

    if (writesResult.error) {
      throw new Error(
        `Failed to delete writes: ${writesResult.error.message}`
      );
    }
  }

  /**
   * Retrieve the pending writes associated with a specific checkpoint.
   *
   * @param config - Runnable config identifying the checkpoint
   * @returns Array of `[channel, value]` tuples ordered by index
   */
  async getWrites(
    config: RunnableConfig
  ): Promise<Array<[string, unknown]>> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable');
    }

    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;

    if (!checkpointId) {
      throw new Error('checkpoint_id is required in config.configurable for getWrites');
    }

    const { data, error } = await this.supabase
      .from(this.writesTable)
      .select('*')
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs)
      .eq('checkpoint_id', checkpointId)
      .order('idx', { ascending: true });

    if (error) {
      throw new Error(`Failed to get writes: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return (data as WriteRow[]).map((row) => [row.channel, row.value]);
  }

  // ============================================
  // Internal Helpers
  // ============================================

  /**
   * Convert a database row into a CheckpointTuple.
   */
  private rowToTuple(row: CheckpointRow): CheckpointTuple {
    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint: row.checkpoint,
      metadata: row.metadata,
    };

    if (row.parent_checkpoint_id) {
      tuple.parentConfig = {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.parent_checkpoint_id,
        },
      };
    }

    return tuple;
  }

  /**
   * Emit a debug log message.
   */
  private log(method: string, details?: Record<string, unknown>): void {
    if (this.debug) {
      console.log(
        `[SeiznCheckpointer.${method}]`,
        details ? JSON.stringify(details) : ''
      );
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a {@link SeiznCheckpointer} instance.
 *
 * @param config - Checkpointer configuration
 * @returns A configured SeiznCheckpointer
 *
 * @example
 * ```typescript
 * import { createSeiznCheckpointer } from '@seizn/langchain/checkpointer';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const checkpointer = createSeiznCheckpointer({
 *   supabase: createClient(url, key),
 * });
 * ```
 */
export function createSeiznCheckpointer(
  config: SeiznCheckpointerConfig
): SeiznCheckpointer {
  return new SeiznCheckpointer(config);
}
