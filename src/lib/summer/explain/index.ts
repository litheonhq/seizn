/**
 * Explain My Retrieval - Module Exports
 *
 * Provides functionality for explaining search results including
 * score breakdowns, source attributions, and visualizations.
 */

// Types
export type {
  // Score types
  ScoreType,
  ScoreComponent,
  ScoreBreakdown,
  // Attribution types
  MatchedTerm,
  SemanticMatch,
  AttributionInfo,
  // Comparison types
  ComparisonFactor,
  RankingComparison,
  // Explanation types
  RetrievalExplanation,
  // Visualization types
  ScoreVisualization,
  HighlightSpan,
  PassageVisualization,
  ExplanationVisualization,
  // API types
  ExplainRequest,
  ExplainResponse,
  StoredExplanation,
} from './types';

// Constants
export {
  SCORE_TYPE_LABELS,
  SCORE_TYPE_DESCRIPTIONS,
  MATCH_TYPE_COLORS,
  DEFAULT_EXPLAIN_OPTIONS,
} from './types';

// Explainer functions
export {
  explainRetrieval,
  analyzeScore,
  generateComparison,
  generateSummaryExplanation,
  formatScore,
} from './explainer';

// Attribution functions
export {
  analyzeAttribution,
  analyzeAttributionBatch,
} from './attribution';

// Visualization functions
export {
  generateVisualization,
  generateVisualizationBatch,
  generateScoreVisualization,
  generateRadarVisualization,
  generatePassageVisualization,
  generateRankingFlow,
  generateComparisonMatrix,
  passageToHtml,
} from './visualization';

// Default export
export { default } from './explainer';
