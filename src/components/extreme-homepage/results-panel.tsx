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
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
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
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
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
    <div className="p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
            {rank}
          </span>
          <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
            {result.title}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {/* Score Badge */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">{scoreLabel || "Score"}:</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              scorePercent >= 80
                ? "bg-emerald-100 text-emerald-700"
                : scorePercent >= 60
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {scorePercent}%
            </span>
          </div>

          {/* Rerank Delta */}
          {showRerankDelta && rerankDelta !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              rerankDelta > 0
                ? "bg-emerald-50 text-emerald-600"
                : rerankDelta < 0
                ? "bg-red-50 text-red-600"
                : "bg-gray-50 text-gray-500"
            }`}>
              {rerankDelta > 0 ? "+" : ""}{rerankDelta}%
            </span>
          )}
        </div>
      </div>

      {/* Content Preview */}
      <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">
        {result.content}
      </p>

      {/* Metadata */}
      {result.metadata && Object.keys(result.metadata).length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.metadata).slice(0, 3).map(([key, value]) => (
              <span
                key={key}
                className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded"
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
