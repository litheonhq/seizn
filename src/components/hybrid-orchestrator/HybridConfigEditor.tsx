'use client';

/**
 * HybridConfigEditor - Configure hybrid retrieval strategies and weights
 */

import { useState, useEffect } from 'react';
import type {
  HybridConfig,
  StrategyConfig,
  FusionMethod,
  StrategyType,
} from '@/lib/hybrid-orchestrator';

interface HybridConfigEditorProps {
  apiKey: string;
  configId?: string;
  collectionId?: string;
  onSave?: (config: HybridConfig) => void;
  onCancel?: () => void;
}

const STRATEGY_TYPES: { value: StrategyType; label: string; description: string }[] = [
  {
    value: 'vector',
    label: 'Vector Search',
    description: 'Semantic similarity using embeddings',
  },
  {
    value: 'keyword',
    label: 'Keyword Search',
    description: 'BM25-based keyword matching',
  },
  {
    value: 'multi_query',
    label: 'Multi-Query',
    description: 'Query expansion with multiple variations',
  },
];

const FUSION_METHODS: { value: FusionMethod; label: string; description: string }[] = [
  {
    value: 'rrf',
    label: 'Reciprocal Rank Fusion',
    description: 'Rank-based fusion, works well in most cases',
  },
  {
    value: 'weighted_sum',
    label: 'Weighted Sum',
    description: 'Score-based fusion with strategy weights',
  },
  {
    value: 'learned',
    label: 'Learned',
    description: 'Weights learned from user feedback',
  },
  {
    value: 'cascade',
    label: 'Cascade',
    description: 'Use fallback strategies when confidence is low',
  },
];

export function HybridConfigEditor({
  apiKey,
  configId,
  collectionId,
  onSave,
  onCancel,
}: HybridConfigEditorProps) {
  const [name, setName] = useState('');
  const [strategies, setStrategies] = useState<StrategyConfig[]>([
    { type: 'vector', weight: 0.7, params: { top_k: 20, threshold: 0.5 } },
    { type: 'keyword', weight: 0.3, params: { top_k: 20 } },
  ]);
  const [fusionMethod, setFusionMethod] = useState<FusionMethod>('rrf');
  const [rrfK, setRrfK] = useState(60);
  const [cascadeThreshold, setCascadeThreshold] = useState(0.8);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(!!configId);

  // Load existing config if editing
  useEffect(() => {
    if (configId) {
      fetchConfig();
    }
  }, [configId]);

  const fetchConfig = async () => {
    try {
      setLoadingConfig(true);
      const response = await fetch(`/api/hybrid/config/${configId}`, {
        headers: { 'x-api-key': apiKey },
      });

      if (!response.ok) {
        throw new Error('Failed to load config');
      }

      const data = await response.json();
      const config = data.config;

      setName(config.name);
      setStrategies(config.strategies);
      setFusionMethod(config.fusionMethod);
      setRrfK(config.rrfK);
      setCascadeThreshold(config.cascadeThreshold);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (strategies.length === 0) {
      setError('At least one strategy is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        name,
        collection_id: collectionId,
        strategies,
        fusion_method: fusionMethod,
        rrf_k: rrfK,
        cascade_threshold: cascadeThreshold,
      };

      let response;
      if (configId) {
        response = await fetch(`/api/hybrid/config/${configId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch('/api/hybrid/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save config');
      }

      const data = await response.json();
      onSave?.(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setLoading(false);
    }
  };

  const addStrategy = () => {
    const usedTypes = new Set(strategies.map((s) => s.type));
    const availableType = STRATEGY_TYPES.find((t) => !usedTypes.has(t.value));

    if (availableType) {
      const newStrategy = {
        type: availableType.value,
        weight: 0.5,
        params:
          availableType.value === 'multi_query'
            ? { top_k: 10, num_expansions: 3, expansion_method: 'synonyms' as const }
            : { top_k: 20 },
      } as StrategyConfig;
      setStrategies([...strategies, newStrategy]);
    }
  };

  const removeStrategy = (index: number) => {
    if (strategies.length > 1) {
      setStrategies(strategies.filter((_, i) => i !== index));
    }
  };

  const updateStrategy = (
    index: number,
    updates: Partial<StrategyConfig>
  ) => {
    const updated = [...strategies];
    updated[index] = { ...updated[index], ...updates } as StrategyConfig;
    setStrategies(updated);
  };

  const normalizeWeights = () => {
    const total = strategies.reduce((sum, s) => sum + s.weight, 0);
    if (total > 0) {
      setStrategies(
        strategies.map((s) => ({
          ...s,
          weight: Math.round((s.weight / total) * 100) / 100,
        }))
      );
    }
  };

  if (loadingConfig) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {configId ? 'Edit Hybrid Config' : 'Create Hybrid Config'}
      </h2>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Config Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., High Recall Config"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Strategies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Retrieval Strategies
          </label>
          <div className="flex gap-2">
            <button
              onClick={normalizeWeights}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Normalize weights
            </button>
            {strategies.length < STRATEGY_TYPES.length && (
              <button
                onClick={addStrategy}
                className="text-xs text-green-600 dark:text-green-400 hover:underline"
              >
                + Add strategy
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {strategies.map((strategy, index) => (
            <StrategyEditor
              key={index}
              strategy={strategy}
              onChange={(updates) => updateStrategy(index, updates)}
              onRemove={() => removeStrategy(index)}
              canRemove={strategies.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Fusion Method */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Fusion Method
        </label>
        <div className="grid grid-cols-2 gap-3">
          {FUSION_METHODS.map((method) => (
            <button
              key={method.value}
              onClick={() => setFusionMethod(method.value)}
              className={`p-3 text-left border rounded-lg transition-colors ${
                fusionMethod === method.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                {method.label}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {method.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Fusion Parameters */}
      {fusionMethod === 'rrf' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            RRF K Parameter
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="100"
              value={rrfK}
              onChange={(e) => setRrfK(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 w-12">
              {rrfK}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Higher values smooth out ranking differences (typical: 60)
          </p>
        </div>
      )}

      {fusionMethod === 'cascade' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cascade Threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={cascadeThreshold}
              onChange={(e) => setCascadeThreshold(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 w-12">
              {cascadeThreshold.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Skip fallback strategies if top result score exceeds this
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : configId ? 'Update Config' : 'Create Config'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Strategy Editor Component
// ============================================

interface StrategyEditorProps {
  strategy: StrategyConfig;
  onChange: (updates: Partial<StrategyConfig>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function StrategyEditor({
  strategy,
  onChange,
  onRemove,
  canRemove,
}: StrategyEditorProps) {
  const strategyInfo = STRATEGY_TYPES.find((t) => t.value === strategy.type);

  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {strategyInfo?.label ?? strategy.type}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {strategyInfo?.description}
          </p>
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500"
            title="Remove strategy"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Weight */}
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Weight
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={strategy.weight}
              onChange={(e) => onChange({ weight: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 w-10">
              {strategy.weight.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Top K */}
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Top K
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={(strategy.params as { top_k?: number }).top_k ?? 20}
            onChange={(e) =>
              onChange({
                params: { ...strategy.params, top_k: parseInt(e.target.value) },
              })
            }
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Vector-specific: Threshold */}
        {strategy.type === 'vector' && (
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Threshold
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={(strategy.params as { threshold?: number }).threshold ?? 0.5}
              onChange={(e) =>
                onChange({
                  params: { ...strategy.params, threshold: parseFloat(e.target.value) },
                })
              }
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}

        {/* Multi-query specific: Num expansions */}
        {strategy.type === 'multi_query' && (
          <>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Expansions
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={
                  (strategy.params as { num_expansions?: number }).num_expansions ?? 3
                }
                onChange={(e) =>
                  onChange({
                    params: {
                      ...strategy.params,
                      num_expansions: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Method
              </label>
              <select
                value={
                  (strategy.params as { expansion_method?: string }).expansion_method ??
                  'synonyms'
                }
                onChange={(e) =>
                  onChange({
                    params: { ...strategy.params, expansion_method: e.target.value as 'llm' | 'synonyms' | 'embedding_nn' },
                  })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="synonyms">Synonyms</option>
                <option value="llm">LLM</option>
                <option value="embedding_nn">Embedding NN</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default HybridConfigEditor;
