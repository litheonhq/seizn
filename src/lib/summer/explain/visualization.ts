/**
 * Explain My Retrieval - Visualization Data Generator
 *
 * Generates structured data for visualizing search result explanations
 * including score charts, passage highlights, and ranking flows.
 */

import type {
  RetrievalExplanation,
  ExplanationVisualization,
  ScoreVisualization,
  PassageVisualization,
  HighlightSpan,
  MATCH_TYPE_COLORS,
} from './types';

// ============================================
// Color Palettes
// ============================================

const SCORE_COLORS = {
  cosine: '#3b82f6', // blue
  bm25: '#22c55e', // green
  hybrid_rrf: '#8b5cf6', // purple
  rerank: '#f59e0b', // amber
  semantic: '#ec4899', // pink
  keyword_match: '#06b6d4', // cyan
};

const HIGHLIGHT_COLORS = {
  exact_match: 'bg-green-200 dark:bg-green-900',
  semantic_match: 'bg-amber-200 dark:bg-amber-900',
  keyword: 'bg-blue-200 dark:bg-blue-900',
  entity: 'bg-purple-200 dark:bg-purple-900',
};

const RANKING_STAGE_COLORS = {
  initial: '#6b7280', // gray
  vector: '#3b82f6', // blue
  keyword: '#22c55e', // green
  hybrid: '#8b5cf6', // purple
  rerank: '#f59e0b', // amber
  final: '#ef4444', // red
};

// ============================================
// Score Visualization
// ============================================

interface ScoreVizInput {
  explanation: RetrievalExplanation;
}

/**
 * Generate score visualization data for charts
 */
export function generateScoreVisualization(input: ScoreVizInput): ScoreVisualization {
  const { explanation } = input;
  const { scoreBreakdown } = explanation;

  // Generate bar chart data points
  const dataPoints = scoreBreakdown.components.map((component) => ({
    label: component.label,
    value: component.normalizedValue * component.weight,
    color: SCORE_COLORS[component.type] || '#6b7280',
    tooltip: `${component.label}: ${(component.normalizedValue * 100).toFixed(1)}% (weight: ${(component.weight * 100).toFixed(0)}%)\n${component.description}`,
  }));

  // Add final score
  dataPoints.push({
    label: 'Final Score',
    value: scoreBreakdown.finalScore,
    color: '#1f2937',
    tooltip: `Combined score: ${(scoreBreakdown.finalScore * 100).toFixed(1)}%\nRank: #${scoreBreakdown.rank}`,
  });

  // Generate legend
  const legend = scoreBreakdown.components.map((component) => ({
    label: component.label,
    color: SCORE_COLORS[component.type] || '#6b7280',
  }));

  return {
    chartType: 'bar',
    dataPoints,
    axisLabels: {
      x: 'Score Components',
      y: 'Contribution (%)',
    },
    legend,
  };
}

/**
 * Generate radar chart data for multi-dimensional score view
 */
export function generateRadarVisualization(
  explanations: RetrievalExplanation[]
): ScoreVisualization {
  // Collect all unique score types
  const scoreTypes = new Set<string>();
  explanations.forEach((exp) => {
    exp.scoreBreakdown.components.forEach((c) => scoreTypes.add(c.type));
  });

  // Generate data points for each result
  const dataPoints = explanations.map((exp, i) => ({
    label: `Result #${exp.result.rank}`,
    value: exp.scoreBreakdown.finalScore,
    color: `hsl(${(i * 60) % 360}, 70%, 50%)`,
    tooltip: `${exp.result.content.substring(0, 50)}...\nScore: ${(exp.scoreBreakdown.finalScore * 100).toFixed(1)}%`,
  }));

  return {
    chartType: 'radar',
    dataPoints,
    axisLabels: {},
    legend: Array.from(scoreTypes).map((type, i) => ({
      label: type,
      color: Object.values(SCORE_COLORS)[i % Object.values(SCORE_COLORS).length],
    })),
  };
}

// ============================================
// Passage Visualization
// ============================================

interface PassageVizInput {
  content: string;
  explanation: RetrievalExplanation;
  query: string;
}

/**
 * Generate passage visualization with highlights
 */
export function generatePassageVisualization(input: PassageVizInput): PassageVisualization {
  const { content, explanation, query } = input;
  const { attribution } = explanation;
  const highlights: HighlightSpan[] = [];

  // Add highlights for matched terms
  for (const term of attribution.matchedTerms) {
    for (const pos of term.positions) {
      highlights.push({
        start: pos.start,
        end: pos.end,
        type: term.matchType === 'exact' ? 'exact_match' : 'keyword',
        style:
          term.matchType === 'exact'
            ? HIGHLIGHT_COLORS.exact_match
            : HIGHLIGHT_COLORS.keyword,
        tooltip: `${term.matchType === 'exact' ? 'Exact' : 'Stemmed'} match for "${term.queryTerm}"\nContribution: ${(term.contribution * 100).toFixed(1)}%`,
        importance: term.contribution,
      });
    }
  }

  // Add highlights for semantic matches
  for (const match of attribution.semanticMatches) {
    highlights.push({
      start: match.position.start,
      end: match.position.end,
      type: 'semantic_match',
      style: HIGHLIGHT_COLORS.semantic_match,
      tooltip: `Semantic match: "${match.queryPhrase}"\nSimilarity: ${(match.similarity * 100).toFixed(1)}%\n${match.reason}`,
      importance: match.similarity,
    });
  }

  // Sort highlights by start position
  highlights.sort((a, b) => a.start - b.start);

  // Merge overlapping highlights (keep the more important one)
  const mergedHighlights = mergeOverlappingHighlights(highlights);

  // Calculate match summary
  const totalHighlightedChars = mergedHighlights.reduce(
    (sum, h) => sum + (h.end - h.start),
    0
  );

  return {
    text: content,
    highlights: mergedHighlights,
    matchSummary: {
      exactMatches: attribution.matchedTerms.filter((m) => m.matchType === 'exact').length,
      semanticMatches: attribution.semanticMatches.length,
      totalCoverage: Math.min(100, (totalHighlightedChars / content.length) * 100),
    },
  };
}

/**
 * Merge overlapping highlight spans
 */
function mergeOverlappingHighlights(highlights: HighlightSpan[]): HighlightSpan[] {
  if (highlights.length === 0) return [];

  const merged: HighlightSpan[] = [];
  let current = { ...highlights[0] };

  for (let i = 1; i < highlights.length; i++) {
    const next = highlights[i];

    // Check for overlap
    if (next.start <= current.end) {
      // Merge: keep the one with higher importance
      if (next.importance > current.importance) {
        current = {
          ...next,
          start: Math.min(current.start, next.start),
          end: Math.max(current.end, next.end),
        };
      } else {
        current.end = Math.max(current.end, next.end);
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

// ============================================
// Ranking Flow Visualization
// ============================================

interface RankingFlowInput {
  explanation: RetrievalExplanation;
  totalResults: number;
}

/**
 * Generate ranking flow visualization showing how result moved through stages
 */
export function generateRankingFlow(
  input: RankingFlowInput
): ExplanationVisualization['rankingFlow'] {
  const { explanation, totalResults } = input;
  const { scoreBreakdown, searchConfig } = explanation;
  const flow: ExplanationVisualization['rankingFlow'] = [];

  // Initial stage (all results)
  flow.push({
    stage: 'Initial',
    rank: totalResults, // Starts in pool
    score: 0,
    eliminated: false,
  });

  // Vector search stage
  if (searchConfig.searchType === 'vector' || searchConfig.searchType === 'hybrid') {
    const vectorComponent = scoreBreakdown.components.find((c) => c.type === 'cosine');
    if (vectorComponent) {
      const vectorRank = Math.ceil(
        (1 - vectorComponent.normalizedValue) * totalResults
      );
      flow.push({
        stage: 'Vector Search',
        rank: Math.max(1, vectorRank),
        score: vectorComponent.normalizedValue,
        eliminated: false,
      });
    }
  }

  // Keyword search stage
  if (searchConfig.searchType === 'keyword' || searchConfig.searchType === 'hybrid') {
    const keywordComponent = scoreBreakdown.components.find((c) => c.type === 'bm25');
    if (keywordComponent) {
      flow.push({
        stage: 'Keyword Search',
        rank: Math.round(keywordComponent.value) || scoreBreakdown.rank,
        score: keywordComponent.normalizedValue,
        eliminated: false,
      });
    }
  }

  // Hybrid fusion stage
  if (searchConfig.searchType === 'hybrid') {
    const hybridComponent = scoreBreakdown.components.find((c) => c.type === 'hybrid_rrf');
    flow.push({
      stage: 'Hybrid Fusion',
      rank: scoreBreakdown.rank,
      score: hybridComponent?.normalizedValue || scoreBreakdown.finalScore,
      eliminated: false,
    });
  }

  // Rerank stage
  if (searchConfig.rerankEnabled) {
    const rerankComponent = scoreBreakdown.components.find((c) => c.type === 'rerank');
    flow.push({
      stage: 'Rerank',
      rank: scoreBreakdown.rank,
      score: rerankComponent?.normalizedValue || scoreBreakdown.finalScore,
      eliminated: false,
    });
  }

  // Final stage
  flow.push({
    stage: 'Final',
    rank: scoreBreakdown.rank,
    score: scoreBreakdown.finalScore,
    eliminated: false,
  });

  return flow;
}

// ============================================
// Comparison Matrix
// ============================================

interface ComparisonMatrixInput {
  explanations: RetrievalExplanation[];
}

/**
 * Generate comparison matrix for multiple results
 */
export function generateComparisonMatrix(
  input: ComparisonMatrixInput
): ExplanationVisualization['comparisonMatrix'] {
  const { explanations } = input;

  if (explanations.length < 2) return undefined;

  // Define factors to compare
  const factors = [
    'Final Score',
    'Cosine Similarity',
    'BM25 Score',
    'Term Matches',
    'Semantic Matches',
    'Confidence',
  ];

  // Generate values for each result
  const results = explanations.map((exp) => {
    const cosine = exp.scoreBreakdown.components.find((c) => c.type === 'cosine');
    const bm25 = exp.scoreBreakdown.components.find((c) => c.type === 'bm25');

    return {
      id: exp.result.chunkId,
      rank: exp.result.rank,
      values: [
        exp.scoreBreakdown.finalScore * 100,
        (cosine?.normalizedValue || 0) * 100,
        (bm25?.normalizedValue || 0) * 100,
        exp.attribution.matchedTerms.length,
        exp.attribution.semanticMatches.length,
        exp.attribution.confidence * 100,
      ],
    };
  });

  return {
    factors,
    results,
  };
}

// ============================================
// Main Visualization Generator
// ============================================

interface VisualizationInput {
  explanation: RetrievalExplanation;
  query: string;
  content: string;
}

/**
 * Generate complete visualization data for an explanation
 */
export function generateVisualization(input: VisualizationInput): ExplanationVisualization {
  const { explanation, query, content } = input;

  // Generate score visualization
  const scoreViz = generateScoreVisualization({ explanation });

  // Generate passage visualization
  const passageViz = generatePassageVisualization({ content, explanation, query });

  // Generate ranking flow
  const rankingFlow = generateRankingFlow({
    explanation,
    totalResults: explanation.searchConfig.topK,
  });

  return {
    scoreViz,
    passageViz,
    rankingFlow,
    comparisonMatrix: undefined, // Set when batch processing
  };
}

/**
 * Generate visualizations for multiple explanations
 */
export function generateVisualizationBatch(
  explanations: RetrievalExplanation[],
  query: string
): Record<string, ExplanationVisualization> {
  const visualizations: Record<string, ExplanationVisualization> = {};

  // Generate individual visualizations
  for (const explanation of explanations) {
    visualizations[explanation.result.chunkId] = generateVisualization({
      explanation,
      query,
      content: explanation.result.content,
    });
  }

  // Add comparison matrix to first visualization
  if (explanations.length >= 2 && visualizations[explanations[0].result.chunkId]) {
    visualizations[explanations[0].result.chunkId].comparisonMatrix =
      generateComparisonMatrix({ explanations });
  }

  return visualizations;
}

// ============================================
// HTML Generation Helpers
// ============================================

/**
 * Convert passage visualization to HTML with highlights
 */
export function passageToHtml(passageViz: PassageVisualization): string {
  const { text, highlights } = passageViz;

  if (highlights.length === 0) {
    return escapeHtml(text);
  }

  let html = '';
  let lastEnd = 0;

  for (const highlight of highlights) {
    // Add text before this highlight
    if (highlight.start > lastEnd) {
      html += escapeHtml(text.substring(lastEnd, highlight.start));
    }

    // Add highlighted text
    const highlightedText = text.substring(highlight.start, highlight.end);
    html += `<mark class="${highlight.style}" title="${escapeHtml(highlight.tooltip)}">${escapeHtml(highlightedText)}</mark>`;

    lastEnd = highlight.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    html += escapeHtml(text.substring(lastEnd));
  }

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default generateVisualization;
