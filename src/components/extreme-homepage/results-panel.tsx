"use client";

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  rerankScore?: number;
  metadata?: Record<string, unknown>;
}

export interface ResultsPanelTranslations {
  searching?: string;
  noResults?: string;
  score?: string;
}

interface ResultsPanelProps {
  results: SearchResult[];
  isLoading: boolean;
  showRerankDelta: boolean;
  translations?: ResultsPanelTranslations;
}

export function ResultsPanel({ results, isLoading, showRerankDelta, translations: t }: ResultsPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-[var(--ink-500)]">
        <svg className="animate-spin w-8 h-8 mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm">{t?.searching || "Searching..."}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-[var(--ink-500)]">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm">{t?.noResults || "Run a query to see results"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-auto h-full max-h-[calc(100%-2rem)] pr-2">
      {results.map((result, index) => (
        <ResultCard
          key={result.id}
          result={result}
          rank={index + 1}
          showRerankDelta={showRerankDelta}
          scoreLabel={t?.score}
        />
      ))}
    </div>
  );
}

interface ResultCardProps {
  result: SearchResult;
  rank: number;
  showRerankDelta: boolean;
  scoreLabel?: string;
}

function ResultCard({ result, rank, showRerankDelta, scoreLabel }: ResultCardProps) {
  const scorePercent = Math.round(result.score * 100);
  const rerankDelta = result.rerankScore
    ? Math.round((result.rerankScore - result.score) * 100)
    : null;

  return (
    <div className="p-4 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-xl hover:border-[var(--ink-200)] hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 bg-[var(--ink-50)] rounded-full flex items-center justify-center text-xs font-medium text-[var(--ink-600)]">
            {rank}
          </span>
          <h4 className="font-medium text-[var(--ink-900)] text-sm line-clamp-1">
            {result.title}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {/* Score Badge */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--ink-600)]">{scoreLabel || "Score"}:</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              scorePercent >= 80
                ? "bg-[var(--ink-900)]/10 text-[var(--ink-900)]"
                : scorePercent >= 60
                ? "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)]"
                : "bg-[var(--ink-50)] text-[var(--ink-600)]"
            }`}>
              {scorePercent}%
            </span>
          </div>

          {/* Rerank Delta */}
          {showRerankDelta && rerankDelta !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              rerankDelta > 0
                ? "bg-[var(--ink-900)]/10 text-[var(--ink-900)]"
                : rerankDelta < 0
                ? "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]"
                : "bg-[var(--ink-50)] text-[var(--ink-600)]"
            }`}>
              {rerankDelta > 0 ? "+" : ""}{rerankDelta}%
            </span>
          )}
        </div>
      </div>

      {/* Content Preview */}
      <p className="text-sm text-[var(--ink-600)] line-clamp-3 leading-relaxed">
        {result.content}
      </p>

      {/* Metadata */}
      {result.metadata && Object.keys(result.metadata).length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--ink-200)]">
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.metadata).slice(0, 3).map(([key, value]) => (
              <span
                key={key}
                className="text-xs bg-[var(--ink-50)] text-[var(--ink-600)] px-2 py-1 rounded"
              >
                {key}: {String(value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
