/**
 * Seizn Policy Simulator - Diff Engine
 *
 * Computes differences between base and test policy evaluation results.
 * Calculates impact scores and generates detailed diff reports.
 */

import type {
  EvaluationResult,
  ChunkRef,
  PolicyDiff,
} from './types';

// ============================================
// Main Diff Function
// ============================================

/**
 * Compute the diff between base and test policy results
 */
export function computeDiff(
  baseResults: EvaluationResult[],
  testResults: EvaluationResult[],
  chunks: ChunkRef[]
): PolicyDiff {
  const newlyBlocked: ChunkRef[] = [];
  const newlyAllowed: ChunkRef[] = [];
  const maskingChanged: { chunk: ChunkRef; baseMasked: string; testMasked: string }[] = [];

  // Create lookup maps for efficient comparison
  const baseMap = new Map(baseResults.map((r) => [r.chunkId, r]));
  const testMap = new Map(testResults.map((r) => [r.chunkId, r]));
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));

  // Compare each chunk
  for (const chunk of chunks) {
    const baseResult = baseMap.get(chunk.id);
    const testResult = testMap.get(chunk.id);

    if (!baseResult || !testResult) continue;

    // Check for newly blocked chunks
    if (isAllowedAction(baseResult.action) && testResult.action === 'block') {
      newlyBlocked.push(chunk);
    }

    // Check for newly allowed chunks
    if (baseResult.action === 'block' && isAllowedAction(testResult.action)) {
      newlyAllowed.push(chunk);
    }

    // Check for masking changes
    if (hasMaskingChanged(baseResult, testResult)) {
      maskingChanged.push({
        chunk,
        baseMasked: baseResult.maskedContent || chunk.content,
        testMasked: testResult.maskedContent || chunk.content,
      });
    }
  }

  // Calculate impact score
  const impactScore = calculateImpactScore(
    chunks.length,
    newlyBlocked.length,
    newlyAllowed.length,
    maskingChanged.length
  );

  // Calculate impact breakdown
  const totalChanges = newlyBlocked.length + newlyAllowed.length + maskingChanged.length;
  const impactBreakdown = {
    blockedImpact: totalChanges > 0 ? (newlyBlocked.length / totalChanges) * impactScore : 0,
    allowedImpact: totalChanges > 0 ? (newlyAllowed.length / totalChanges) * impactScore : 0,
    maskingImpact: totalChanges > 0 ? (maskingChanged.length / totalChanges) * impactScore : 0,
  };

  return {
    newlyBlocked,
    newlyAllowed,
    maskingChanged,
    impactScore,
    impactBreakdown,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if an action allows the chunk through
 */
function isAllowedAction(action: string): boolean {
  return action === 'allow' || action === 'mask' || action === 'redact';
}

/**
 * Check if masking has changed between base and test
 */
function hasMaskingChanged(
  baseResult: EvaluationResult,
  testResult: EvaluationResult
): boolean {
  // Both have masking
  if (baseResult.maskedContent && testResult.maskedContent) {
    return baseResult.maskedContent !== testResult.maskedContent;
  }

  // One has masking, other doesn't
  if (baseResult.maskedContent || testResult.maskedContent) {
    // Only count as changed if both are in "allow" state (not blocked)
    if (isAllowedAction(baseResult.action) && isAllowedAction(testResult.action)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate impact score (0-1)
 *
 * Impact is higher when:
 * - More chunks are affected relative to total
 * - Blocking changes (stronger than masking changes)
 * - Both blocking and allowing changes occur (unstable policy)
 */
function calculateImpactScore(
  totalChunks: number,
  newlyBlocked: number,
  newlyAllowed: number,
  maskingChanged: number
): number {
  if (totalChunks === 0) return 0;

  // Weight different types of changes
  const blockingWeight = 1.0; // Blocking is most impactful
  const allowingWeight = 0.8; // Allowing is slightly less impactful
  const maskingWeight = 0.3; // Masking changes are less impactful

  // Calculate weighted change count
  const weightedChanges =
    newlyBlocked * blockingWeight +
    newlyAllowed * allowingWeight +
    maskingChanged * maskingWeight;

  // Base impact from ratio of affected chunks
  const baseImpact = Math.min(1, weightedChanges / totalChunks);

  // Bonus impact if policy is unstable (both blocking and allowing)
  const instabilityBonus =
    newlyBlocked > 0 && newlyAllowed > 0 ? 0.1 : 0;

  return Math.min(1, baseImpact + instabilityBonus);
}

/**
 * Compute aggregate impact score from multiple query impacts
 */
export function computeAggregateImpact(impactScores: number[]): number {
  if (impactScores.length === 0) return 0;

  // Use weighted average favoring higher impacts
  // This ensures a few high-impact queries don't get hidden by many low-impact ones
  const sorted = [...impactScores].sort((a, b) => b - a);

  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < sorted.length; i++) {
    // Higher weight for higher-impact queries
    const weight = sorted.length - i;
    weightedSum += sorted[i] * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}

// ============================================
// Detailed Diff Analysis
// ============================================

export interface DetailedDiffAnalysis {
  summary: {
    totalChunks: number;
    unchangedChunks: number;
    newlyBlockedChunks: number;
    newlyAllowedChunks: number;
    maskingChangedChunks: number;
    impactScore: number;
    impactLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  };
  ruleAnalysis: {
    newRulesActivated: string[];
    rulesNoLongerActivated: string[];
    commonRules: string[];
  };
  recommendations: string[];
}

/**
 * Generate detailed diff analysis with recommendations
 */
export function analyzeDetailedDiff(
  baseResults: EvaluationResult[],
  testResults: EvaluationResult[],
  chunks: ChunkRef[]
): DetailedDiffAnalysis {
  const diff = computeDiff(baseResults, testResults, chunks);

  // Calculate unchanged chunks
  const unchangedChunks =
    chunks.length -
    diff.newlyBlocked.length -
    diff.newlyAllowed.length -
    diff.maskingChanged.length;

  // Determine impact level
  const impactLevel = getImpactLevel(diff.impactScore);

  // Analyze rules
  const baseRules = new Set(baseResults.flatMap((r) => r.matchedRules));
  const testRules = new Set(testResults.flatMap((r) => r.matchedRules));

  const newRulesActivated = [...testRules].filter((r) => !baseRules.has(r));
  const rulesNoLongerActivated = [...baseRules].filter((r) => !testRules.has(r));
  const commonRules = [...testRules].filter((r) => baseRules.has(r));

  // Generate recommendations
  const recommendations = generateRecommendations(diff, impactLevel, {
    newRulesActivated,
    rulesNoLongerActivated,
  });

  return {
    summary: {
      totalChunks: chunks.length,
      unchangedChunks,
      newlyBlockedChunks: diff.newlyBlocked.length,
      newlyAllowedChunks: diff.newlyAllowed.length,
      maskingChangedChunks: diff.maskingChanged.length,
      impactScore: diff.impactScore,
      impactLevel,
    },
    ruleAnalysis: {
      newRulesActivated,
      rulesNoLongerActivated,
      commonRules,
    },
    recommendations,
  };
}

/**
 * Get impact level from score
 */
function getImpactLevel(
  score: number
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (score === 0) return 'none';
  if (score < 0.1) return 'low';
  if (score < 0.3) return 'medium';
  if (score < 0.6) return 'high';
  return 'critical';
}

/**
 * Generate recommendations based on diff analysis
 */
function generateRecommendations(
  diff: PolicyDiff,
  impactLevel: string,
  ruleChanges: {
    newRulesActivated: string[];
    rulesNoLongerActivated: string[];
  }
): string[] {
  const recommendations: string[] = [];

  // High impact recommendations
  if (impactLevel === 'high' || impactLevel === 'critical') {
    recommendations.push(
      'Consider rolling out this policy change gradually using feature flags'
    );
    recommendations.push(
      'Review newly blocked chunks to ensure no false positives'
    );
  }

  // Blocking recommendations
  if (diff.newlyBlocked.length > 0) {
    recommendations.push(
      `${diff.newlyBlocked.length} chunks will be blocked. Verify these are intentional restrictions.`
    );

    if (diff.newlyBlocked.length > 10) {
      recommendations.push(
        'Large number of newly blocked chunks detected. Consider narrowing rule conditions.'
      );
    }
  }

  // Allowing recommendations
  if (diff.newlyAllowed.length > 0) {
    recommendations.push(
      `${diff.newlyAllowed.length} previously blocked chunks will now be allowed. Review for potential data exposure.`
    );
  }

  // Both blocking and allowing
  if (diff.newlyBlocked.length > 0 && diff.newlyAllowed.length > 0) {
    recommendations.push(
      'Policy shows both blocking and unblocking behavior. Review rule priorities to ensure consistent behavior.'
    );
  }

  // Masking recommendations
  if (diff.maskingChanged.length > 0) {
    recommendations.push(
      `${diff.maskingChanged.length} chunks will have different masking. Verify masked content meets compliance requirements.`
    );
  }

  // New rules
  if (ruleChanges.newRulesActivated.length > 0) {
    recommendations.push(
      `New rules activated: ${ruleChanges.newRulesActivated.join(', ')}. Review their conditions and actions.`
    );
  }

  // Removed rules
  if (ruleChanges.rulesNoLongerActivated.length > 0) {
    recommendations.push(
      `Rules no longer activated: ${ruleChanges.rulesNoLongerActivated.join(', ')}. Verify this is intended.`
    );
  }

  // No impact
  if (diff.impactScore === 0) {
    recommendations.push(
      'No impact detected. The test policy produces identical results to the base policy for these queries.'
    );
  }

  return recommendations;
}

// ============================================
// Chunk-Level Diff Details
// ============================================

export interface ChunkDiffDetail {
  chunk: ChunkRef;
  baseAction: string;
  testAction: string;
  changeType: 'blocked' | 'allowed' | 'masking_changed' | 'unchanged';
  baseMatchedRules: string[];
  testMatchedRules: string[];
  baseMaskedContent?: string;
  testMaskedContent?: string;
}

/**
 * Get detailed diff for each chunk
 */
export function getChunkLevelDiff(
  baseResults: EvaluationResult[],
  testResults: EvaluationResult[],
  chunks: ChunkRef[]
): ChunkDiffDetail[] {
  const baseMap = new Map(baseResults.map((r) => [r.chunkId, r]));
  const testMap = new Map(testResults.map((r) => [r.chunkId, r]));

  return chunks.map((chunk) => {
    const baseResult = baseMap.get(chunk.id);
    const testResult = testMap.get(chunk.id);

    if (!baseResult || !testResult) {
      return {
        chunk,
        baseAction: 'unknown',
        testAction: 'unknown',
        changeType: 'unchanged' as const,
        baseMatchedRules: [],
        testMatchedRules: [],
      };
    }

    let changeType: ChunkDiffDetail['changeType'] = 'unchanged';

    if (isAllowedAction(baseResult.action) && testResult.action === 'block') {
      changeType = 'blocked';
    } else if (baseResult.action === 'block' && isAllowedAction(testResult.action)) {
      changeType = 'allowed';
    } else if (hasMaskingChanged(baseResult, testResult)) {
      changeType = 'masking_changed';
    }

    return {
      chunk,
      baseAction: baseResult.action,
      testAction: testResult.action,
      changeType,
      baseMatchedRules: baseResult.matchedRules,
      testMatchedRules: testResult.matchedRules,
      baseMaskedContent: baseResult.maskedContent,
      testMaskedContent: testResult.maskedContent,
    };
  });
}

// ============================================
// Diff Summary Statistics
// ============================================

export interface DiffStatistics {
  totalQueries: number;
  queriesWithImpact: number;
  averageImpact: number;
  medianImpact: number;
  maxImpact: number;
  totalChunksAffected: number;
  chunksByChangeType: {
    blocked: number;
    allowed: number;
    maskingChanged: number;
  };
}

/**
 * Calculate statistics across multiple query diffs
 */
export function calculateDiffStatistics(
  diffs: PolicyDiff[]
): DiffStatistics {
  const impactScores = diffs.map((d) => d.impactScore);
  const sorted = [...impactScores].sort((a, b) => a - b);

  const totalBlocked = diffs.reduce((sum, d) => sum + d.newlyBlocked.length, 0);
  const totalAllowed = diffs.reduce((sum, d) => sum + d.newlyAllowed.length, 0);
  const totalMasking = diffs.reduce((sum, d) => sum + d.maskingChanged.length, 0);

  return {
    totalQueries: diffs.length,
    queriesWithImpact: diffs.filter((d) => d.impactScore > 0).length,
    averageImpact:
      impactScores.length > 0
        ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length
        : 0,
    medianImpact:
      sorted.length > 0
        ? sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)]
        : 0,
    maxImpact: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    totalChunksAffected: totalBlocked + totalAllowed + totalMasking,
    chunksByChangeType: {
      blocked: totalBlocked,
      allowed: totalAllowed,
      maskingChanged: totalMasking,
    },
  };
}
