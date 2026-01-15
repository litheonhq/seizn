"use client";

import { useState, useMemo, useId } from "react";


export interface RequestConfig {
  query: string;
  dataset: string;
  budgetMs: number;
  hybridSearch: boolean;
  rerank: boolean;
  answerContract: boolean;
  topK: number;
}

export interface RequestBuilderTranslations {
  title?: string;
  query?: string;
  queryPlaceholder?: string;
  tryExamples?: string;
  dataset?: string;
  latencyBudget?: string;
  fast?: string;
  thorough?: string;
  topK?: string;
  results?: string;
  features?: string;
  hybridSearch?: string;
  hybridSearchDesc?: string;
  rerank?: string;
  rerankDesc?: string;
  answerContract?: string;
  answerContractDesc?: string;
  running?: string;
  runQuery?: string;
  estimatedLatency?: string;
  estimatedCost?: string;
  p50?: string;
  p95?: string;
  perRequest?: string;
  per1000?: string;
  datasets?: {
    techDocs?: string;
    legalContracts?: string;
    researchPapers?: string;
  };
}

interface RequestBuilderProps {
  config: RequestConfig;
  onConfigChange: (config: RequestConfig) => void;
  onRun: () => void;
  isLoading: boolean;
  disabled?: boolean;
  translations?: RequestBuilderTranslations;
}

// Curated example queries that always return results
const SAMPLE_QUERIES = [
  "How to authenticate API requests with Bearer tokens?",
  "Configure autopilot for hybrid search optimization",
  "What tracing data does Summer collect for debugging?",
];

// Estimate latency and cost based on configuration
function estimateLatencyAndCost(config: RequestConfig): {
  latencyP50: number;
  latencyP95: number;
  costPerRequest: number;
  costPer1000: number;
} {
  // Base latency in ms
  let baseLatency = 50;

  // Add latency for features
  if (config.hybridSearch) baseLatency += 30;
  if (config.rerank) baseLatency += 80;
  if (config.answerContract) baseLatency += 40;

  // Adjust for topK
  baseLatency += config.topK * 2;

  // Cap at budget
  const latencyP50 = Math.min(baseLatency, config.budgetMs * 0.7);
  const latencyP95 = Math.min(baseLatency * 1.4, config.budgetMs * 0.95);

  // Base cost per request in USD
  let baseCost = 0.0001;

  // Add cost for features
  if (config.hybridSearch) baseCost += 0.0002;
  if (config.rerank) baseCost += 0.0008;
  if (config.answerContract) baseCost += 0.0005;

  // Adjust for topK
  baseCost += config.topK * 0.00002;

  return {
    latencyP50: Math.round(latencyP50),
    latencyP95: Math.round(latencyP95),
    costPerRequest: baseCost,
    costPer1000: baseCost * 1000,
  };
}

export function RequestBuilder({
  config,
  onConfigChange,
  onRun,
  isLoading,
  disabled,
  translations: t,
}: RequestBuilderProps) {
  const [showSampleQueries, setShowSampleQueries] = useState(false);
  const idPrefix = useId();
  const queryId = `${idPrefix}-query`;
  const datasetId = `${idPrefix}-dataset`;
  const budgetId = `${idPrefix}-budget`;
  const budgetHelpId = `${idPrefix}-budget-help`;
  const topKId = `${idPrefix}-topk`;
  const topKHelpId = `${idPrefix}-topk-help`;


  const updateConfig = (updates: Partial<RequestConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  // Calculate estimated latency and cost in real-time
  const estimates = useMemo(() => estimateLatencyAndCost(config), [config]);

  const SAMPLE_DATASETS = [
    { id: "tech-docs", name: t?.datasets?.techDocs || "Tech Documentation", count: "2.4K docs" },
    { id: "legal-contracts", name: t?.datasets?.legalContracts || "Legal Contracts", count: "850 docs" },
    { id: "research-papers", name: t?.datasets?.researchPapers || "Research Papers", count: "1.2K docs" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Query Input */}
      <div className="mb-4">
        <label htmlFor={queryId} className="block text-sm font-medium text-gray-700 mb-2">
          {t?.query || "Query"}
        </label>
        <div className="relative">
          <textarea
            id={queryId}
            value={config.query}
            onChange={(e) => updateConfig({ query: e.target.value })}
            placeholder={t?.queryPlaceholder || "Enter your search query..."}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 resize-none transition-all text-gray-900 placeholder:text-gray-400"
            rows={3}
            disabled={disabled}
          />

          <button
            type="button"
            onClick={() => setShowSampleQueries(!showSampleQueries)}
            className="absolute right-3 bottom-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {t?.tryExamples || "Try examples"}
          </button>
        </div>
        {showSampleQueries && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
            {SAMPLE_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => {
                  updateConfig({ query: q });
                  setShowSampleQueries(false);
                }}
                className="block w-full text-left text-sm text-gray-600 hover:text-black hover:bg-white px-3 py-2 rounded-lg transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dataset Selector */}
      <div className="mb-4">
        <label htmlFor={datasetId} className="block text-sm font-medium text-gray-700 mb-2">
          {t?.dataset || "Dataset"}
        </label>
        <div className="relative">
          <select
            id={datasetId}
            value={config.dataset}
            onChange={(e) => updateConfig({ dataset: e.target.value })}
            className="w-full px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 bg-white transition-all text-gray-900 appearance-none cursor-pointer"
            disabled={disabled}
          >

            {SAMPLE_DATASETS.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.name} ({ds.count})
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Budget Slider */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor={budgetId} className="text-sm font-medium text-gray-700">
            {t?.latencyBudget || "Latency Budget"}
          </label>

          <span className="text-sm text-gray-500">{config.budgetMs}ms</span>
        </div>
        <input
          id={budgetId}
          type="range"
          min={50}
          max={2000}
          step={50}
          value={config.budgetMs}
          onChange={(e) => updateConfig({ budgetMs: Number(e.target.value) })}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
          aria-describedby={budgetHelpId}
          disabled={disabled}
        />
        <div id={budgetHelpId} className="flex justify-between text-xs text-gray-400 mt-1">

          <span>50ms ({t?.fast || "fast"})</span>
          <span>2000ms ({t?.thorough || "thorough"})</span>
        </div>
      </div>

      {/* Top K */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor={topKId} className="text-sm font-medium text-gray-700">{t?.topK || "Top K"}</label>

          <span className="text-sm text-gray-500">{config.topK} {t?.results || "results"}</span>
        </div>
        <input
          id={topKId}
          type="range"
          min={1}
          max={20}
          value={config.topK}
          onChange={(e) => updateConfig({ topK: Number(e.target.value) })}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
          aria-describedby={topKHelpId}
          disabled={disabled}
        />
        <div id={topKHelpId} className="sr-only">
          {t?.topK || "Top K"}
        </div>

      </div>

      {/* Feature Toggles */}
      <div className="mb-6 space-y-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t?.features || "Features"}
        </label>

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
          <div>
            <span className="text-sm font-medium text-gray-800">{t?.hybridSearch || "Hybrid Search"}</span>
            <p className="text-xs text-gray-500">{t?.hybridSearchDesc || "Combine vector + keyword"}</p>
          </div>
          <input
            type="checkbox"
            checked={config.hybridSearch}
            onChange={(e) => updateConfig({ hybridSearch: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-black focus:ring-black/20 accent-black"
            disabled={disabled}
          />
        </label>

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
          <div>
            <span className="text-sm font-medium text-gray-800">{t?.rerank || "Rerank"}</span>
            <p className="text-xs text-gray-500">{t?.rerankDesc || "Re-score with cross-encoder"}</p>
          </div>
          <input
            type="checkbox"
            checked={config.rerank}
            onChange={(e) => updateConfig({ rerank: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-black focus:ring-black/20 accent-black"
            disabled={disabled}
          />
        </label>

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
          <div>
            <span className="text-sm font-medium text-gray-800">{t?.answerContract || "Answer Contract"}</span>
            <p className="text-xs text-gray-500">{t?.answerContractDesc || "Validate answer quality"}</p>
          </div>
          <input
            type="checkbox"
            checked={config.answerContract}
            onChange={(e) => updateConfig({ answerContract: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-black focus:ring-black/20 accent-black"
            disabled={disabled}
          />
        </label>
      </div>

      {/* Estimated Latency & Cost Preview */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Latency Card */}
        <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-blue-800">
              {t?.estimatedLatency || "Est. Latency"}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-blue-600">{t?.p50 || "p50"}</span>
              <span className="text-lg font-bold text-blue-900">{estimates.latencyP50}ms</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-blue-600">{t?.p95 || "p95"}</span>
              <span className="text-sm font-medium text-blue-700">{estimates.latencyP95}ms</span>
            </div>
          </div>
        </div>

        {/* Cost Card */}
        <div className="p-3 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-emerald-800">
              {t?.estimatedCost || "Est. Cost"}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-emerald-600">{t?.perRequest || "/req"}</span>
              <span className="text-lg font-bold text-emerald-900">${estimates.costPerRequest.toFixed(4)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-emerald-600">{t?.per1000 || "/1K"}</span>
              <span className="text-sm font-medium text-emerald-700">${estimates.costPer1000.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Run Button */}
      <button
        onClick={onRun}
        disabled={isLoading || disabled || !config.query.trim()}
        className="w-full py-4 bg-black text-white font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t?.running || "Running..."}
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t?.runQuery || "Run Query"}
          </>
        )}
      </button>
    </div>
  );
}
