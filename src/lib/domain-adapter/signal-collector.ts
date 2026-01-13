/**
 * Signal Collector for Domain Adaptation
 *
 * Collects and processes feedback signals for training domain adapters.
 * Supports explicit feedback, clicks, dwell time, and conversion signals.
 */

import { createServerClient } from '@/lib/supabase';
import {
  TrainingSignal,
  RecordSignalParams,
  SignalType,
  SignalFilter,
} from './types';

// =============================================================================
// Signal Collector Class
// =============================================================================

export class SignalCollector {
  private supabase = createServerClient();

  /**
   * Record explicit feedback (user marks docs as relevant/irrelevant)
   */
  async recordExplicitFeedback(
    adapterId: string,
    query: string,
    relevantDocIds: string[],
    irrelevantDocIds: string[],
    queryEmbedding?: number[],
    metadata?: Record<string, unknown>
  ): Promise<TrainingSignal> {
    return this.recordSignal({
      adapterId,
      queryText: query,
      queryEmbedding,
      positiveDocIds: relevantDocIds,
      negativeDocIds: irrelevantDocIds,
      signalType: 'explicit_feedback',
      metadata,
    });
  }

  /**
   * Record click signal (user clicked on a search result)
   */
  async recordClick(
    adapterId: string,
    query: string,
    clickedDocId: string,
    position: number,
    queryEmbedding?: number[],
    metadata?: Record<string, unknown>
  ): Promise<TrainingSignal> {
    return this.recordSignal({
      adapterId,
      queryText: query,
      queryEmbedding,
      clickedDocIds: [clickedDocId],
      signalType: 'click',
      metadata: {
        ...metadata,
        clickPosition: position,
        clickedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Record dwell time signal (how long user spent on a document)
   */
  async recordDwell(
    adapterId: string,
    query: string,
    docId: string,
    dwellTimeSeconds: number,
    queryEmbedding?: number[],
    metadata?: Record<string, unknown>
  ): Promise<TrainingSignal> {
    return this.recordSignal({
      adapterId,
      queryText: query,
      queryEmbedding,
      dwellTimes: { [docId]: dwellTimeSeconds },
      signalType: 'dwell',
      metadata: {
        ...metadata,
        dwellEndedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Record conversion signal (user completed desired action)
   */
  async recordConversion(
    adapterId: string,
    query: string,
    convertedDocId: string,
    conversionType: string,
    queryEmbedding?: number[],
    metadata?: Record<string, unknown>
  ): Promise<TrainingSignal> {
    return this.recordSignal({
      adapterId,
      queryText: query,
      queryEmbedding,
      positiveDocIds: [convertedDocId],
      signalType: 'conversion',
      metadata: {
        ...metadata,
        conversionType,
        convertedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Record a generic training signal
   */
  async recordSignal(params: RecordSignalParams): Promise<TrainingSignal> {
    const { data, error } = await this.supabase
      .from('adapter_training_signals')
      .insert({
        adapter_id: params.adapterId,
        query_text: params.queryText,
        query_embedding: params.queryEmbedding,
        positive_doc_ids: params.positiveDocIds ?? [],
        negative_doc_ids: params.negativeDocIds ?? [],
        clicked_doc_ids: params.clickedDocIds ?? [],
        dwell_times: params.dwellTimes ?? {},
        signal_type: params.signalType,
        metadata: params.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw error;

    return mapDbToSignal(data);
  }

  /**
   * Get signals for training
   */
  async getSignalsForTraining(
    adapterId: string,
    limit = 1000
  ): Promise<TrainingSignal[]> {
    const { data, error } = await this.supabase
      .from('adapter_training_signals')
      .select('*')
      .eq('adapter_id', adapterId)
      .not('query_embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(mapDbToSignal);
  }

  /**
   * Get all signals for an adapter with optional filtering
   */
  async getSignals(
    adapterId: string,
    filter?: SignalFilter,
    page = 1,
    pageSize = 50
  ): Promise<{ signals: TrainingSignal[]; total: number }> {
    let query = this.supabase
      .from('adapter_training_signals')
      .select('*', { count: 'exact' })
      .eq('adapter_id', adapterId);

    // Apply filters
    if (filter?.signalType) {
      query = query.eq('signal_type', filter.signalType);
    }
    if (filter?.startDate) {
      query = query.gte('created_at', filter.startDate.toISOString());
    }
    if (filter?.endDate) {
      query = query.lte('created_at', filter.endDate.toISOString());
    }

    // Pagination
    const offset = (page - 1) * pageSize;
    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    return {
      signals: data.map(mapDbToSignal),
      total: count ?? 0,
    };
  }

  /**
   * Delete a signal
   */
  async deleteSignal(signalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('adapter_training_signals')
      .delete()
      .eq('id', signalId);

    if (error) throw error;
  }

  /**
   * Batch delete signals
   */
  async deleteSignals(signalIds: string[]): Promise<number> {
    const { error, count } = await this.supabase
      .from('adapter_training_signals')
      .delete()
      .in('id', signalIds);

    if (error) throw error;

    return count ?? 0;
  }

  /**
   * Delete all signals for an adapter
   */
  async clearSignals(adapterId: string): Promise<number> {
    const { error, count } = await this.supabase
      .from('adapter_training_signals')
      .delete()
      .eq('adapter_id', adapterId);

    if (error) throw error;

    return count ?? 0;
  }

  /**
   * Get signal statistics for an adapter
   */
  async getSignalStats(adapterId: string): Promise<{
    total: number;
    byType: Record<SignalType, number>;
    withEmbeddings: number;
    avgDwellTime: number;
    recentCount: number; // last 7 days
  }> {
    const { data, error } = await this.supabase
      .from('adapter_training_signals')
      .select('signal_type, query_embedding, dwell_times, created_at')
      .eq('adapter_id', adapterId);

    if (error) throw error;

    const stats = {
      total: data.length,
      byType: {
        explicit_feedback: 0,
        click: 0,
        dwell: 0,
        conversion: 0,
      } as Record<SignalType, number>,
      withEmbeddings: 0,
      avgDwellTime: 0,
      recentCount: 0,
    };

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let totalDwellTime = 0;
    let dwellCount = 0;

    for (const signal of data) {
      stats.byType[signal.signal_type as SignalType]++;

      if (signal.query_embedding) {
        stats.withEmbeddings++;
      }

      if (signal.dwell_times && typeof signal.dwell_times === 'object') {
        const times = Object.values(signal.dwell_times as Record<string, number>);
        for (const time of times) {
          totalDwellTime += time;
          dwellCount++;
        }
      }

      if (new Date(signal.created_at) > sevenDaysAgo) {
        stats.recentCount++;
      }
    }

    stats.avgDwellTime = dwellCount > 0 ? totalDwellTime / dwellCount : 0;

    return stats;
  }
}

// =============================================================================
// Standalone Functions
// =============================================================================

/**
 * Create a new signal collector instance
 */
export function createSignalCollector(): SignalCollector {
  return new SignalCollector();
}

/**
 * Record explicit feedback (convenience function)
 */
export async function recordExplicitFeedback(
  adapterId: string,
  query: string,
  relevantDocIds: string[],
  irrelevantDocIds: string[],
  queryEmbedding?: number[],
  metadata?: Record<string, unknown>
): Promise<TrainingSignal> {
  const collector = new SignalCollector();
  return collector.recordExplicitFeedback(
    adapterId,
    query,
    relevantDocIds,
    irrelevantDocIds,
    queryEmbedding,
    metadata
  );
}

/**
 * Record click signal (convenience function)
 */
export async function recordClick(
  adapterId: string,
  query: string,
  clickedDocId: string,
  position: number,
  queryEmbedding?: number[],
  metadata?: Record<string, unknown>
): Promise<TrainingSignal> {
  const collector = new SignalCollector();
  return collector.recordClick(
    adapterId,
    query,
    clickedDocId,
    position,
    queryEmbedding,
    metadata
  );
}

/**
 * Record dwell time signal (convenience function)
 */
export async function recordDwell(
  adapterId: string,
  query: string,
  docId: string,
  dwellTimeSeconds: number,
  queryEmbedding?: number[],
  metadata?: Record<string, unknown>
): Promise<TrainingSignal> {
  const collector = new SignalCollector();
  return collector.recordDwell(
    adapterId,
    query,
    docId,
    dwellTimeSeconds,
    queryEmbedding,
    metadata
  );
}

/**
 * Record conversion signal (convenience function)
 */
export async function recordConversion(
  adapterId: string,
  query: string,
  convertedDocId: string,
  conversionType: string,
  queryEmbedding?: number[],
  metadata?: Record<string, unknown>
): Promise<TrainingSignal> {
  const collector = new SignalCollector();
  return collector.recordConversion(
    adapterId,
    query,
    convertedDocId,
    conversionType,
    queryEmbedding,
    metadata
  );
}

/**
 * Get signals for training (convenience function)
 */
export async function getSignalsForTraining(
  adapterId: string,
  limit = 1000
): Promise<TrainingSignal[]> {
  const collector = new SignalCollector();
  return collector.getSignalsForTraining(adapterId, limit);
}

// =============================================================================
// Batch Processing
// =============================================================================

export interface BatchSignalParams {
  adapterId: string;
  signals: Array<{
    queryText: string;
    queryEmbedding?: number[];
    signalType: SignalType;
    positiveDocIds?: string[];
    negativeDocIds?: string[];
    clickedDocIds?: string[];
    dwellTimes?: Record<string, number>;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Record multiple signals in batch
 */
export async function recordSignalsBatch(
  params: BatchSignalParams
): Promise<{ inserted: number; errors: number }> {
  const supabase = createServerClient();

  const rows = params.signals.map((signal) => ({
    adapter_id: params.adapterId,
    query_text: signal.queryText,
    query_embedding: signal.queryEmbedding,
    positive_doc_ids: signal.positiveDocIds ?? [],
    negative_doc_ids: signal.negativeDocIds ?? [],
    clicked_doc_ids: signal.clickedDocIds ?? [],
    dwell_times: signal.dwellTimes ?? {},
    signal_type: signal.signalType,
    metadata: signal.metadata ?? {},
  }));

  const { data, error } = await supabase
    .from('adapter_training_signals')
    .insert(rows)
    .select('id');

  if (error) {
    console.error('Batch signal insert error:', error);
    return { inserted: 0, errors: rows.length };
  }

  return { inserted: data.length, errors: rows.length - data.length };
}

// =============================================================================
// Mapping Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToSignal(row: any): TrainingSignal {
  return {
    id: row.id,
    adapterId: row.adapter_id,
    queryText: row.query_text,
    queryEmbedding: row.query_embedding,
    positiveDocIds: row.positive_doc_ids ?? [],
    negativeDocIds: row.negative_doc_ids ?? [],
    clickedDocIds: row.clicked_doc_ids ?? [],
    dwellTimes: row.dwell_times ?? {},
    signalType: row.signal_type as SignalType,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
  };
}

export { mapDbToSignal };
