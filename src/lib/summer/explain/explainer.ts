/**
 * Explain My Retrieval - Explainer Logic
 *
 * Generates detailed explanations for search results including
 * score breakdowns, matched terms, and ranking reasons.
 */

import { randomUUID } from 'crypto';
import type {
  RetrievalExplanation,
  ScoreBreakdown,
  ScoreComponent,
  ExplainRequest,
  ExplainResponse,
  RankingComparison,
  ComparisonFactor,
} from './types';
import {
  SCORE_TYPE_LABELS,
  SCORE_TYPE_DESCRIPTIONS,
  DEFAULT_EXPLAIN_OPTIONS,
} from './types';
import { analyzeAttribution } from './attribution';
import { generateVisualization } from './visualization';

// ============================================
// Score Analysis
// ============================================

interface ScoreAnalysisInput {
  score: number;
  vectorScore?: number;
  keywordRank?: number;
  searchType: 'vector' | 'keyword' | 'hybrid';
  hybridAlpha?: number;
  rerankScore?: number;
  totalResults: number;
  rank: number;
}

/**
 * Analyze and break down the score components for a search result
 */
export function analyzeScore(input: ScoreAnalysisInput): ScoreBreakdown {
  const components: ScoreComponent[] = [];
  const {
    score,
    vectorScore,
    keywordRank,
    searchType,
    hybridAlpha = 0.7,
    rerankScore,
    totalResults,
    rank,
  } = input;

  // Vector/Cosine similarity component
  if (searchType === 'vector' || searchType === 'hybrid') {
    const cosineValue = vectorScore ?? score;
    components.push({
      type: 'cosine',
      value: cosineValue,
      normalizedValue: cosineValue, // Already 0-1 for cosine
      weight: searchType === 'hybrid' ? hybridAlpha : 1,
      label: 'Cosine Similarity',
      description: `Semantic similarity between query and document embeddings. Value of ${cosineValue.toFixed(3)} indicates ${getCosineSimilarityDescription(cosineValue)}`,
    });
  }

  // BM25/Keyword component
  if (searchType === 'keyword' || searchType === 'hybrid') {
    const keywordScore = keywordRank
      ? 1 / (60 + keywordRank) // RRF formula approximation
      : searchType === 'keyword'
        ? score
        : 0;
    const normalizedKeyword = keywordRank
      ? Math.max(0, 1 - keywordRank / totalResults)
      : keywordScore;

    components.push({
      type: 'bm25',
      value: keywordRank ?? keywordScore,
      normalizedValue: normalizedKeyword,
      weight: searchType === 'hybrid' ? 1 - hybridAlpha : 1,
      label: 'BM25 Keyword Score',
      description: keywordRank
        ? `Ranked #${keywordRank} in keyword search based on term frequency and document length normalization`
        : `BM25 score of ${keywordScore.toFixed(3)} based on keyword matching`,
    });
  }

  // Hybrid RRF component (if applicable)
  if (searchType === 'hybrid' && vectorScore !== undefined && keywordRank !== undefined) {
    components.push({
      type: 'hybrid_rrf',
      value: score,
      normalizedValue: score,
      weight: 1,
      label: 'Hybrid RRF Score',
      description: `Reciprocal Rank Fusion combining vector (rank based on ${vectorScore.toFixed(3)}) and keyword (rank ${keywordRank}) scores with k=60`,
    });
  }

  // Rerank component (if applicable)
  if (rerankScore !== undefined) {
    components.push({
      type: 'rerank',
      value: rerankScore,
      normalizedValue: Math.min(1, Math.max(0, rerankScore)),
      weight: 1,
      label: 'Rerank Score',
      description: `Cross-encoder reranking score of ${rerankScore.toFixed(3)} indicating fine-grained relevance`,
    });
  }

  // Determine combination method
  const combinationMethod: ScoreBreakdown['combinationMethod'] =
    searchType === 'hybrid' ? 'rrf' : rerankScore !== undefined ? 'max' : 'weighted_sum';

  // Calculate relative score (compared to best result)
  const relativeScore = rank === 1 ? 1 : Math.max(0.1, 1 - (rank - 1) * 0.1);

  return {
    finalScore: score,
    components,
    combinationMethod,
    rrfK: searchType === 'hybrid' ? 60 : undefined,
    rank,
    relativeScore,
  };
}

/**
 * Get human-readable description of cosine similarity value
 */
function getCosineSimilarityDescription(value: number): string {
  if (value >= 0.9) return 'very high semantic similarity';
  if (value >= 0.8) return 'high semantic similarity';
  if (value >= 0.7) return 'good semantic similarity';
  if (value >= 0.6) return 'moderate semantic similarity';
  if (value >= 0.5) return 'fair semantic similarity';
  return 'low semantic similarity';
}

// ============================================
// Comparison Analysis
// ============================================

interface ComparisonInput {
  targetResult: {
    chunkId: string;
    score: number;
    vectorScore?: number;
    keywordRank?: number;
    content: string;
    rank: number;
  };
  otherResult: {
    chunkId: string;
    score: number;
    vectorScore?: number;
    keywordRank?: number;
    content: string;
    rank: number;
  };
  query: string;
}

/**
 * Generate comparison between two search results
 */
export function generateComparison(input: ComparisonInput): RankingComparison {
  const { targetResult, otherResult, query } = input;
  const factors: ComparisonFactor[] = [];

  // Compare final scores
  const scoreDiff = targetResult.score - otherResult.score;
  factors.push({
    factor: 'Final Score',
    thisValue: targetResult.score,
    otherValue: otherResult.score,
    difference: scoreDiff,
    impact: scoreDiff > 0 ? 'positive' : scoreDiff < 0 ? 'negative' : 'neutral',
    explanation:
      scoreDiff > 0
        ? `Higher combined score by ${(scoreDiff * 100).toFixed(1)}%`
        : scoreDiff < 0
          ? `Lower combined score by ${(Math.abs(scoreDiff) * 100).toFixed(1)}%`
          : 'Equal combined scores',
  });

  // Compare vector scores if available
  if (targetResult.vectorScore !== undefined && otherResult.vectorScore !== undefined) {
    const vectorDiff = targetResult.vectorScore - otherResult.vectorScore;
    factors.push({
      factor: 'Semantic Similarity',
      thisValue: targetResult.vectorScore,
      otherValue: otherResult.vectorScore,
      difference: vectorDiff,
      impact: vectorDiff > 0 ? 'positive' : vectorDiff < 0 ? 'negative' : 'neutral',
      explanation:
        vectorDiff > 0
          ? `More semantically relevant to the query`
          : vectorDiff < 0
            ? `Less semantically relevant to the query`
            : 'Equal semantic relevance',
    });
  }

  // Compare keyword ranks if available
  if (targetResult.keywordRank !== undefined && otherResult.keywordRank !== undefined) {
    const keywordDiff = otherResult.keywordRank - targetResult.keywordRank; // Lower rank is better
    factors.push({
      factor: 'Keyword Rank',
      thisValue: targetResult.keywordRank,
      otherValue: otherResult.keywordRank,
      difference: keywordDiff,
      impact: keywordDiff > 0 ? 'positive' : keywordDiff < 0 ? 'negative' : 'neutral',
      explanation:
        keywordDiff > 0
          ? `Better keyword match (rank ${targetResult.keywordRank} vs ${otherResult.keywordRank})`
          : keywordDiff < 0
            ? `Weaker keyword match (rank ${targetResult.keywordRank} vs ${otherResult.keywordRank})`
            : 'Equal keyword ranks',
    });
  }

  // Compare content length (can affect relevance)
  const lengthDiff = targetResult.content.length - otherResult.content.length;
  factors.push({
    factor: 'Content Length',
    thisValue: targetResult.content.length,
    otherValue: otherResult.content.length,
    difference: lengthDiff,
    impact: 'neutral', // Length is informational
    explanation: `${targetResult.content.length} vs ${otherResult.content.length} characters`,
  });

  // Generate summary
  const positiveFactors = factors.filter((f) => f.impact === 'positive').length;
  const negativeFactors = factors.filter((f) => f.impact === 'negative').length;

  let summary: string;
  if (targetResult.rank < otherResult.rank) {
    summary = `Ranked higher (#${targetResult.rank} vs #${otherResult.rank}) primarily due to ${positiveFactors} favorable factor${positiveFactors !== 1 ? 's' : ''}.`;
  } else if (targetResult.rank > otherResult.rank) {
    summary = `Ranked lower (#${targetResult.rank} vs #${otherResult.rank}) due to ${negativeFactors} weaker factor${negativeFactors !== 1 ? 's' : ''}.`;
  } else {
    summary = 'Same ranking position with equal overall relevance.';
  }

  return {
    comparedToId: otherResult.chunkId,
    comparedToRank: otherResult.rank,
    factors,
    summary,
  };
}

// ============================================
// Main Explainer
// ============================================

interface ExplainerOptions {
  includeComparisons?: boolean;
  includeVisualization?: boolean;
  maxComparisons?: number;
  embeddingModel?: string;
  rerankModel?: string;
}

/**
 * Generate explanations for search results
 */
export async function explainRetrieval(
  request: ExplainRequest,
  options: ExplainerOptions = {}
): Promise<ExplainResponse> {
  const startTime = Date.now();
  const {
    includeComparisons = DEFAULT_EXPLAIN_OPTIONS.includeComparisons,
    includeVisualization = DEFAULT_EXPLAIN_OPTIONS.includeVisualization,
    maxComparisons = DEFAULT_EXPLAIN_OPTIONS.maxComparisons,
    embeddingModel = 'voyage-3',
    rerankModel,
  } = options;

  const { query, collectionId, results, searchOptions, resultIds } = request;

  // Filter results if specific IDs requested
  const resultsToExplain = resultIds
    ? results.filter((r) => resultIds.includes(r.chunkId))
    : results;

  const queryId = `qry_${randomUUID().replace(/-/g, '').substring(0, 24)}`;
  const explanations: RetrievalExplanation[] = [];
  const visualizations: Record<string, ReturnType<typeof generateVisualization>> = {};

  // Process each result
  for (let i = 0; i < resultsToExplain.length; i++) {
    const result = resultsToExplain[i];
    const rank = i + 1;

    // Analyze score breakdown
    const scoreBreakdown = analyzeScore({
      score: result.score,
      vectorScore: result.vectorScore,
      keywordRank: result.keywordRank,
      searchType: searchOptions?.searchType || 'hybrid',
      hybridAlpha: searchOptions?.hybridAlpha,
      totalResults: results.length,
      rank,
    });

    // Analyze attribution
    const attribution = await analyzeAttribution({
      query,
      chunkId: result.chunkId,
      documentId: result.documentId,
      content: result.content,
      metadata: result.metadata,
      vectorScore: result.vectorScore,
      keywordRank: result.keywordRank,
    });

    // Generate comparisons with other results
    const comparisons: RankingComparison[] = [];
    if (includeComparisons) {
      const otherResults = results.filter((r) => r.chunkId !== result.chunkId);
      const comparisonTargets = otherResults.slice(0, maxComparisons);

      for (const other of comparisonTargets) {
        const otherRank = results.findIndex((r) => r.chunkId === other.chunkId) + 1;
        const comparison = generateComparison({
          targetResult: { ...result, rank },
          otherResult: { ...other, rank: otherRank },
          query,
        });
        comparisons.push(comparison);
      }
    }

    // Build explanation
    const explanation: RetrievalExplanation = {
      id: `exp_${randomUUID().replace(/-/g, '').substring(0, 24)}`,
      query,
      queryId,
      collectionId,
      timestamp: new Date(),
      result: {
        chunkId: result.chunkId,
        documentId: result.documentId,
        content: result.content,
        rank,
      },
      scoreBreakdown,
      attribution,
      comparisons,
      searchConfig: {
        searchType: searchOptions?.searchType || 'hybrid',
        topK: results.length,
        threshold: searchOptions?.threshold,
        hybridAlpha: searchOptions?.hybridAlpha,
        rerankEnabled: searchOptions?.rerankEnabled || false,
      },
      processingInfo: {
        embeddingModel,
        rerankModel,
        latencyMs: Date.now() - startTime,
      },
    };

    explanations.push(explanation);

    // Generate visualization if requested
    if (includeVisualization) {
      visualizations[result.chunkId] = generateVisualization({
        explanation,
        query,
        content: result.content,
      });
    }
  }

  return {
    success: true,
    queryId,
    explanations,
    visualizations: includeVisualization ? visualizations : undefined,
    meta: {
      totalResults: results.length,
      explainedResults: explanations.length,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a concise summary explanation for a single result
 */
export function generateSummaryExplanation(explanation: RetrievalExplanation): string {
  const { scoreBreakdown, attribution, comparisons, searchConfig } = explanation;
  const parts: string[] = [];

  // Score summary
  parts.push(
    `Ranked #${scoreBreakdown.rank} with ${(scoreBreakdown.finalScore * 100).toFixed(1)}% relevance score.`
  );

  // Main relevance reason
  parts.push(attribution.relevanceReason);

  // Key matches
  if (attribution.matchedTerms.length > 0) {
    const topMatches = attribution.matchedTerms.slice(0, 3).map((m) => `"${m.term}"`);
    parts.push(`Key matches: ${topMatches.join(', ')}.`);
  }

  // Comparison highlight
  if (comparisons.length > 0 && scoreBreakdown.rank === 1) {
    const topFactor = comparisons[0]?.factors.find((f) => f.impact === 'positive');
    if (topFactor) {
      parts.push(`Best result due to ${topFactor.factor.toLowerCase()}.`);
    }
  }

  return parts.join(' ');
}

/**
 * Format score for display
 */
export function formatScore(score: number, type: 'percentage' | 'decimal' | 'rank'): string {
  switch (type) {
    case 'percentage':
      return `${(score * 100).toFixed(1)}%`;
    case 'decimal':
      return score.toFixed(4);
    case 'rank':
      return `#${Math.round(score)}`;
    default:
      return score.toString();
  }
}

export default explainRetrieval;
