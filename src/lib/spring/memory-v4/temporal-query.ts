/**
 * Temporal Query Service
 *
 * Provides time-aware queries for memory retrieval:
 * - Search for facts valid at a specific point in time
 * - Filter by temporal ranges
 * - Event-time based queries for episodes
 *
 * @module spring/memory-v4/temporal-query
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface TemporalFilter {
  /** Only facts valid at this specific time */
  validAt?: Date;
  /** Facts valid during this entire range */
  validBetween?: {
    start: Date;
    end: Date;
  };
  /** Created before this date */
  createdBefore?: Date;
  /** Created after this date */
  createdAfter?: Date;
  /** Event occurred before this time (for episodes) */
  eventTimeBefore?: Date;
  /** Event occurred after this time (for episodes) */
  eventTimeAfter?: Date;
  /** Exclude expired facts (default: true) */
  excludeExpired?: boolean;
  /** Include superseded facts (default: false) */
  includeSuperseded?: boolean;
}

export interface TemporalSearchOptions {
  /** Search query (optional) */
  query?: string;
  /** Query embedding (optional) */
  embedding?: number[];
  /** Maximum results */
  topK?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Note types to include */
  types?: string[];
  /** Tags to filter */
  tags?: string[];
  /** Categories to filter */
  categories?: string[];
}

export interface TemporalSearchResult {
  id: string;
  content: string;
  type: string;
  similarity?: number;
  validFrom?: Date;
  validTo?: Date;
  eventTime?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface TimelineEntry {
  id: string;
  content: string;
  type: string;
  eventTime: Date;
  validFrom?: Date;
  validTo?: Date;
  isCurrentlyValid: boolean;
}

// =============================================================================
// Temporal Query Service
// =============================================================================

export class TemporalQueryService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Search memories valid at a specific point in time
   *
   * Returns only facts that were valid (valid_from <= validAt < valid_to)
   */
  async searchValidAt(
    userId: string,
    validAt: Date,
    options: TemporalSearchOptions = {}
  ): Promise<TemporalSearchResult[]> {
    const temporalFilter: TemporalFilter = {
      validAt,
      excludeExpired: true,
    };

    return this.searchWithTemporalFilter(userId, temporalFilter, options);
  }

  /**
   * Search memories with temporal filtering
   */
  async searchWithTemporalFilter(
    userId: string,
    temporal: TemporalFilter,
    options: TemporalSearchOptions = {}
  ): Promise<TemporalSearchResult[]> {
    const { topK = 20, minSimilarity = 0.5, types, tags, categories } = options;

    // Build base query
    let query = this.supabase
      .from('spring_memory_notes')
      .select(`
        id,
        content,
        note_type,
        valid_from,
        valid_to,
        event_time,
        created_at,
        updated_at,
        payload_json,
        tags,
        status
      `)
      .eq('user_id', userId);

    // Apply status filters
    const statusFilter = ['active'];
    if (temporal.includeSuperseded) {
      statusFilter.push('superseded');
    }
    if (!temporal.excludeExpired) {
      statusFilter.push('expired');
    }
    query = query.in('status', statusFilter);

    // Apply temporal filters
    if (temporal.validAt) {
      // Valid at a specific point: valid_from <= validAt AND (valid_to IS NULL OR valid_to > validAt)
      const validAtStr = temporal.validAt.toISOString();
      query = query
        .or(`valid_from.is.null,valid_from.lte.${validAtStr}`)
        .or(`valid_to.is.null,valid_to.gt.${validAtStr}`);
    }

    if (temporal.validBetween) {
      // Valid during entire range
      const startStr = temporal.validBetween.start.toISOString();
      const endStr = temporal.validBetween.end.toISOString();
      query = query
        .or(`valid_from.is.null,valid_from.lte.${startStr}`)
        .or(`valid_to.is.null,valid_to.gte.${endStr}`);
    }

    if (temporal.createdBefore) {
      query = query.lt('created_at', temporal.createdBefore.toISOString());
    }

    if (temporal.createdAfter) {
      query = query.gt('created_at', temporal.createdAfter.toISOString());
    }

    if (temporal.eventTimeBefore) {
      query = query.lt('event_time', temporal.eventTimeBefore.toISOString());
    }

    if (temporal.eventTimeAfter) {
      query = query.gt('event_time', temporal.eventTimeAfter.toISOString());
    }

    // Apply content filters
    if (types && types.length > 0) {
      query = query.in('note_type', types);
    }

    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }

    // Category filter would need JSON containment
    if (categories && categories.length > 0) {
      // This is a simplified approach - proper implementation needs jsonb operators
      query = query.containedBy('payload_json->categories', categories);
    }

    query = query.order('created_at', { ascending: false }).limit(topK);

    const { data: results, error } = await query;

    if (error) {
      console.error('Temporal search error:', error);
      return [];
    }

    // If we have a query embedding, we need to do similarity ranking
    if (options.embedding) {
      // For now, return results ordered by recency
      // Full implementation would use RPC with vector similarity
      return (results || []).map((r) => this.mapToResult(r));
    }

    return (results || []).map((r) => this.mapToResult(r));
  }

  /**
   * Get timeline of a user's memories
   *
   * Returns memories ordered by event_time or created_at
   */
  async getTimeline(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      types?: string[];
      limit?: number;
    } = {}
  ): Promise<TimelineEntry[]> {
    const { startDate, endDate, types, limit = 50 } = options;

    let query = this.supabase
      .from('spring_memory_notes')
      .select(`
        id,
        content,
        note_type,
        event_time,
        valid_from,
        valid_to,
        created_at,
        status
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'superseded', 'expired']);

    // Apply date range
    if (startDate) {
      query = query.or(`event_time.gte.${startDate.toISOString()},created_at.gte.${startDate.toISOString()}`);
    }

    if (endDate) {
      query = query.or(`event_time.lte.${endDate.toISOString()},created_at.lte.${endDate.toISOString()}`);
    }

    if (types && types.length > 0) {
      query = query.in('note_type', types);
    }

    // Order by event_time first, then created_at
    query = query
      .order('event_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: results, error } = await query;

    if (error) {
      console.error('Timeline error:', error);
      return [];
    }

    const now = new Date();

    return (results || []).map((r) => ({
      id: r.id,
      content: r.content,
      type: r.note_type,
      eventTime: new Date(r.event_time || r.created_at),
      validFrom: r.valid_from ? new Date(r.valid_from) : undefined,
      validTo: r.valid_to ? new Date(r.valid_to) : undefined,
      isCurrentlyValid: this.isValidNow(r, now),
    }));
  }

  /**
   * Get fact history (all versions of a fact including superseded ones)
   */
  async getFactHistory(
    userId: string,
    factId: string
  ): Promise<Array<TemporalSearchResult & { supersededById?: string }>> {
    // Get the current fact
    const { data: currentFact } = await this.supabase
      .from('spring_memory_notes')
      .select('*')
      .eq('id', factId)
      .eq('user_id', userId)
      .single();

    if (!currentFact) {
      return [];
    }

    const history: Array<TemporalSearchResult & { supersededById?: string }> = [];

    // Add current fact
    history.push({
      ...this.mapToResult(currentFact),
      supersededById: currentFact.superseded_by_id,
    });

    // Find facts that this one superseded
    const { data: supersededFacts } = await this.supabase
      .from('spring_memory_edges')
      .select(`
        dst_memory_id,
        spring_memory_notes!spring_memory_edges_dst_memory_id_fkey (
          id, content, note_type, valid_from, valid_to, event_time,
          created_at, updated_at, payload_json, superseded_by_id
        )
      `)
      .eq('src_memory_id', factId)
      .eq('edge_type', 'supersedes');

    if (supersededFacts) {
      for (const edge of supersededFacts) {
        const note = edge.spring_memory_notes as unknown as Record<string, unknown>;
        if (note) {
          history.push({
            ...this.mapToResult(note),
            supersededById: note.superseded_by_id as string | undefined,
          });
        }
      }
    }

    // Sort by created_at descending (newest first)
    return history.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Find facts that changed (were superseded) within a date range
   */
  async getChangedFacts(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    oldFact: TemporalSearchResult;
    newFact: TemporalSearchResult;
    changedAt: Date;
  }>> {
    // Find supersedes edges created in the date range
    const { data: edges } = await this.supabase
      .from('spring_memory_edges')
      .select(`
        src_memory_id,
        dst_memory_id,
        created_at,
        src:spring_memory_notes!spring_memory_edges_src_memory_id_fkey (
          id, content, note_type, valid_from, valid_to, event_time,
          created_at, updated_at, payload_json
        ),
        dst:spring_memory_notes!spring_memory_edges_dst_memory_id_fkey (
          id, content, note_type, valid_from, valid_to, event_time,
          created_at, updated_at, payload_json
        )
      `)
      .eq('edge_type', 'supersedes')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (!edges) {
      return [];
    }

    return edges
      .filter((e) => {
        const src = e.src as unknown as Record<string, unknown>;
        const dst = e.dst as unknown as Record<string, unknown>;
        return src && dst;
      })
      .map((e) => ({
        oldFact: this.mapToResult(e.dst as unknown as Record<string, unknown>),
        newFact: this.mapToResult(e.src as unknown as Record<string, unknown>),
        changedAt: new Date(e.created_at),
      }));
  }

  /**
   * Count facts by temporal status
   */
  async countByTemporalStatus(
    userId: string
  ): Promise<{
    active: number;
    expired: number;
    superseded: number;
    expiringSoon: number;
  }> {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get counts by status
    const [activeResult, expiredResult, supersededResult, expiringSoonResult] = await Promise.all([
      this.supabase
        .from('spring_memory_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active'),
      this.supabase
        .from('spring_memory_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'expired'),
      this.supabase
        .from('spring_memory_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'superseded'),
      this.supabase
        .from('spring_memory_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('valid_to', 'is', null)
        .lt('valid_to', weekFromNow.toISOString())
        .gt('valid_to', now.toISOString()),
    ]);

    return {
      active: activeResult.count ?? 0,
      expired: expiredResult.count ?? 0,
      superseded: supersededResult.count ?? 0,
      expiringSoon: expiringSoonResult.count ?? 0,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private mapToResult(row: Record<string, unknown>): TemporalSearchResult {
    return {
      id: row.id as string,
      content: row.content as string,
      type: row.note_type as string,
      similarity: row.similarity as number | undefined,
      validFrom: row.valid_from ? new Date(row.valid_from as string) : undefined,
      validTo: row.valid_to ? new Date(row.valid_to as string) : undefined,
      eventTime: row.event_time ? new Date(row.event_time as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      metadata: (row.payload_json as Record<string, unknown>) ?? {},
    };
  }

  private isValidNow(row: Record<string, unknown>, now: Date): boolean {
    if (row.status !== 'active') return false;

    const validFrom = row.valid_from ? new Date(row.valid_from as string) : null;
    const validTo = row.valid_to ? new Date(row.valid_to as string) : null;

    if (validFrom && validFrom > now) return false;
    if (validTo && validTo <= now) return false;

    return true;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createTemporalQueryService(supabase: SupabaseClient): TemporalQueryService {
  return new TemporalQueryService(supabase);
}
