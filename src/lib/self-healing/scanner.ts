/**
 * Self-Healing Index Scanner
 *
 * Scans collection indexes to detect issues like stale embeddings,
 * orphaned chunks, missing embeddings, and inconsistencies.
 */

import { createServerClient } from '@/lib/supabase';
import {
  IssueType,
  IssueSeverity,
  HealingActionType,
  ScanOptions,
  ScanResult,
  IndexIssue,
  Recommendation,
  ScanMetrics,
  IndexHealth,
  DEFAULT_HEALING_CONFIG,
} from './types';

// ============================================
// Constants
// ============================================

const DEFAULT_SCAN_LIMIT = 10000;
const DEFAULT_STALE_THRESHOLD_DAYS = 30;
const DEFAULT_BATCH_SIZE = 500;

// Severity thresholds (percentage of total chunks)
const SEVERITY_THRESHOLDS = {
  critical: 0.10, // 10%+
  high: 0.05,     // 5-10%
  medium: 0.02,   // 2-5%
  low: 0,         // 0-2%
};

// ============================================
// Main Scanner Function
// ============================================

/**
 * Scan a collection for index issues
 */
export async function scanCollection(
  collectionId: string,
  userId: string,
  options?: ScanOptions
): Promise<ScanResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  const limit = options?.limit ?? DEFAULT_SCAN_LIMIT;
  const staleThresholdDays = options?.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS;
  const issueTypes = options?.issueTypes ?? ['stale', 'orphaned', 'missing_embedding', 'corrupted', 'inconsistent'];

  const issues: IndexIssue[] = [];
  const metrics: ScanMetrics = {
    totalChunks: 0,
    scannedChunks: 0,
    healthyChunks: 0,
    issuesByType: {
      stale: 0,
      orphaned: 0,
      missing_embedding: 0,
      corrupted: 0,
      inconsistent: 0,
      low_quality: 0,
    },
    issuesBySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    oldestChunkAge: 0,
    newestChunkAge: Infinity,
    avgEmbeddingAge: 0,
  };

  try {
    // Get collection info
    const { data: collection, error: collectionError } = await supabase
      .from('summer_collections')
      .select('id, name, embedding_model, embedding_dimensions')
      .eq('id', collectionId)
      .eq('user_id', userId)
      .single();

    if (collectionError || !collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    // Get total chunk count
    const { count: totalCount } = await supabase
      .from('summer_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('collection_id', collectionId);

    metrics.totalChunks = totalCount ?? 0;

    // Scan in batches
    let offset = 0;
    while (offset < limit && offset < metrics.totalChunks) {
      const batchSize = Math.min(DEFAULT_BATCH_SIZE, limit - offset);

      const { data: chunks, error: chunksError } = await supabase
        .from('summer_chunks')
        .select(`
          id,
          document_id,
          content,
          embedding,
          metadata,
          created_at,
          updated_at
        `)
        .eq('collection_id', collectionId)
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: false });

      if (chunksError) {
        throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
      }

      if (!chunks || chunks.length === 0) break;

      // Analyze each chunk
      for (const chunk of chunks) {
        metrics.scannedChunks++;

        const chunkAge = calculateAgeDays(chunk.created_at);
        metrics.oldestChunkAge = Math.max(metrics.oldestChunkAge, chunkAge);
        metrics.newestChunkAge = Math.min(metrics.newestChunkAge, chunkAge);
        metrics.avgEmbeddingAge += chunkAge;

        let hasIssue = false;

        // Check for stale embeddings
        if (issueTypes.includes('stale')) {
          const isStale = await checkStaleChunk(supabase, chunk, staleThresholdDays);
          if (isStale) {
            addIssue(issues, metrics, 'stale', chunk.id, metrics.totalChunks, 'Chunk embedding is older than source document');
            hasIssue = true;
          }
        }

        // Check for orphaned chunks
        if (issueTypes.includes('orphaned')) {
          const isOrphaned = await checkOrphanedChunk(supabase, chunk);
          if (isOrphaned) {
            addIssue(issues, metrics, 'orphaned', chunk.id, metrics.totalChunks, 'Chunk has no parent document');
            hasIssue = true;
          }
        }

        // Check for missing embeddings
        if (issueTypes.includes('missing_embedding')) {
          if (!chunk.embedding || (Array.isArray(chunk.embedding) && chunk.embedding.length === 0)) {
            addIssue(issues, metrics, 'missing_embedding', chunk.id, metrics.totalChunks, 'Chunk has no embedding vector');
            hasIssue = true;
          }
        }

        // Check for corrupted data
        if (issueTypes.includes('corrupted')) {
          const isCorrupted = checkCorruptedChunk(chunk, collection.embedding_dimensions);
          if (isCorrupted) {
            addIssue(issues, metrics, 'corrupted', chunk.id, metrics.totalChunks, 'Chunk data is corrupted or malformed');
            hasIssue = true;
          }
        }

        // Check for inconsistencies
        if (issueTypes.includes('inconsistent')) {
          const isInconsistent = checkInconsistentChunk(chunk);
          if (isInconsistent) {
            addIssue(issues, metrics, 'inconsistent', chunk.id, metrics.totalChunks, 'Chunk metadata is inconsistent');
            hasIssue = true;
          }
        }

        if (!hasIssue) {
          metrics.healthyChunks++;
        }
      }

      offset += batchSize;
    }

    // Calculate average embedding age
    if (metrics.scannedChunks > 0) {
      metrics.avgEmbeddingAge /= metrics.scannedChunks;
    }

    // Consolidate issues by type
    const consolidatedIssues = consolidateIssues(issues);

    // Calculate scores
    const healthScore = calculateHealthScore(metrics);
    const freshnessScore = calculateFreshnessScore(metrics, staleThresholdDays);
    const consistencyScore = calculateConsistencyScore(metrics);

    // Generate recommendations
    const recommendations = generateRecommendations(consolidatedIssues, metrics);

    const duration = Date.now() - startTime;

    return {
      healthScore,
      freshnessScore,
      consistencyScore,
      issues: consolidatedIssues,
      recommendations,
      metrics,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Scan error:', error);

    return {
      healthScore: 0,
      freshnessScore: 0,
      consistencyScore: 0,
      issues: [],
      recommendations: [],
      metrics,
      duration,
    };
  }
}

// ============================================
// Issue Detection Functions
// ============================================

/**
 * Check if a chunk's embedding is stale
 */
async function checkStaleChunk(
  supabase: ReturnType<typeof createServerClient>,
  chunk: { id: string; document_id: string | null; updated_at: string },
  thresholdDays: number
): Promise<boolean> {
  if (!chunk.document_id) return false;

  // Get parent document's last update time
  const { data: document } = await supabase
    .from('summer_documents')
    .select('updated_at')
    .eq('id', chunk.document_id)
    .single();

  if (!document) return false;

  const chunkUpdated = new Date(chunk.updated_at);
  const docUpdated = new Date(document.updated_at);

  // Check if document was updated after chunk embedding
  if (docUpdated > chunkUpdated) {
    return true;
  }

  // Also check if chunk is older than threshold
  const chunkAge = calculateAgeDays(chunk.updated_at);
  return chunkAge > thresholdDays;
}

/**
 * Check if a chunk is orphaned (no parent document)
 */
async function checkOrphanedChunk(
  supabase: ReturnType<typeof createServerClient>,
  chunk: { document_id: string | null }
): Promise<boolean> {
  if (!chunk.document_id) return true;

  const { data: document } = await supabase
    .from('summer_documents')
    .select('id')
    .eq('id', chunk.document_id)
    .single();

  return !document;
}

/**
 * Check if chunk data is corrupted
 */
function checkCorruptedChunk(
  chunk: { content: string; embedding: number[] | null; metadata: Record<string, unknown> | null },
  expectedDimensions?: number
): boolean {
  // Check content
  if (!chunk.content || typeof chunk.content !== 'string' || chunk.content.trim().length === 0) {
    return true;
  }

  // Check embedding dimensions if provided
  if (chunk.embedding && expectedDimensions) {
    if (!Array.isArray(chunk.embedding) || chunk.embedding.length !== expectedDimensions) {
      return true;
    }

    // Check for NaN or Infinity values
    if (chunk.embedding.some(v => !Number.isFinite(v))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if chunk metadata is inconsistent
 */
function checkInconsistentChunk(
  chunk: { metadata: Record<string, unknown> | null }
): boolean {
  if (!chunk.metadata) return false;

  // Check for common metadata issues
  const metadata = chunk.metadata;

  // Check if required fields are missing when they should exist
  if (metadata.source_type && !metadata.source_id) {
    return true;
  }

  // Check for mismatched types
  if (metadata.chunk_index !== undefined && typeof metadata.chunk_index !== 'number') {
    return true;
  }

  if (metadata.total_chunks !== undefined && typeof metadata.total_chunks !== 'number') {
    return true;
  }

  return false;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate age in days from a timestamp
 */
function calculateAgeDays(timestamp: string): number {
  const date = new Date(timestamp);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Determine severity based on issue count
 */
function determineSeverity(issueCount: number, totalChunks: number): IssueSeverity {
  if (totalChunks === 0) return 'low';

  const ratio = issueCount / totalChunks;

  if (ratio >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (ratio >= SEVERITY_THRESHOLDS.high) return 'high';
  if (ratio >= SEVERITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Get suggested action for issue type
 */
function getSuggestedAction(issueType: IssueType): HealingActionType {
  switch (issueType) {
    case 'stale':
      return 'reembed';
    case 'orphaned':
      return 'delete';
    case 'missing_embedding':
      return 'reembed';
    case 'corrupted':
      return 'reindex';
    case 'inconsistent':
      return 'update_metadata';
    case 'low_quality':
      return 'flag';
    default:
      return 'flag';
  }
}

/**
 * Add an issue to the issues list and update metrics
 */
function addIssue(
  issues: IndexIssue[],
  metrics: ScanMetrics,
  type: IssueType,
  chunkId: string,
  totalChunks: number,
  details: string
): void {
  // Find existing issue of this type or create new
  let issue = issues.find(i => i.type === type);

  if (!issue) {
    issue = {
      type,
      chunkIds: [],
      severity: 'low',
      details,
      suggestedAction: getSuggestedAction(type),
    };
    issues.push(issue);
  }

  issue.chunkIds.push(chunkId);
  metrics.issuesByType[type]++;

  // Update severity based on new count
  issue.severity = determineSeverity(issue.chunkIds.length, totalChunks);
  metrics.issuesBySeverity[issue.severity]++;
}

/**
 * Consolidate issues (deduplicate and finalize)
 */
function consolidateIssues(issues: IndexIssue[]): IndexIssue[] {
  return issues.map(issue => ({
    ...issue,
    details: `${issue.details} (${issue.chunkIds.length} chunks affected)`,
  }));
}

// ============================================
// Score Calculation Functions
// ============================================

/**
 * Calculate overall health score
 */
function calculateHealthScore(metrics: ScanMetrics): number {
  if (metrics.scannedChunks === 0) return 1.0;

  const healthyRatio = metrics.healthyChunks / metrics.scannedChunks;

  // Apply penalties for each issue type
  const staleWeight = 0.3;
  const orphanWeight = 0.5;
  const missingWeight = 0.8;
  const corruptedWeight = 0.9;
  const inconsistentWeight = 0.2;

  const stalePenalty = (metrics.issuesByType.stale / metrics.scannedChunks) * staleWeight;
  const orphanPenalty = (metrics.issuesByType.orphaned / metrics.scannedChunks) * orphanWeight;
  const missingPenalty = (metrics.issuesByType.missing_embedding / metrics.scannedChunks) * missingWeight;
  const corruptedPenalty = (metrics.issuesByType.corrupted / metrics.scannedChunks) * corruptedWeight;
  const inconsistentPenalty = (metrics.issuesByType.inconsistent / metrics.scannedChunks) * inconsistentWeight;

  const totalPenalty = stalePenalty + orphanPenalty + missingPenalty + corruptedPenalty + inconsistentPenalty;

  return Math.max(0, Math.min(1, healthyRatio - totalPenalty));
}

/**
 * Calculate freshness score
 */
function calculateFreshnessScore(metrics: ScanMetrics, thresholdDays: number): number {
  if (metrics.scannedChunks === 0) return 1.0;

  // Based on stale chunks and average age
  const staleRatio = metrics.issuesByType.stale / metrics.scannedChunks;
  const ageScore = Math.max(0, 1 - (metrics.avgEmbeddingAge / (thresholdDays * 2)));

  return Math.max(0, Math.min(1, ((1 - staleRatio) + ageScore) / 2));
}

/**
 * Calculate consistency score
 */
function calculateConsistencyScore(metrics: ScanMetrics): number {
  if (metrics.scannedChunks === 0) return 1.0;

  const inconsistentRatio = (
    metrics.issuesByType.corrupted +
    metrics.issuesByType.inconsistent +
    metrics.issuesByType.missing_embedding
  ) / metrics.scannedChunks;

  return Math.max(0, Math.min(1, 1 - inconsistentRatio));
}

// ============================================
// Recommendation Generation
// ============================================

/**
 * Generate recommendations based on issues found
 */
function generateRecommendations(
  issues: IndexIssue[],
  metrics: ScanMetrics
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const issue of issues) {
    const recommendation = generateRecommendationForIssue(issue, metrics);
    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  // Sort by priority (highest first)
  recommendations.sort((a, b) => b.priority - a.priority);

  return recommendations;
}

/**
 * Generate recommendation for a specific issue
 */
function generateRecommendationForIssue(
  issue: IndexIssue,
  metrics: ScanMetrics
): Recommendation | null {
  const impactMap: Record<IssueSeverity, 'low' | 'medium' | 'high'> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'high',
  };

  const priorityMap: Record<IssueSeverity, number> = {
    low: 1,
    medium: 3,
    high: 5,
    critical: 10,
  };

  const impact = impactMap[issue.severity];
  const priority = priorityMap[issue.severity];

  switch (issue.type) {
    case 'stale':
      return {
        action: 'reembed',
        reason: `${issue.chunkIds.length} chunks have stale embeddings and should be re-embedded to maintain search quality.`,
        impact,
        estimatedChunks: issue.chunkIds.length,
        autoApplicable: issue.severity !== 'critical',
        priority,
      };

    case 'orphaned':
      return {
        action: 'delete',
        reason: `${issue.chunkIds.length} orphaned chunks should be removed to clean up the index.`,
        impact,
        estimatedChunks: issue.chunkIds.length,
        autoApplicable: false, // Deletion always requires approval
        priority,
      };

    case 'missing_embedding':
      return {
        action: 'reembed',
        reason: `${issue.chunkIds.length} chunks are missing embeddings and cannot be searched.`,
        impact: 'high',
        estimatedChunks: issue.chunkIds.length,
        autoApplicable: true,
        priority: Math.max(priority, 7), // Higher priority for missing embeddings
      };

    case 'corrupted':
      return {
        action: 'reindex',
        reason: `${issue.chunkIds.length} chunks have corrupted data and need to be reindexed from source.`,
        impact: 'high',
        estimatedChunks: issue.chunkIds.length,
        autoApplicable: false,
        priority: Math.max(priority, 8),
      };

    case 'inconsistent':
      return {
        action: 'update_metadata',
        reason: `${issue.chunkIds.length} chunks have inconsistent metadata that should be corrected.`,
        impact,
        estimatedChunks: issue.chunkIds.length,
        autoApplicable: true,
        priority,
      };

    case 'low_quality':
      return {
        action: 'flag',
        reason: `${issue.chunkIds.length} chunks have been flagged for quality review.`,
        impact: 'low',
        estimatedChunks: issue.chunkIds.length,
        autoApplicable: false,
        priority: 1,
      };

    default:
      return null;
  }
}

// ============================================
// Quick Scan Functions
// ============================================

/**
 * Quick health check without full scan
 */
export async function quickHealthCheck(
  collectionId: string,
  userId: string
): Promise<{ healthy: boolean; issueCount: number; lastChecked: string | null }> {
  const supabase = createServerClient();

  // Check if we have a recent health record
  const { data: health } = await supabase
    .from('index_health')
    .select('health_score, status, last_checked_at, stale_chunks, orphaned_chunks, missing_embeddings')
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .single();

  if (!health) {
    return { healthy: true, issueCount: 0, lastChecked: null };
  }

  const issueCount = (health.stale_chunks ?? 0) +
    (health.orphaned_chunks ?? 0) +
    (health.missing_embeddings ?? 0);

  return {
    healthy: health.status === 'healthy',
    issueCount,
    lastChecked: health.last_checked_at,
  };
}

/**
 * Count issues by type for a collection
 */
export async function countIssuesByType(
  collectionId: string,
  userId: string
): Promise<Record<IssueType, number>> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('healing_issue_queue')
    .select('issue_type')
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .eq('status', 'pending');

  const counts: Record<IssueType, number> = {
    stale: 0,
    orphaned: 0,
    missing_embedding: 0,
    corrupted: 0,
    inconsistent: 0,
    low_quality: 0,
  };

  if (data) {
    for (const item of data) {
      if (item.issue_type in counts) {
        counts[item.issue_type as IssueType]++;
      }
    }
  }

  return counts;
}

// ============================================
// Health Record Management
// ============================================

/**
 * Save scan results to health record
 */
export async function saveHealthRecord(
  collectionId: string,
  userId: string,
  scanResult: ScanResult
): Promise<IndexHealth | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('update_index_health', {
    p_collection_id: collectionId,
    p_user_id: userId,
    p_total_chunks: scanResult.metrics.totalChunks,
    p_healthy_chunks: scanResult.metrics.healthyChunks,
    p_stale_chunks: scanResult.metrics.issuesByType.stale,
    p_orphaned_chunks: scanResult.metrics.issuesByType.orphaned,
    p_missing_embeddings: scanResult.metrics.issuesByType.missing_embedding,
    p_corrupted_chunks: scanResult.metrics.issuesByType.corrupted,
    p_check_duration_ms: scanResult.duration,
  });

  if (error) {
    console.error('Failed to save health record:', error);
    return null;
  }

  return data as IndexHealth;
}

/**
 * Get health record for a collection
 */
export async function getHealthRecord(
  collectionId: string,
  userId: string
): Promise<IndexHealth | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('index_health')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .single();

  if (error) {
    return null;
  }

  return {
    id: data.id,
    collectionId: data.collection_id,
    userId: data.user_id,
    orgId: data.org_id,
    totalChunks: data.total_chunks,
    healthyChunks: data.healthy_chunks,
    staleChunks: data.stale_chunks,
    orphanedChunks: data.orphaned_chunks,
    missingEmbeddings: data.missing_embeddings,
    corruptedChunks: data.corrupted_chunks,
    healthScore: data.health_score,
    freshnessScore: data.freshness_score,
    consistencyScore: data.consistency_score,
    coverageScore: data.coverage_score,
    status: data.status,
    lastCheckedAt: data.last_checked_at,
    checkDurationMs: data.check_duration_ms,
    checkError: data.check_error,
    previousHealthScore: data.previous_health_score,
    scoreTrend: data.score_trend,
    metadata: data.metadata,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
