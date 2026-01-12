import type { RetrievalConfig } from './types';

/**
 * Default retrieval knobs by plan.
 *
 * NOTE: keep these conservative at first.
 * Autopilot can later override using live signals.
 */
export const PLAN_RETRIEVAL_DEFAULTS: Record<string, RetrievalConfig> = {
  free: {
    mode: 'hybrid',
    topK: 6,
    threshold: 0.5,
    searchEf: 24,
    rerank: false,
    rerankTopN: 0,
    keywordWeight: 0.35,
    vectorWeight: 0.65,
  },
  plus: {
    mode: 'hybrid',
    topK: 10,
    threshold: 0.45,
    searchEf: 32,
    rerank: true,
    rerankTopN: 10,
    keywordWeight: 0.3,
    vectorWeight: 0.7,
  },
  pro: {
    mode: 'hybrid',
    topK: 16,
    threshold: 0.4,
    searchEf: 40,
    rerank: true,
    rerankTopN: 20,
    keywordWeight: 0.25,
    vectorWeight: 0.75,
  },
  enterprise: {
    mode: 'hybrid',
    topK: 20,
    threshold: 0.35,
    searchEf: 60,
    rerank: true,
    rerankTopN: 30,
    keywordWeight: 0.2,
    vectorWeight: 0.8,
  },
};

export function getPlanDefaults(plan: string): RetrievalConfig {
  return PLAN_RETRIEVAL_DEFAULTS[plan] ?? PLAN_RETRIEVAL_DEFAULTS.free;
}
