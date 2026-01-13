/**
 * Drift Analyzer
 *
 * Analyzes embedding distribution drift to detect quality degradation.
 * Compares snapshots over time and generates alerts with recommendations.
 */

import type {
  DriftSnapshot,
  DriftAlert,
  DriftAlertType,
  DriftSeverity,
  DriftRecommendation,
  DriftThresholds,
  DriftAnalysisResult,
  DriftSummary,
  DEFAULT_DRIFT_THRESHOLDS,
} from './types';

// ============================================
// Centroid Analysis
// ============================================

/**
 * Calculate the magnitude of centroid shift between two vectors
 * Uses cosine distance (1 - cosine_similarity)
 */
export function calculateCentroidShift(
  oldCentroid: number[] | undefined,
  newCentroid: number[] | undefined
): number | undefined {
  if (!oldCentroid || !newCentroid) {
    return undefined;
  }

  if (oldCentroid.length !== newCentroid.length) {
    console.warn('Centroid dimension mismatch:', oldCentroid.length, newCentroid.length);
    return undefined;
  }

  // Calculate cosine similarity
  let dotProduct = 0;
  let normOld = 0;
  let normNew = 0;

  for (let i = 0; i < oldCentroid.length; i++) {
    dotProduct += oldCentroid[i] * newCentroid[i];
    normOld += oldCentroid[i] * oldCentroid[i];
    normNew += newCentroid[i] * newCentroid[i];
  }

  normOld = Math.sqrt(normOld);
  normNew = Math.sqrt(normNew);

  if (normOld === 0 || normNew === 0) {
    return undefined;
  }

  const cosineSimilarity = dotProduct / (normOld * normNew);

  // Return cosine distance (0 = identical, 2 = opposite)
  return 1 - cosineSimilarity;
}

/**
 * Calculate euclidean distance between two vectors
 */
export function calculateEuclideanDistance(
  vec1: number[] | undefined,
  vec2: number[] | undefined
): number | undefined {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return undefined;
  }

  let sumSquares = 0;
  for (let i = 0; i < vec1.length; i++) {
    const diff = vec1[i] - vec2[i];
    sumSquares += diff * diff;
  }

  return Math.sqrt(sumSquares);
}

// ============================================
// Entropy Analysis
// ============================================

/**
 * Calculate percentage change in entropy
 */
export function calculateEntropyChange(
  oldEntropy: number | undefined,
  newEntropy: number | undefined
): number | undefined {
  if (oldEntropy === undefined || newEntropy === undefined) {
    return undefined;
  }

  if (oldEntropy === 0) {
    return newEntropy === 0 ? 0 : 100;
  }

  return ((newEntropy - oldEntropy) / oldEntropy) * 100;
}

/**
 * Calculate Shannon entropy from a probability distribution
 */
export function calculateShannonEntropy(probabilities: number[]): number {
  if (probabilities.length === 0) {
    return 0;
  }

  let entropy = 0;
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Calculate entropy from embedding vectors using binning
 */
export function calculateEmbeddingEntropy(
  embeddings: number[][],
  numBins: number = 10
): number {
  if (embeddings.length === 0) {
    return 0;
  }

  // Calculate magnitude of each embedding
  const magnitudes = embeddings.map(emb => {
    let sum = 0;
    for (const v of emb) {
      sum += v * v;
    }
    return Math.sqrt(sum);
  });

  // Find min/max for binning
  const minMag = Math.min(...magnitudes);
  const maxMag = Math.max(...magnitudes);

  if (maxMag === minMag) {
    return 0; // All same magnitude
  }

  // Bin the magnitudes
  const binWidth = (maxMag - minMag) / numBins;
  const bins = new Array(numBins).fill(0);

  for (const mag of magnitudes) {
    const binIdx = Math.min(
      Math.floor((mag - minMag) / binWidth),
      numBins - 1
    );
    bins[binIdx]++;
  }

  // Convert to probabilities
  const total = magnitudes.length;
  const probabilities = bins.map(count => count / total);

  return calculateShannonEntropy(probabilities);
}

// ============================================
// Score Analysis
// ============================================

/**
 * Detect score drop percentage
 */
export function detectScoreDrop(
  oldAvgScore: number | undefined,
  newAvgScore: number | undefined
): number | undefined {
  if (oldAvgScore === undefined || newAvgScore === undefined) {
    return undefined;
  }

  if (oldAvgScore === 0) {
    return newAvgScore === 0 ? 0 : -100;
  }

  return ((newAvgScore - oldAvgScore) / oldAvgScore) * 100;
}

/**
 * Calculate score statistics
 */
export function calculateScoreStats(scores: number[]): {
  avg: number;
  stdDev: number;
  min: number;
  max: number;
} {
  if (scores.length === 0) {
    return { avg: 0, stdDev: 0, min: 0, max: 0 };
  }

  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;

  const squaredDiffs = scores.map(s => (s - avg) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return {
    avg,
    stdDev,
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

// ============================================
// Alert Generation
// ============================================

/**
 * Generate recommendations for centroid shift
 */
function getCentroidShiftRecommendations(severity: DriftSeverity): DriftRecommendation[] {
  if (severity === 'critical') {
    return [
      {
        action: 'reindex',
        description: 'Consider reindexing documents with updated embeddings',
        impact: 'high',
        autoApplicable: false,
      },
      {
        action: 'review_queries',
        description: 'Review recent query patterns for anomalies',
        impact: 'medium',
        autoApplicable: false,
      },
      {
        action: 'adjust_topk',
        description: 'Increase topK from 20 to 50 to capture more diverse results',
        impact: 'low',
        autoApplicable: true,
      },
    ];
  }

  return [
    {
      action: 'monitor',
      description: 'Continue monitoring for trend',
      impact: 'low',
      autoApplicable: false,
    },
    {
      action: 'review_queries',
      description: 'Review recent query patterns',
      impact: 'medium',
      autoApplicable: false,
    },
  ];
}

/**
 * Generate recommendations for score drop
 */
function getScoreDropRecommendations(severity: DriftSeverity): DriftRecommendation[] {
  if (severity === 'critical') {
    return [
      {
        action: 'reindex',
        description: 'Reindex collection to refresh embeddings',
        impact: 'high',
        autoApplicable: false,
      },
      {
        action: 'adjust_chunk_size',
        description: 'Review and adjust chunk size for better context',
        impact: 'medium',
        autoApplicable: false,
      },
      {
        action: 'enable_rerank',
        description: 'Enable or tune reranker for better precision',
        impact: 'medium',
        autoApplicable: true,
      },
      {
        action: 'model_update',
        description: 'Consider updating embedding model',
        impact: 'high',
        autoApplicable: false,
      },
    ];
  }

  return [
    {
      action: 'monitor',
      description: 'Monitor score trends over next few days',
      impact: 'low',
      autoApplicable: false,
    },
    {
      action: 'review_new_docs',
      description: 'Review recently added documents for quality',
      impact: 'medium',
      autoApplicable: false,
    },
  ];
}

/**
 * Generate recommendations for entropy change
 */
function getEntropyChangeRecommendations(): DriftRecommendation[] {
  return [
    {
      action: 'review_diversity',
      description: 'Review query diversity and document coverage',
      impact: 'medium',
      autoApplicable: false,
    },
    {
      action: 'adjust_topk',
      description: 'Adjust topK parameter to match new distribution',
      impact: 'low',
      autoApplicable: true,
    },
  ];
}

/**
 * Generate drift alert from analysis
 */
export function generateDriftAlert(
  snapshot: DriftSnapshot,
  previousSnapshot: DriftSnapshot | undefined,
  alertType: DriftAlertType,
  severity: DriftSeverity,
  currentValue: number,
  threshold: number
): DriftAlert {
  const now = new Date().toISOString();

  let title: string;
  let message: string;
  let recommendations: DriftRecommendation[];

  switch (alertType) {
    case 'centroid_shift':
      title = severity === 'critical'
        ? 'Critical: Query distribution shift detected'
        : 'Warning: Query distribution change detected';
      message = `Query centroid shifted by ${(currentValue * 100).toFixed(1)}% in collection. ` +
        (severity === 'critical'
          ? 'This may indicate significant changes in user search patterns or document distribution.'
          : 'Monitor for continued drift.');
      recommendations = getCentroidShiftRecommendations(severity);
      break;

    case 'score_drop':
      title = severity === 'critical'
        ? 'Critical: Search quality degradation detected'
        : 'Warning: Search quality decline detected';
      message = `Average search scores dropped by ${Math.abs(currentValue).toFixed(1)}%. ` +
        (severity === 'critical' ? 'Immediate action recommended.' : '');
      recommendations = getScoreDropRecommendations(severity);
      break;

    case 'entropy_change':
      title = 'Search diversity significantly changed';
      message = `Query entropy changed by ${currentValue.toFixed(1)}%. ` +
        'This may indicate shift in search patterns.';
      recommendations = getEntropyChangeRecommendations();
      break;

    default:
      title = `Drift detected: ${alertType}`;
      message = `Drift value: ${currentValue.toFixed(2)}, threshold: ${threshold.toFixed(2)}`;
      recommendations = [
        {
          action: 'monitor',
          description: 'Monitor this metric',
          impact: 'low',
          autoApplicable: false,
        },
      ];
  }

  return {
    id: '', // Will be assigned by database
    userId: snapshot.userId,
    orgId: snapshot.orgId,
    collectionId: snapshot.collectionId,
    alertType,
    severity,
    status: 'active',
    title,
    message,
    currentValue,
    previousValue: previousSnapshot?.avgTop1Score,
    threshold,
    deviationPct: currentValue * 100,
    recommendations,
    snapshotId: snapshot.id,
    comparisonSnapshotId: previousSnapshot?.id,
    acknowledged: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================
// Main Analysis Function
// ============================================

/**
 * Analyze drift between two snapshots
 */
export function analyzeDrift(
  currentSnapshot: DriftSnapshot,
  previousSnapshot: DriftSnapshot | undefined,
  thresholds: DriftThresholds
): DriftAnalysisResult {
  const alerts: DriftAlert[] = [];

  // Skip analysis if not enough queries
  if (currentSnapshot.queryCount < thresholds.minQueriesForAlert) {
    return {
      snapshot: currentSnapshot,
      previousSnapshot,
      alerts: [],
      summary: generateSummary(currentSnapshot, previousSnapshot, []),
    };
  }

  // 1. Check centroid shift
  if (currentSnapshot.centroidShiftMagnitude !== undefined) {
    if (currentSnapshot.centroidShiftMagnitude >= thresholds.centroidShiftCritical) {
      alerts.push(generateDriftAlert(
        currentSnapshot,
        previousSnapshot,
        'centroid_shift',
        'critical',
        currentSnapshot.centroidShiftMagnitude,
        thresholds.centroidShiftCritical
      ));
    } else if (currentSnapshot.centroidShiftMagnitude >= thresholds.centroidShiftWarning) {
      alerts.push(generateDriftAlert(
        currentSnapshot,
        previousSnapshot,
        'centroid_shift',
        'warning',
        currentSnapshot.centroidShiftMagnitude,
        thresholds.centroidShiftWarning
      ));
    }
  }

  // 2. Check score drop
  if (currentSnapshot.scoreChangePct !== undefined && currentSnapshot.scoreChangePct < 0) {
    const dropPct = Math.abs(currentSnapshot.scoreChangePct);
    if (dropPct >= thresholds.scoreDropCritical) {
      alerts.push(generateDriftAlert(
        currentSnapshot,
        previousSnapshot,
        'score_drop',
        'critical',
        currentSnapshot.scoreChangePct,
        thresholds.scoreDropCritical
      ));
    } else if (dropPct >= thresholds.scoreDropWarning) {
      alerts.push(generateDriftAlert(
        currentSnapshot,
        previousSnapshot,
        'score_drop',
        'warning',
        currentSnapshot.scoreChangePct,
        thresholds.scoreDropWarning
      ));
    }
  }

  // 3. Check entropy change
  if (currentSnapshot.entropyChangePct !== undefined) {
    const changePct = Math.abs(currentSnapshot.entropyChangePct);
    if (changePct >= thresholds.entropyChangeCritical) {
      alerts.push(generateDriftAlert(
        currentSnapshot,
        previousSnapshot,
        'entropy_change',
        'warning', // Entropy change is usually warning level
        currentSnapshot.entropyChangePct,
        thresholds.entropyChangeCritical
      ));
    }
  }

  return {
    snapshot: currentSnapshot,
    previousSnapshot,
    alerts,
    summary: generateSummary(currentSnapshot, previousSnapshot, alerts),
  };
}

/**
 * Generate drift summary
 */
export function generateSummary(
  snapshot: DriftSnapshot,
  previousSnapshot: DriftSnapshot | undefined,
  alerts: DriftAlert[]
): DriftSummary {
  // Calculate health score (0-100)
  let healthScore = 100;

  // Deduct for centroid shift
  if (snapshot.centroidShiftMagnitude !== undefined) {
    healthScore -= snapshot.centroidShiftMagnitude * 200; // 0.1 shift = -20 points
  }

  // Deduct for score drop
  if (snapshot.scoreChangePct !== undefined && snapshot.scoreChangePct < 0) {
    healthScore -= Math.abs(snapshot.scoreChangePct); // 10% drop = -10 points
  }

  // Deduct for active alerts
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const warningAlerts = alerts.filter(a => a.severity === 'warning').length;
  healthScore -= criticalAlerts * 20;
  healthScore -= warningAlerts * 10;

  // Clamp to 0-100
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine health status
  let healthStatus: DriftSummary['healthStatus'];
  if (healthScore >= 80) {
    healthStatus = 'healthy';
  } else if (healthScore >= 60) {
    healthStatus = 'warning';
  } else if (healthScore >= 40) {
    healthStatus = 'degraded';
  } else {
    healthStatus = 'critical';
  }

  // Determine trend
  let trend: DriftSummary['trend'] = 'stable';
  if (previousSnapshot?.avgTop1Score !== undefined && snapshot.avgTop1Score !== undefined) {
    const scoreDiff = snapshot.avgTop1Score - previousSnapshot.avgTop1Score;
    if (scoreDiff > 0.02) {
      trend = 'improving';
    } else if (scoreDiff < -0.02) {
      trend = 'degrading';
    }
  }

  return {
    collectionId: snapshot.collectionId,
    collectionName: snapshot.metadata?.collectionName,
    analysisDate: snapshot.snapshotDate,
    healthScore,
    healthStatus,
    queryCount: snapshot.queryCount,
    docCount: snapshot.docCount,
    avgScore: snapshot.avgTop1Score ?? 0,
    centroidShift: snapshot.centroidShiftMagnitude ?? 0,
    entropyChange: snapshot.entropyChangePct ?? 0,
    scoreChange: snapshot.scoreChangePct ?? 0,
    trend,
    activeAlerts: alerts.length,
  };
}

/**
 * Compare two centroids and return analysis
 */
export function compareCentroids(
  oldCentroid: number[] | undefined,
  newCentroid: number[] | undefined
): {
  cosineDistance: number | undefined;
  euclideanDistance: number | undefined;
  angleDegrees: number | undefined;
} {
  const cosineDistance = calculateCentroidShift(oldCentroid, newCentroid);
  const euclideanDistance = calculateEuclideanDistance(oldCentroid, newCentroid);

  let angleDegrees: number | undefined;
  if (cosineDistance !== undefined) {
    // Convert cosine distance to angle in degrees
    // cosine_distance = 1 - cos(theta)
    // cos(theta) = 1 - cosine_distance
    const cosTheta = 1 - cosineDistance;
    angleDegrees = Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI);
  }

  return {
    cosineDistance,
    euclideanDistance,
    angleDegrees,
  };
}
