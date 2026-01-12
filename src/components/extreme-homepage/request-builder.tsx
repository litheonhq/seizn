"use client";

import { useState } from "react";

export interface RequestConfig {
  query: string;
  dataset: string;
  budgetMs: number;
  hybridSearch: boolean;
  rerank: boolean;
  answerContract: boolean;
  topK: number;
}

interface RequestBuilderProps {
  config: RequestConfig;
  onConfigChange: (config: RequestConfig) => void;
  onRun: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

const SAMPLE_DATASETS = [
  { id: "tech-docs", name: "Tech Documentation", count: "2.4K docs" },
  { id: "legal-contracts", name: "Legal Contracts", count: "850 docs" },
  { id: "research-papers", name: "Research Papers", count: "1.2K docs" },
];

const SAMPLE_QUERIES = [
  "How do I implement authentication with JWT?",
  "What are the best practices for error handling?",
  "Explain the difference between REST and GraphQL",
];

export function RequestBuilder({
  config,
  onConfigChange,
  onRun,
  isLoading,
  disabled,
}: RequestBuilderProps) {
  const [showSampleQueries, setShowSampleQueries] = useState(false);

  const updateConfig = (updates: Partial<RequestConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Query Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Query
        </label>
        <div className="relative">
          <textarea
            value={config.query}
            onChange={(e) => updateConfig({ query: e.target.value })}
            placeholder="Enter your search query..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 resize-none transition-all"
            rows={3}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => setShowSampleQueries(!showSampleQueries)}
            className="absolute right-3 bottom-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Try examples
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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Dataset
        </label>
        <select
          value={config.dataset}
          onChange={(e) => updateConfig({ dataset: e.target.value })}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 bg-white transition-all"
          disabled={disabled}
        >
          {SAMPLE_DATASETS.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {ds.name} ({ds.count})
            </option>
          ))}
        </select>
      </div>

      {/* Budget Slider */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            Latency Budget
          </label>
          <span className="text-sm text-gray-500">{config.budgetMs}ms</span>
        </div>
        <input
          type="range"
          min={50}
          max={2000}
          step={50}
          value={config.budgetMs}
          onChange={(e) => updateConfig({ budgetMs: Number(e.target.value) })}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
          disabled={disabled}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>50ms (fast)</span>
          <span>2000ms (thorough)</span>
        </div>
      </div>

      {/* Top K */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Top K</label>
          <span className="text-sm text-gray-500">{config.topK} results</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={config.topK}
          onChange={(e) => updateConfig({ topK: Number(e.target.value) })}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
          disabled={disabled}
        />
      </div>

      {/* Feature Toggles */}
      <div className="mb-6 space-y-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Features
        </label>

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
          <div>
            <span className="text-sm font-medium text-gray-800">Hybrid Search</span>
            <p className="text-xs text-gray-500">Combine vector + keyword</p>
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
            <span className="text-sm font-medium text-gray-800">Rerank</span>
            <p className="text-xs text-gray-500">Re-score with cross-encoder</p>
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
            <span className="text-sm font-medium text-gray-800">Answer Contract</span>
            <p className="text-xs text-gray-500">Validate answer quality</p>
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
            Running...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Query
          </>
        )}
      </button>
    </div>
  );
}
