"use client";

export interface CostBreakdown {
  embedding: number;
  vectorSearch: number;
  rerank: number;
  answerContract: number;
  total: number;
  tokensIn: number;
  tokensOut: number;
  queryUnits: number;
}

export interface CostPanelTranslations {
  calculating?: string;
  noCost?: string;
  costBreakdown?: string;
  component?: string;
  cost?: string;
  embedding?: string;
  vectorSearch?: string;
  rerank?: string;
  answerContract?: string;
  total?: string;
  usage?: string;
  tokensIn?: string;
  tokensOut?: string;
  queryUnits?: string;
  estimatedMonthly?: string;
  basedOn?: string;
  queriesPerDay?: string;
}

interface CostPanelProps {
  cost: CostBreakdown | null;
  isLoading: boolean;
  translations?: CostPanelTranslations;
}

export function CostPanel({ cost, isLoading, translations: t }: CostPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
        <svg className="animate-spin w-8 h-8 mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm">{t?.calculating || "Calculating costs..."}</p>
      </div>
    );
  }

  if (!cost) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">{t?.noCost || "Run a query to see cost breakdown"}</p>
      </div>
    );
  }

  const costItems = [
    { label: t?.embedding || "Embedding", value: cost.embedding, color: "bg-blue-500" },
    { label: t?.vectorSearch || "Vector Search", value: cost.vectorSearch, color: "bg-purple-500" },
    { label: t?.rerank || "Rerank", value: cost.rerank, color: "bg-amber-500" },
    { label: t?.answerContract || "Answer Contract", value: cost.answerContract, color: "bg-rose-500" },
  ].filter(item => item.value > 0);

  // Calculate monthly estimate (assuming 1000 queries/day)
  const dailyQueries = 1000;
  const monthlyEstimate = cost.total * dailyQueries * 30;

  return (
    <div className="space-y-6 h-full overflow-auto max-h-[calc(100%-2rem)]">
      {/* Total Cost Card */}
      <div className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
        <div className="text-sm text-emerald-600 mb-1">{t?.total || "Total Cost"}</div>
        <div className="text-4xl font-bold text-emerald-700">
          ${cost.total.toFixed(6)}
        </div>
        <div className="text-xs text-emerald-500 mt-2">
          {t?.basedOn || "Per query"}
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">
          {t?.costBreakdown || "Cost Breakdown"}
        </h3>
        <div className="space-y-3">
          {costItems.map((item, index) => {
            const percentage = cost.total > 0 ? (item.value / cost.total) * 100 : 0;
            return (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${item.value.toFixed(6)}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Usage Stats */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">
          {t?.usage || "Usage"}
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">
              {cost.tokensIn.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">{t?.tokensIn || "Tokens In"}</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">
              {cost.tokensOut.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">{t?.tokensOut || "Tokens Out"}</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">
              {cost.queryUnits.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">{t?.queryUnits || "Query Units"}</div>
          </div>
        </div>
      </div>

      {/* Monthly Estimate */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">{t?.estimatedMonthly || "Estimated Monthly"}</div>
            <div className="text-xs text-gray-400">
              {t?.basedOn || "Based on"} {dailyQueries.toLocaleString()} {t?.queriesPerDay || "queries/day"}
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ${monthlyEstimate.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
