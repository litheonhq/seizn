/**
 * Memory Usage Service
 *
 * Tracks where and how memories are used across the platform.
 * Enables "where used" visibility and usage-based analytics.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemoryUsage,
  RecordUsageInput,
  UpdateUsageOutcomeInput,
  NoteUsageStats,
  UsageType,
  UsageOutcome,
  UsageFeedback,
} from './types';

// =============================================================================
// Memory Usage Service
// =============================================================================

export class MemoryUsageService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Record a memory usage event
   */
  async recordUsage(input: RecordUsageInput): Promise<MemoryUsage> {
    const { data, error } = await this.supabase
      .from('spring_memory_usage')
      .insert({
        note_id: input.noteId,
        usage_type: input.usageType,
        trace_id: input.traceId,
        span_id: input.spanId,
        session_id: input.sessionId,
        agent_id: input.agentId,
        relevance_score: input.relevanceScore,
        query_text: input.queryText,
        response_snippet: input.responseSnippet,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record usage: ${error.message}`);
    }

    return this.mapUsageFromDb(data);
  }

  /**
   * Record usage for multiple memories at once
   */
  async recordBatchUsage(
    inputs: RecordUsageInput[]
  ): Promise<{ recorded: number; failed: number }> {
    const records = inputs.map((input) => ({
      note_id: input.noteId,
      usage_type: input.usageType,
      trace_id: input.traceId,
      span_id: input.spanId,
      session_id: input.sessionId,
      agent_id: input.agentId,
      relevance_score: input.relevanceScore,
      query_text: input.queryText,
      response_snippet: input.responseSnippet,
    }));

    const { data, error } = await this.supabase
      .from('spring_memory_usage')
      .insert(records)
      .select();

    if (error) {
      console.error('Batch usage recording failed:', error);
      return { recorded: 0, failed: inputs.length };
    }

    return { recorded: data?.length || 0, failed: inputs.length - (data?.length || 0) };
  }

  /**
   * Update the outcome of a usage event
   */
  async updateOutcome(input: UpdateUsageOutcomeInput): Promise<boolean> {
    const { error } = await this.supabase
      .from('spring_memory_usage')
      .update({
        outcome: input.outcome,
        feedback: input.feedback,
        feedback_reason: input.feedbackReason,
      })
      .eq('id', input.usageId);

    if (error) {
      throw new Error(`Failed to update outcome: ${error.message}`);
    }

    return true;
  }

  /**
   * Get usage history for a note
   */
  async getNoteUsageHistory(
    noteId: string,
    options?: {
      limit?: number;
      offset?: number;
      usageType?: UsageType;
      outcome?: UsageOutcome;
    }
  ): Promise<MemoryUsage[]> {
    let query = this.supabase
      .from('spring_memory_usage')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: false });

    if (options?.usageType) {
      query = query.eq('usage_type', options.usageType);
    }

    if (options?.outcome) {
      query = query.eq('outcome', options.outcome);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get usage history: ${error.message}`);
    }

    return (data || []).map(this.mapUsageFromDb);
  }

  /**
   * Get usage statistics for a note
   */
  async getNoteUsageStats(noteId: string): Promise<NoteUsageStats> {
    const { data, error } = await this.supabase
      .from('spring_memory_usage')
      .select('usage_type, outcome, feedback, relevance_score, created_at')
      .eq('note_id', noteId);

    if (error) {
      throw new Error(`Failed to get usage stats: ${error.message}`);
    }

    const usages = data || [];
    const totalUsages = usages.length;

    if (totalUsages === 0) {
      return {
        noteId,
        totalUsages: 0,
        recallCount: 0,
        citedCount: 0,
        successRate: 0,
        positiveRate: 0,
        negativeRate: 0,
      };
    }

    const recallCount = usages.filter((u) => u.usage_type === 'recalled').length;
    const citedCount = usages.filter((u) => u.usage_type === 'cited').length;

    const withOutcome = usages.filter((u) => u.outcome);
    const successCount = withOutcome.filter((u) => u.outcome === 'success').length;
    const successRate = withOutcome.length > 0 ? successCount / withOutcome.length : 0;

    const withFeedback = usages.filter((u) => u.feedback);
    const positiveCount = withFeedback.filter((u) => u.feedback === 'positive').length;
    const negativeCount = withFeedback.filter((u) => u.feedback === 'negative').length;
    const positiveRate = withFeedback.length > 0 ? positiveCount / withFeedback.length : 0;
    const negativeRate = withFeedback.length > 0 ? negativeCount / withFeedback.length : 0;

    const lastUsage = usages.reduce((latest, u) => {
      const date = new Date(u.created_at);
      return date > latest ? date : latest;
    }, new Date(0));

    const relevanceScores = usages
      .filter((u) => u.relevance_score !== null)
      .map((u) => parseFloat(u.relevance_score));
    const avgRelevanceScore =
      relevanceScores.length > 0
        ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length
        : undefined;

    return {
      noteId,
      totalUsages,
      recallCount,
      citedCount,
      successRate,
      positiveRate,
      negativeRate,
      lastUsedAt: lastUsage.getTime() > 0 ? lastUsage : undefined,
      avgRelevanceScore,
    };
  }

  /**
   * Get usage by trace (for "where used" feature)
   */
  async getUsageByTrace(traceId: string): Promise<MemoryUsage[]> {
    const { data, error } = await this.supabase
      .from('spring_memory_usage')
      .select('*')
      .eq('trace_id', traceId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get usage by trace: ${error.message}`);
    }

    return (data || []).map(this.mapUsageFromDb);
  }

  /**
   * Get most used memories for a user
   */
  async getMostUsedMemories(
    userId: string,
    options?: {
      limit?: number;
      since?: Date;
      usageType?: UsageType;
    }
  ): Promise<Array<{ noteId: string; usageCount: number; lastUsedAt: Date }>> {
    let query = this.supabase
      .from('spring_memory_usage')
      .select(`
        note_id,
        spring_memory_notes!inner(user_id)
      `)
      .eq('spring_memory_notes.user_id', userId);

    if (options?.since) {
      query = query.gte('created_at', options.since.toISOString());
    }

    if (options?.usageType) {
      query = query.eq('usage_type', options.usageType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get most used memories: ${error.message}`);
    }

    // Group by note_id and count
    const counts = new Map<string, { count: number; lastUsed: Date }>();
    for (const row of data || []) {
      const noteId = row.note_id;
      const existing = counts.get(noteId);
      if (existing) {
        existing.count++;
      } else {
        counts.set(noteId, { count: 1, lastUsed: new Date() });
      }
    }

    // Sort by count and limit
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, options?.limit || 20);

    return sorted.map(([noteId, stats]) => ({
      noteId,
      usageCount: stats.count,
      lastUsedAt: stats.lastUsed,
    }));
  }

  /**
   * Get memories correlated with failures
   */
  async getFailureCorrelatedMemories(
    userId: string,
    options?: { minFailures?: number; limit?: number }
  ): Promise<Array<{ noteId: string; failureCount: number; totalUsages: number; failureRate: number }>> {
    const { data, error } = await this.supabase
      .from('spring_memory_usage')
      .select(`
        note_id,
        outcome,
        spring_memory_notes!inner(user_id)
      `)
      .eq('spring_memory_notes.user_id', userId)
      .not('outcome', 'is', null);

    if (error) {
      throw new Error(`Failed to get failure correlated memories: ${error.message}`);
    }

    // Group by note_id
    const stats = new Map<string, { failures: number; total: number }>();
    for (const row of data || []) {
      const noteId = row.note_id;
      const existing = stats.get(noteId) || { failures: 0, total: 0 };
      existing.total++;
      if (row.outcome === 'failure') {
        existing.failures++;
      }
      stats.set(noteId, existing);
    }

    // Filter by minimum failures and calculate failure rate
    const minFailures = options?.minFailures || 2;
    const results = Array.from(stats.entries())
      .filter(([, s]) => s.failures >= minFailures)
      .map(([noteId, s]) => ({
        noteId,
        failureCount: s.failures,
        totalUsages: s.total,
        failureRate: s.failures / s.total,
      }))
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, options?.limit || 20);

    return results;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapUsageFromDb(row: Record<string, unknown>): MemoryUsage {
    return {
      id: row.id as string,
      noteId: row.note_id as string,
      traceId: row.trace_id as string | undefined,
      spanId: row.span_id as string | undefined,
      sessionId: row.session_id as string | undefined,
      agentId: row.agent_id as string | undefined,
      usageType: row.usage_type as UsageType,
      relevanceScore: row.relevance_score
        ? parseFloat(row.relevance_score as string)
        : undefined,
      outcome: row.outcome as UsageOutcome | undefined,
      feedback: row.feedback as UsageFeedback | undefined,
      feedbackReason: row.feedback_reason as string | undefined,
      queryText: row.query_text as string | undefined,
      responseSnippet: row.response_snippet as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createMemoryUsageService(supabase: SupabaseClient): MemoryUsageService {
  return new MemoryUsageService(supabase);
}
