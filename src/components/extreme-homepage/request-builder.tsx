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
  advanced?: string;
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
  presets?: {
    label?: string;
    fast?: string;
    fastDesc?: string;
    balanced?: string;
    balancedDesc?: string;
    precise?: string;
    preciseDesc?: string;
  };
  datasets?: {
    techDocs?: string;
    legalContracts?: string;
    researchPapers?: string;
  };
}

// Preset configurations to reduce cognitive load (Hick's Law)
type PresetType = "fast" | "balanced" | "precise";

const PRESETS: Record<PresetType, Omit<RequestConfig, "query" | "dataset">> = {
  fast: {
    budgetMs: 200,
    hybridSearch: false,
    rerank: false,
    answerContract: false,
    topK: 3,
  },
  balanced: {
    budgetMs: 500,
    hybridSearch: true,
    rerank: true,
    answerContract: false,
    topK: 5,
  },
  precise: {
    budgetMs: 1500,
    hybridSearch: true,
    rerank: true,
    answerContract: true,
    topK: 10,
  },
};

interface RequestBuilderProps {
  config: RequestConfig;
  onConfigChange: (config: RequestConfig) => void;
  onRun: () => void;
  isLoading: boolean;
  disabled?: boolean;
  compact?: boolean;
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

// Helper to detect current preset from config
function detectPreset(config: RequestConfig): PresetType | null {
  for (const [key, preset] of Object.entries(PRESETS) as [PresetType, typeof PRESETS.fast][]) {
    if (
      config.budgetMs === preset.budgetMs &&
      config.hybridSearch === preset.hybridSearch &&
      config.rerank === preset.rerank &&
      config.answerContract === preset.answerContract &&
      config.topK === preset.topK
    ) {
      return key;
    }
  }
  return null;
}

export function RequestBuilder({
  config,
  onConfigChange,
  onRun,
  isLoading,
  disabled,
  compact = false,
  translations: t,
}: RequestBuilderProps) {
  const [showSampleQueries, setShowSampleQueries] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const idPrefix = useId();
  const queryId = `${idPrefix}-query`;
  const datasetId = `${idPrefix}-dataset`;
  const budgetId = `${idPrefix}-budget`;
  const budgetHelpId = `${idPrefix}-budget-help`;
  const topKId = `${idPrefix}-topk`;
  const topKHelpId = `${idPrefix}-topk-help`;

  // Detect current preset based on config
  const currentPreset = useMemo(() => detectPreset(config), [config]);

  const updateConfig = (updates: Partial<RequestConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const applyPreset = (preset: PresetType) => {
    onConfigChange({ ...config, ...PRESETS[preset] });
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
            className={`w-full border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 resize-none transition-all text-gray-900 placeholder:text-gray-400 ${
              compact ? "px-3 py-2.5 text-sm" : "px-4 py-3"
            }`}
            rows={compact ? 2 : 3}
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

      {/* Preset Selector - Reduces cognitive load per Hick's Law */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t?.presets?.label || "Mode"}
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => applyPreset("fast")}
            className={`rounded-xl border text-left transition-all ${
              currentPreset === "fast"
                ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } ${compact ? "p-2.5" : "p-3"}`}
            disabled={disabled}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <svg className={`w-4 h-4 ${currentPreset === "fast" ? "text-emerald-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className={`text-sm font-medium ${currentPreset === "fast" ? "text-emerald-700" : "text-gray-700"}`}>
                {t?.presets?.fast || "Fast"}
              </span>
            </div>
            {!compact && <p className="text-xs text-gray-500">{t?.presets?.fastDesc || "~200ms, basic"}</p>}
          </button>

          <button
            type="button"
            onClick={() => applyPreset("balanced")}
            className={`rounded-xl border text-left transition-all ${
              currentPreset === "balanced"
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } ${compact ? "p-2.5" : "p-3"}`}
            disabled={disabled}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <svg className={`w-4 h-4 ${currentPreset === "balanced" ? "text-blue-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <span className={`text-sm font-medium ${currentPreset === "balanced" ? "text-blue-700" : "text-gray-700"}`}>
                {t?.presets?.balanced || "Balanced"}
              </span>
            </div>
            {!compact && <p className="text-xs text-gray-500">{t?.presets?.balancedDesc || "~500ms, rerank"}</p>}
          </button>

          <button
            type="button"
            onClick={() => applyPreset("precise")}
            className={`rounded-xl border text-left transition-all ${
              currentPreset === "precise"
                ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } ${compact ? "p-2.5" : "p-3"}`}
            disabled={disabled}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <svg className={`w-4 h-4 ${currentPreset === "precise" ? "text-purple-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span className={`text-sm font-medium ${currentPreset === "precise" ? "text-purple-700" : "text-gray-700"}`}>
                {t?.presets?.precise || "Precise"}
              </span>
            </div>
            {!compact && <p className="text-xs text-gray-500">{t?.presets?.preciseDesc || "~1.5s, full suite"}</p>}
          </button>
        </div>
      </div>

      {/* Advanced Settings Accordion */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t?.advanced || "Advanced"}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Advanced Content */}
        {showAdvanced && (
          <div className="mt-3 p-4 bg-gray-50 rounded-xl space-y-4">
            {/* Dataset Selector */}
            <div>
              <label htmlFor={datasetId} className="block text-sm font-medium text-gray-700 mb-2">
                {t?.dataset || "Dataset"}
              </label>
              <div className="relative">
                <select
                  id={datasetId}
                  value={config.dataset}
                  onChange={(e) => updateConfig({ dataset: e.target.value })}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 bg-white transition-all text-gray-900 text-sm appearance-none cursor-pointer"
                  disabled={disabled}
                >
                  {SAMPLE_DATASETS.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.count})
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Budget Slider */}
            <div>
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
            <div>
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
          </div>
        )}
      </div>

      {/* Feature Toggles */}
      <div className="mb-6 space-y-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t?.features || "Features"}
        </label>

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
          <div>
            <span className="text-sm font-medium text-gray-800">{t?.hybridSearch || "Hybrid Search"}</span>
            {!compact && <p className="text-xs text-gray-500">{t?.hybridSearchDesc || "Combine vector + keyword"}</p>}
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
            {!compact && <p className="text-xs text-gray-500">{t?.rerankDesc || "Re-score with cross-encoder"}</p>}
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
            {!compact && <p className="text-xs text-gray-500">{t?.answerContractDesc || "Validate answer quality"}</p>}
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
      {compact ? (
        <div className="mb-5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600">
          {`${t?.estimatedLatency || "Est. Latency"} ${estimates.latencyP50}ms | ${t?.estimatedCost || "Est. Cost"} $${estimates.costPerRequest.toFixed(4)}`}
        </div>
      ) : (
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
      )}

      {/* Run Button */}
      <button
        onClick={onRun}
        disabled={isLoading || disabled || !config.query.trim()}
        className={`w-full bg-black text-white font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${
          compact ? "py-3.5" : "py-4"
        }`}
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
