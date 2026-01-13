/**
 * Drift Snapshot Collector
 *
 * Collects daily embedding distribution metrics from traces and documents.
 * Stores snapshots for drift analysis and alert generation.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  DriftSnapshot,
  DriftAlert,
  DriftThresholds,
  SnapshotCollectorInput,
  DEFAULT_DRIFT_THRESHOLDS,
} from './types';
import {
  calculateCentroidShift,
  calculateEntropyChange,
  detectScoreDrop,
  calculateEmbeddingEntropy,
  calculateScoreStats,
  analyzeDrift,
} from './analyzer';

// ============================================
// Snapshot Collection
// ============================================

/**
 * Calculate centroid (mean) of embedding vectors
 */
export function calculateCentroid(embeddings: number[][]): number[] | undefined {
  if (embeddings.length === 0) {
    return undefined;
  }

  const dimension = embeddings[0].length;
  const centroid = new Array(dimension).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  const count = embeddings.length;
  for (let i = 0; i < dimension; i++) {
    centroid[i] /= count;
  }

  return centroid;
}

/**
 * Calculate standard deviation of embeddings from centroid
 */
export function calculateEmbeddingStdDev(
  embeddings: number[][],
  centroid: number[]
): number {
  if (embeddings.length === 0) {
    return 0;
  }

  let sumSquaredDist = 0;
  for (const embedding of embeddings) {
    let dist = 0;
    for (let i = 0; i < centroid.length; i++) {
      const diff = embedding[i] - centroid[i];
      dist += diff * diff;
    }
    sumSquaredDist += dist;
  }

  return Math.sqrt(sumSquaredDist / embeddings.length);
}

/**
 * Collect and create a snapshot from input data
 */
export function createSnapshotFromInput(
  input: SnapshotCollectorInput,
  previousSnapshot?: DriftSnapshot
): Omit<DriftSnapshot, 'id' | 'createdAt' | 'updatedAt'> {
  const today = new Date().toISOString().split('T')[0];

  // Calculate query distribution metrics
  const queryCentroid = calculateCentroid(input.queryEmbeddings);
  const queryEntropy = calculateEmbeddingEntropy(input.queryEmbeddings);
  const queryStdDev = queryCentroid
    ? calculateEmbeddingStdDev(input.queryEmbeddings, queryCentroid)
    : undefined;

  // Calculate document distribution metrics
  const docCentroid = input.docEmbeddings
    ? calculateCentroid(input.docEmbeddings)
    : undefined;
  const docEntropy = input.docEmbeddings
    ? calculateEmbeddingEntropy(input.docEmbeddings)
    : undefined;
  const docStdDev = docCentroid && input.docEmbeddings
    ? calculateEmbeddingStdDev(input.docEmbeddings, docCentroid)
    : undefined;

  // Calculate score statistics
  const scoreStats = calculateScoreStats(input.scores);
  const topKScores = input.scores.slice(0, Math.min(10, input.scores.length));
  const top1Scores = input.scores.filter((_, i) => i % 10 === 0); // Top-1 from each query

  const avgTop1Score = top1Scores.length > 0
    ? top1Scores.reduce((a, b) => a + b, 0) / top1Scores.length
    : undefined;
  const avgTopKScore = topKScores.length > 0
    ? topKScores.reduce((a, b) => a + b, 0) / topKScores.length
    : undefined;

  // Calculate rerank metrics
  let rerankBoostAvg: number | undefined;
  let rerankBoostStdDev: number | undefined;
  let rerankPositionChangeAvg: number | undefined;

  if (input.rerankBoosts && input.rerankBoosts.length > 0) {
    rerankBoostAvg = input.rerankBoosts.reduce((a, b) => a + b, 0) / input.rerankBoosts.length;
    const boostVariance = input.rerankBoosts.reduce(
      (sum, b) => sum + (b - rerankBoostAvg!) ** 2,
      0
    ) / input.rerankBoosts.length;
    rerankBoostStdDev = Math.sqrt(boostVariance);
  }

  if (input.rerankPositionChanges && input.rerankPositionChanges.length > 0) {
    rerankPositionChangeAvg = input.rerankPositionChanges.reduce((a, b) => a + b, 0) /
      input.rerankPositionChanges.length;
  }

  // Calculate drift metrics vs previous snapshot
  let centroidShiftMagnitude: number | undefined;
  let entropyChangePct: number | undefined;
  let scoreChangePct: number | undefined;

  if (previousSnapshot) {
    centroidShiftMagnitude = calculateCentroidShift(
      previousSnapshot.queryCentroid,
      queryCentroid
    );
    entropyChangePct = calculateEntropyChange(
      previousSnapshot.queryEntropy,
      queryEntropy
    );
    scoreChangePct = detectScoreDrop(
      previousSnapshot.avgTop1Score,
      avgTop1Score
    );
  }

  return {
    userId: input.userId,
    orgId: input.orgId,
    collectionId: input.collectionId,
    snapshotDate: today,

    queryCentroid,
    queryCount: input.queryCount,
    queryEntropy,
    queryStdDev,

    docCentroid,
    docCount: input.docCount,
    docEntropy,
    docStdDev,

    avgTop1Score,
    avgTopKScore,
    scoreStdDev: scoreStats.stdDev,
    minScore: scoreStats.min,
    maxScore: scoreStats.max,

    rerankBoostAvg,
    rerankBoostStdDev,
    rerankPositionChangeAvg,

    centroidShiftMagnitude,
    entropyChangePct,
    scoreChangePct,

    metadata: {
      embeddingModel: input.embeddingModel,
      dimension: input.dimension,
      scoreHistogram: generateScoreHistogram(input.scores),
    },
  };
}

/**
 * Generate histogram buckets for score distribution
 */
function generateScoreHistogram(
  scores: number[],
  numBuckets: number = 10
): { bucket: number; count: number; label: string }[] {
  if (scores.length === 0) {
    return [];
  }

  const histogram: { bucket: number; count: number; label: string }[] = [];
  const bucketWidth = 1.0 / numBuckets;

  for (let i = 0; i < numBuckets; i++) {
    const min = i * bucketWidth;
    const max = (i + 1) * bucketWidth;
    const count = scores.filter(s => s >= min && s < max).length;

    histogram.push({
      bucket: i,
      count,
      label: `${(min * 100).toFixed(0)}%-${(max * 100).toFixed(0)}%`,
    });
  }

  return histogram;
}

// ============================================
// Database Operations
// ============================================

/**
 * DriftCollector class for collecting and storing snapshots
 */
export class DriftCollector {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Collect snapshot for a collection from traces
   */
  async collectSnapshot(
    collectionId: string,
    userId: string,
    orgId?: string
  ): Promise<{ snapshot: DriftSnapshot; alerts: DriftAlert[] }> {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get previous snapshot for comparison
    const { data: prevSnapshots } = await this.supabase
      .from('drift_snapshots')
      .select('*')
      .eq('collection_id', collectionId)
      .lt('snapshot_date', today)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    const previousSnapshot = prevSnapshots?.[0]
      ? this.mapDbToSnapshot(prevSnapshots[0])
      : undefined;

    // Get query embeddings from traces (last 24 hours)
    const { data: traces } = await this.supabase
      .from('traces')
      .select('query_embedding, scores, rerank_boost')
      .eq('user_id', userId)
      .eq('collection_id', collectionId)
      .gte('created_at', yesterday)
      .limit(10000);

    // Get document count and sample embeddings
    const { count: docCount } = await this.supabase
      .from('summer_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('collection_id', collectionId);

    // Aggregate data
    const queryEmbeddings: number[][] = [];
    const scores: number[] = [];
    const rerankBoosts: number[] = [];

    for (const trace of traces || []) {
      if (trace.query_embedding) {
        queryEmbeddings.push(trace.query_embedding);
      }
      if (trace.scores && Array.isArray(trace.scores)) {
        scores.push(...trace.scores);
      }
      if (trace.rerank_boost !== undefined) {
        rerankBoosts.push(trace.rerank_boost);
      }
    }

    // Create snapshot
    const input: SnapshotCollectorInput = {
      collectionId,
      userId,
      orgId,
      queryEmbeddings,
      queryCount: traces?.length || 0,
      docCount: docCount || 0,
      scores,
      rerankBoosts: rerankBoosts.length > 0 ? rerankBoosts : undefined,
    };

    const snapshotData = createSnapshotFromInput(input, previousSnapshot);

    // Save to database
    const { data: savedSnapshot, error } = await this.supabase
      .from('drift_snapshots')
      .upsert({
        ...this.mapSnapshotToDb(snapshotData),
        collection_id: collectionId,
        snapshot_date: today,
      }, {
        onConflict: 'collection_id,snapshot_date',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save snapshot: ${error.message}`);
    }

    const snapshot = this.mapDbToSnapshot(savedSnapshot);

    // Get thresholds
    const thresholds = await this.getThresholds(userId, collectionId);

    // Analyze drift and generate alerts
    const analysis = analyzeDrift(snapshot, previousSnapshot, thresholds);

    // Save alerts
    const savedAlerts: DriftAlert[] = [];
    for (const alert of analysis.alerts) {
      const { data: savedAlert } = await this.supabase
        .from('drift_alerts')
        .insert(this.mapAlertToDb(alert))
        .select()
        .single();

      if (savedAlert) {
        savedAlerts.push(this.mapDbToAlert(savedAlert));
      }
    }

    return { snapshot, alerts: savedAlerts };
  }

  /**
   * Get thresholds for a user/collection
   */
  async getThresholds(
    userId: string,
    collectionId?: string
  ): Promise<DriftThresholds> {
    const { data } = await this.supabase
      .from('drift_thresholds')
      .select('*')
      .eq('user_id', userId)
      .or(`collection_id.eq.${collectionId},collection_id.is.null`)
      .order('collection_id', { ascending: false })
      .limit(1);

    if (data && data[0]) {
      return {
        id: data[0].id,
        userId: data[0].user_id,
        collectionId: data[0].collection_id,
        centroidShiftWarning: data[0].centroid_shift_warning,
        centroidShiftCritical: data[0].centroid_shift_critical,
        entropyChangeWarning: data[0].entropy_change_warning,
        entropyChangeCritical: data[0].entropy_change_critical,
        scoreDropWarning: data[0].score_drop_warning,
        scoreDropCritical: data[0].score_drop_critical,
        alertsEnabled: data[0].alerts_enabled,
        emailNotifications: data[0].email_notifications,
        webhookUrl: data[0].webhook_url,
        comparisonWindowDays: data[0].comparison_window_days,
        minQueriesForAlert: data[0].min_queries_for_alert,
      };
    }

    // Return defaults
    return {
      userId,
      centroidShiftWarning: 0.05,
      centroidShiftCritical: 0.10,
      entropyChangeWarning: 15.0,
      entropyChangeCritical: 25.0,
      scoreDropWarning: 10.0,
      scoreDropCritical: 20.0,
      alertsEnabled: true,
      emailNotifications: false,
      comparisonWindowDays: 7,
      minQueriesForAlert: 100,
    };
  }

  /**
   * Get snapshots for a collection
   */
  async getSnapshots(
    userId: string,
    collectionId?: string,
    startDate?: string,
    endDate?: string,
    limit: number = 30
  ): Promise<DriftSnapshot[]> {
    let query = this.supabase
      .from('drift_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(limit);

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }
    if (startDate) {
      query = query.gte('snapshot_date', startDate);
    }
    if (endDate) {
      query = query.lte('snapshot_date', endDate);
    }

    const { data } = await query;
    return (data || []).map(this.mapDbToSnapshot);
  }

  /**
   * Get alerts for a user
   */
  async getAlerts(
    userId: string,
    options: {
      collectionId?: string;
      status?: string;
      severity?: string;
      limit?: number;
    } = {}
  ): Promise<DriftAlert[]> {
    let query = this.supabase
      .from('drift_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(options.limit || 50);

    if (options.collectionId) {
      query = query.eq('collection_id', options.collectionId);
    }
    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.severity) {
      query = query.eq('severity', options.severity);
    }

    const { data } = await query;
    return (data || []).map(this.mapDbToAlert);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    userId: string
  ): Promise<DriftAlert | null> {
    const { data, error } = await this.supabase
      .from('drift_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
        status: 'acknowledged',
      })
      .eq('id', alertId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToAlert(data);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    alertId: string,
    userId: string,
    notes?: string
  ): Promise<DriftAlert | null> {
    const { data, error } = await this.supabase
      .from('drift_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: notes,
      })
      .eq('id', alertId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToAlert(data);
  }

  // ============================================
  // Mapping Functions
  // ============================================

  private mapDbToSnapshot(row: Record<string, unknown>): DriftSnapshot {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      orgId: row.org_id as string | undefined,
      collectionId: row.collection_id as string,
      snapshotDate: row.snapshot_date as string,

      queryCentroid: row.query_centroid as number[] | undefined,
      queryCount: row.query_count as number,
      queryEntropy: row.query_entropy as number | undefined,
      queryStdDev: row.query_std_dev as number | undefined,

      docCentroid: row.doc_centroid as number[] | undefined,
      docCount: row.doc_count as number,
      docEntropy: row.doc_entropy as number | undefined,
      docStdDev: row.doc_std_dev as number | undefined,

      avgTop1Score: row.avg_top1_score as number | undefined,
      avgTopKScore: row.avg_topk_score as number | undefined,
      scoreStdDev: row.score_std_dev as number | undefined,
      minScore: row.min_score as number | undefined,
      maxScore: row.max_score as number | undefined,

      rerankBoostAvg: row.rerank_boost_avg as number | undefined,
      rerankBoostStdDev: row.rerank_boost_std_dev as number | undefined,
      rerankPositionChangeAvg: row.rerank_position_change_avg as number | undefined,

      centroidShiftMagnitude: row.centroid_shift_magnitude as number | undefined,
      entropyChangePct: row.entropy_change_pct as number | undefined,
      scoreChangePct: row.score_change_pct as number | undefined,

      metadata: row.metadata as DriftSnapshot['metadata'],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapSnapshotToDb(snapshot: Omit<DriftSnapshot, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
    return {
      user_id: snapshot.userId,
      org_id: snapshot.orgId,
      collection_id: snapshot.collectionId,
      snapshot_date: snapshot.snapshotDate,

      query_centroid: snapshot.queryCentroid,
      query_count: snapshot.queryCount,
      query_entropy: snapshot.queryEntropy,
      query_std_dev: snapshot.queryStdDev,

      doc_centroid: snapshot.docCentroid,
      doc_count: snapshot.docCount,
      doc_entropy: snapshot.docEntropy,
      doc_std_dev: snapshot.docStdDev,

      avg_top1_score: snapshot.avgTop1Score,
      avg_topk_score: snapshot.avgTopKScore,
      score_std_dev: snapshot.scoreStdDev,
      min_score: snapshot.minScore,
      max_score: snapshot.maxScore,

      rerank_boost_avg: snapshot.rerankBoostAvg,
      rerank_boost_std_dev: snapshot.rerankBoostStdDev,
      rerank_position_change_avg: snapshot.rerankPositionChangeAvg,

      centroid_shift_magnitude: snapshot.centroidShiftMagnitude,
      entropy_change_pct: snapshot.entropyChangePct,
      score_change_pct: snapshot.scoreChangePct,

      metadata: snapshot.metadata,
    };
  }

  private mapDbToAlert(row: Record<string, unknown>): DriftAlert {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      orgId: row.org_id as string | undefined,
      collectionId: row.collection_id as string,

      alertType: row.alert_type as DriftAlert['alertType'],
      severity: row.severity as DriftAlert['severity'],
      status: row.status as DriftAlert['status'],

      title: row.title as string,
      message: row.message as string,

      currentValue: row.current_value as number | undefined,
      previousValue: row.previous_value as number | undefined,
      threshold: row.threshold as number | undefined,
      deviationPct: row.deviation_pct as number | undefined,

      recommendations: row.recommendations as DriftAlert['recommendations'],

      snapshotId: row.snapshot_id as string | undefined,
      comparisonSnapshotId: row.comparison_snapshot_id as string | undefined,

      acknowledged: row.acknowledged as boolean,
      acknowledgedBy: row.acknowledged_by as string | undefined,
      acknowledgedAt: row.acknowledged_at as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
      resolutionNotes: row.resolution_notes as string | undefined,

      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapAlertToDb(alert: DriftAlert): Record<string, unknown> {
    return {
      user_id: alert.userId,
      org_id: alert.orgId,
      collection_id: alert.collectionId,

      alert_type: alert.alertType,
      severity: alert.severity,
      status: alert.status,

      title: alert.title,
      message: alert.message,

      current_value: alert.currentValue,
      previous_value: alert.previousValue,
      threshold: alert.threshold,
      deviation_pct: alert.deviationPct,

      recommendations: alert.recommendations,

      snapshot_id: alert.snapshotId,
      comparison_snapshot_id: alert.comparisonSnapshotId,

      acknowledged: alert.acknowledged,
    };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get date string for N days ago
 */
export function getDateNDaysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().split('T')[0];
}

/**
 * Get all collections for a user that need snapshot collection
 */
export async function getCollectionsForSnapshotCollection(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ id: string; name: string; orgId?: string }[]> {
  const { data } = await supabase
    .from('summer_collections')
    .select('id, name, org_id')
    .eq('user_id', userId)
    .eq('active', true);

  return ((data || []) as Array<{ id: string; name: string; org_id?: string }>).map(c => ({
    id: c.id,
    name: c.name,
    orgId: c.org_id,
  }));
}
