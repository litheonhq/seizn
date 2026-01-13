/**
 * Explain My Retrieval - Type Definitions
 *
 * Types for explaining search results, score breakdowns,
 * and source attributions.
 */

// ============================================
// Score Types
// ============================================

export type ScoreType =
  | 'cosine'
  | 'bm25'
  | 'hybrid_rrf'
  | 'rerank'
  | 'semantic'
  | 'keyword_match';

export interface ScoreComponent {
  /** Score type identifier */
  type: ScoreType;
  /** Raw score value */
  value: number;
  /** Normalized score (0-1) */
  normalizedValue: number;
  /** Weight applied in final calculation */
  weight: number;
  /** Human-readable label */
  label: string;
  /** Detailed description of what this score represents */
  description: string;
}

export interface ScoreBreakdown {
  /** Final combined score */
  finalScore: number;
  /** Individual score components */
  components: ScoreComponent[];
  /** How components were combined */
  combinationMethod: 'weighted_sum' | 'rrf' | 'max' | 'harmonic_mean';
  /** RRF constant (k) if applicable */
  rrfK?: number;
  /** Rank position in result set */
  rank: number;
  /** Score relative to best result (0-1) */
  relativeScore: number;
}

// ============================================
// Attribution Types
// ============================================

export interface MatchedTerm {
  /** The matched term/phrase */
  term: string;
  /** Location in the chunk content */
  positions: Array<{
    start: number;
    end: number;
  }>;
  /** Type of match */
  matchType: 'exact' | 'stem' | 'synonym' | 'semantic';
  /** Contribution to score */
  contribution: number;
  /** Original query term that matched */
  queryTerm?: string;
}

export interface SemanticMatch {
  /** Query phrase that matched */
  queryPhrase: string;
  /** Matched passage in the chunk */
  matchedPassage: string;
  /** Semantic similarity score */
  similarity: number;
  /** Start/end positions in chunk */
  position: {
    start: number;
    end: number;
  };
  /** Why this is considered a match */
  reason: string;
}

export interface AttributionInfo {
  /** Chunk ID */
  chunkId: string;
  /** Parent document ID */
  documentId: string;
  /** Document title if available */
  documentTitle?: string;
  /** Source URL or path */
  source?: string;
  /** Page number if applicable */
  page?: number;
  /** Section/heading hierarchy */
  sections?: string[];
  /** Exact text match terms */
  matchedTerms: MatchedTerm[];
  /** Semantic/contextual matches */
  semanticMatches: SemanticMatch[];
  /** Overall relevance explanation */
  relevanceReason: string;
  /** Confidence in the attribution */
  confidence: number;
  /** Metadata from the chunk */
  metadata?: Record<string, unknown>;
}

// ============================================
// Comparison Types
// ============================================

export interface ComparisonFactor {
  /** Factor name */
  factor: string;
  /** This result's value */
  thisValue: number | string;
  /** Comparison target's value */
  otherValue: number | string;
  /** Difference in numeric terms */
  difference?: number;
  /** Impact on ranking */
  impact: 'positive' | 'negative' | 'neutral';
  /** Explanation of the comparison */
  explanation: string;
}

export interface RankingComparison {
  /** Compared result ID */
  comparedToId: string;
  /** Compared result's rank */
  comparedToRank: number;
  /** Factors explaining the ranking difference */
  factors: ComparisonFactor[];
  /** Overall explanation */
  summary: string;
}

// ============================================
// Retrieval Explanation
// ============================================

export interface RetrievalExplanation {
  /** Unique explanation ID */
  id: string;
  /** Query that was searched */
  query: string;
  /** Query ID for reference */
  queryId: string;
  /** Collection ID searched */
  collectionId: string;
  /** Timestamp of the search */
  timestamp: Date;
  /** Result being explained */
  result: {
    chunkId: string;
    documentId: string;
    content: string;
    rank: number;
  };
  /** Score breakdown */
  scoreBreakdown: ScoreBreakdown;
  /** Source attribution */
  attribution: AttributionInfo;
  /** Comparison with other results */
  comparisons: RankingComparison[];
  /** Search configuration used */
  searchConfig: {
    searchType: 'vector' | 'keyword' | 'hybrid';
    topK: number;
    threshold?: number;
    hybridAlpha?: number;
    rerankEnabled: boolean;
  };
  /** Processing metadata */
  processingInfo: {
    embeddingModel: string;
    rerankModel?: string;
    latencyMs: number;
  };
}

// ============================================
// Visualization Types
// ============================================

export interface ScoreVisualization {
  /** Chart type for rendering */
  chartType: 'bar' | 'radar' | 'waterfall';
  /** Data points for the chart */
  dataPoints: Array<{
    label: string;
    value: number;
    color: string;
    tooltip: string;
  }>;
  /** Axis labels */
  axisLabels: {
    x?: string;
    y?: string;
  };
  /** Legend entries */
  legend: Array<{
    label: string;
    color: string;
  }>;
}

export interface HighlightSpan {
  /** Start position in text */
  start: number;
  /** End position in text */
  end: number;
  /** Highlight type */
  type: 'exact_match' | 'semantic_match' | 'keyword' | 'entity';
  /** Color or style class */
  style: string;
  /** Hover tooltip content */
  tooltip: string;
  /** Importance score (for intensity) */
  importance: number;
}

export interface PassageVisualization {
  /** Original text content */
  text: string;
  /** Highlight spans to apply */
  highlights: HighlightSpan[];
  /** Summary of matches */
  matchSummary: {
    exactMatches: number;
    semanticMatches: number;
    totalCoverage: number; // % of text that matched
  };
}

export interface ExplanationVisualization {
  /** Score visualization data */
  scoreViz: ScoreVisualization;
  /** Passage with highlights */
  passageViz: PassageVisualization;
  /** Ranking flow visualization */
  rankingFlow: Array<{
    stage: string;
    rank: number;
    score: number;
    eliminated: boolean;
  }>;
  /** Comparison matrix */
  comparisonMatrix?: {
    factors: string[];
    results: Array<{
      id: string;
      rank: number;
      values: number[];
    }>;
  };
}

// ============================================
// API Types
// ============================================

export interface ExplainRequest {
  /** Search query */
  query: string;
  /** Collection ID */
  collectionId: string;
  /** Specific result IDs to explain (optional, explains all if not provided) */
  resultIds?: string[];
  /** Search results to explain */
  results: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
    vectorScore?: number;
    keywordRank?: number;
  }>;
  /** Search options used */
  searchOptions?: {
    searchType: 'vector' | 'keyword' | 'hybrid';
    hybridAlpha?: number;
    threshold?: number;
    rerankEnabled?: boolean;
  };
  /** Include comparison with other results */
  includeComparisons?: boolean;
  /** Include visualization data */
  includeVisualization?: boolean;
}

export interface ExplainResponse {
  success: boolean;
  /** Query ID for future reference */
  queryId: string;
  /** Explanations for each result */
  explanations: RetrievalExplanation[];
  /** Visualization data if requested */
  visualizations?: Record<string, ExplanationVisualization>;
  /** Processing metadata */
  meta: {
    totalResults: number;
    explainedResults: number;
    processingTimeMs: number;
  };
}

export interface StoredExplanation {
  id: string;
  queryId: string;
  userId: string;
  collectionId: string;
  query: string;
  explanations: RetrievalExplanation[];
  visualizations?: Record<string, ExplanationVisualization>;
  createdAt: Date;
  expiresAt: Date;
}

// ============================================
// Constants
// ============================================

export const SCORE_TYPE_LABELS: Record<ScoreType, string> = {
  cosine: 'Cosine Similarity',
  bm25: 'BM25 Keyword Score',
  hybrid_rrf: 'Hybrid RRF Score',
  rerank: 'Rerank Score',
  semantic: 'Semantic Similarity',
  keyword_match: 'Keyword Match',
};

export const SCORE_TYPE_DESCRIPTIONS: Record<ScoreType, string> = {
  cosine: 'Measures angular similarity between query and document embeddings',
  bm25: 'TF-IDF based keyword matching algorithm',
  hybrid_rrf: 'Reciprocal Rank Fusion combining vector and keyword scores',
  rerank: 'Neural cross-encoder re-ranking score',
  semantic: 'Deep semantic understanding beyond keyword matching',
  keyword_match: 'Direct keyword/phrase matching',
};

export const MATCH_TYPE_COLORS: Record<MatchedTerm['matchType'], string> = {
  exact: '#22c55e', // green
  stem: '#3b82f6', // blue
  synonym: '#8b5cf6', // purple
  semantic: '#f59e0b', // amber
};

export const DEFAULT_EXPLAIN_OPTIONS = {
  includeComparisons: true,
  includeVisualization: true,
  maxComparisons: 3,
  explanationTTL: 24 * 60 * 60 * 1000, // 24 hours
};
