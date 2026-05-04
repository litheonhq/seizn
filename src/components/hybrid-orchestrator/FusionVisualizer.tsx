'use client';

/**
 * FusionVisualizer - Visualize how results are merged across strategies
 */

import { useMemo } from 'react';
import type { FusedResult, StrategyType } from '@/lib/hybrid-orchestrator';

interface FusionVisualizerProps {
  fusedResults: FusedResult[];
  strategyResults?: Record<StrategyType, Array<{ id: string; score: number; rank: number }>>;
  fusionMethod: string;
  maxDisplay?: number;
}

const STRATEGY_COLORS: Record<StrategyType, string> = {
  vector: 'bg-blue-500',
  keyword: 'bg-[var(--signal-canon)]',
  multi_query: 'bg-[var(--ink-900)]',
};

const STRATEGY_LABELS: Record<StrategyType, string> = {
  vector: 'Vector',
  keyword: 'Keyword',
  multi_query: 'Multi-Query',
};

export function FusionVisualizer({
  fusedResults,
  strategyResults,
  fusionMethod,
  maxDisplay = 10,
}: FusionVisualizerProps) {
  const displayResults = fusedResults.slice(0, maxDisplay);

  // Find max score for normalization
  const maxScore = useMemo(() => {
    if (displayResults.length === 0) return 1;
    return Math.max(...displayResults.map((r) => r.finalScore));
  }, [displayResults]);

  // Build strategy rank lookup
  const strategyRanks = useMemo(() => {
    const ranks: Record<string, Record<StrategyType, number>> = {};

    if (strategyResults) {
      for (const [strategy, results] of Object.entries(strategyResults)) {
        for (const result of results) {
          if (!ranks[result.id]) {
            ranks[result.id] = {} as Record<StrategyType, number>;
          }
          ranks[result.id][strategy as StrategyType] = result.rank;
        }
      }
    }

    return ranks;
  }, [strategyResults]);

  if (displayResults.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No results to visualize
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {Object.entries(STRATEGY_COLORS).map(([strategy, color]) => (
            <div key={strategy} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${color}`} />
              <span className="text-sm text-[var(--ink-600)]">
                {STRATEGY_LABELS[strategy as StrategyType]}
              </span>
            </div>
          ))}
        </div>
        <span className="text-sm text-[var(--ink-600)]">
          Fusion: {fusionMethod.toUpperCase()}
        </span>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {displayResults.map((result, index) => (
          <FusionResultRow
            key={result.id}
            result={result}
            rank={index + 1}
            maxScore={maxScore}
            strategyRanks={strategyRanks[result.id]}
          />
        ))}
      </div>

      {fusedResults.length > maxDisplay && (
        <p className="text-center text-sm text-gray-400">
          Showing {maxDisplay} of {fusedResults.length} results
        </p>
      )}
    </div>
  );
}

// ============================================
// Result Row Component
// ============================================

interface FusionResultRowProps {
  result: FusedResult;
  rank: number;
  maxScore: number;
  strategyRanks?: Record<StrategyType, number>;
}

function FusionResultRow({
  result,
  rank,
  maxScore,
  strategyRanks,
}: FusionResultRowProps) {
  const normalizedScore = (result.finalScore / maxScore) * 100;

  return (
    <div className="p-4 border border-[var(--ink-200)] rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      <div className="flex items-start gap-4">
        {/* Rank Badge */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[var(--ink-50)] rounded-full">
          <span className="text-sm font-bold text-[var(--ink-600)]">
            {rank}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Strategy Sources */}
          <div className="flex items-center gap-2 mb-2">
            {result.sourceStrategies.map((strategy) => (
              <span
                key={strategy}
                className={`px-2 py-0.5 text-xs text-white rounded-full ${
                  STRATEGY_COLORS[strategy]
                }`}
              >
                {STRATEGY_LABELS[strategy]}
                {strategyRanks?.[strategy] && ` #${strategyRanks[strategy]}`}
              </span>
            ))}
          </div>

          {/* Score Bar */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--ink-900)] to-[var(--ink-900)] rounded-full transition-all duration-300"
                style={{ width: `${normalizedScore}%` }}
              />
            </div>
            <span className="text-sm font-medium text-[var(--ink-600)] w-16 text-right">
              {result.finalScore.toFixed(4)}
            </span>
          </div>

          {/* Result Text */}
          {result.data?.text && (
            <p className="text-sm text-[var(--ink-600)] line-clamp-2">
              {result.data.text}
            </p>
          )}

          {/* Strategy Score Breakdown */}
          {Object.keys(result.strategyScores).length > 0 && (
            <div className="mt-2 flex items-center gap-4">
              {Object.entries(result.strategyScores).map(([strategy, score]) => (
                <div key={strategy} className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      STRATEGY_COLORS[strategy as StrategyType]
                    }`}
                  />
                  <span className="text-xs text-[var(--ink-600)]">
                    {score.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source Count Badge */}
        <div className="flex-shrink-0">
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${
              result.sourceStrategies.length > 1
                ? 'bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] dark:bg-[var(--signal-canon-ink)]/30 dark:text-[var(--signal-canon-soft)]'
                : 'bg-gray-100 text-gray-700 dark:bg-[var(--ink-800)] dark:text-gray-400'
            }`}
          >
            {result.sourceStrategies.length} source
            {result.sourceStrategies.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Score Contribution Chart
// ============================================

interface ScoreContributionChartProps {
  result: FusedResult;
}

export function ScoreContributionChart({ result }: ScoreContributionChartProps) {
  const total = Object.values(result.strategyScores).reduce(
    (sum, score) => sum + score,
    0
  );

  if (total === 0) return null;

  return (
    <div className="flex h-4 rounded-full overflow-hidden">
      {Object.entries(result.strategyScores).map(([strategy, score]) => {

        const percentage = (score / total) * 100;
        return (
          <div
            key={strategy}
            className={`${STRATEGY_COLORS[strategy as StrategyType]} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
            title={`${STRATEGY_LABELS[strategy as StrategyType]}: ${score.toFixed(4)} (${percentage.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

// ============================================
// Fusion Flow Diagram
// ============================================

interface FusionFlowProps {
  strategies: StrategyType[];
  fusionMethod: string;
}

export function FusionFlowDiagram({ strategies, fusionMethod }: FusionFlowProps) {
  return (
    <div className="flex items-center justify-center gap-4 py-6">
      {/* Strategy Nodes */}
      <div className="flex flex-col gap-2">
        {strategies.map((strategy) => (
          <div
            key={strategy}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${
              STRATEGY_COLORS[strategy]
            }`}
          >
            {STRATEGY_LABELS[strategy]}
          </div>
        ))}
      </div>

      {/* Arrows */}
      <div className="flex items-center">
        <svg className="w-12 h-8" viewBox="0 0 48 32">
          {strategies.map((_, index) => (
            <path
              key={index}
              d={`M 0 ${8 + index * 12} L 36 16`}
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              className="text-gray-300 dark:text-gray-600"
            />
          ))}
          <polygon
            points="36,16 42,12 42,20"
            fill="currentColor"
            className="text-gray-300 dark:text-gray-600"
          />
        </svg>
      </div>

      {/* Fusion Node */}
      <div className="px-4 py-3 bg-gradient-to-r from-[var(--ink-900)] to-[var(--ink-900)] rounded-lg text-white">
        <div className="text-xs opacity-75">Fusion</div>
        <div className="text-sm font-medium">{fusionMethod.toUpperCase()}</div>
      </div>

      {/* Arrow to Results */}
      <div className="flex items-center">
        <svg className="w-8 h-8" viewBox="0 0 32 32">
          <path
            d="M 0 16 L 24 16"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            className="text-gray-300 dark:text-gray-600"
          />
          <polygon
            points="24,16 30,12 30,20"
            fill="currentColor"
            className="text-gray-300 dark:text-gray-600"
          />
        </svg>
      </div>

      {/* Results Node */}
      <div className="px-4 py-3 border-2 border-[var(--ink-200)] rounded-lg">
        <div className="text-xs text-[var(--ink-600)]">Fused</div>
        <div className="text-sm font-medium text-[var(--ink-600)]">
          Results
        </div>
      </div>
    </div>
  );
}

export default FusionVisualizer;
