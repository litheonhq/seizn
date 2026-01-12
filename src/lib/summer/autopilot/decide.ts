import { getPlanDefaults } from '../config';
import type { RetrievalConfig, RetrieveParams } from '../types';

function looksLikeKeywordQuery(query: string): boolean {
  // If the query contains quoted phrases, symbols, file paths, or is very short,
  // keyword/hybrid generally outperforms pure vector search.
  const q = query.trim();
  if (q.length <= 18) return true;
  if (q.includes('"') || q.includes("'") || q.includes('`')) return true;
  if (/[\/\\]/.test(q)) return true; // paths
  if (q.includes('::') || q.includes('=>')) return true;
  if (/[A-Z]{2,}/.test(q)) return true; // acronyms
  return false;
}

function looksLikeLongSemanticQuery(query: string): boolean {
  const q = query.trim();
  return q.length >= 80;
}

export function decideRetrievalConfig(params: Pick<RetrieveParams, 'plan' | 'query'>): {
  config: RetrievalConfig;
  reason: string;
} {
  const defaults = getPlanDefaults(params.plan);
  const q = params.query;

  // Start from plan defaults
  const config: RetrievalConfig = { ...defaults };

  // Heuristic overrides
  if (looksLikeKeywordQuery(q)) {
    config.mode = 'hybrid';
    config.keywordWeight = Math.max(config.keywordWeight, 0.35);
    config.vectorWeight = 1 - config.keywordWeight;
    return { config, reason: 'autopilot:keyword_like_query' };
  }

  if (looksLikeLongSemanticQuery(q)) {
    config.mode = 'vector';
    config.threshold = Math.max(0.45, config.threshold);
    config.searchEf = Math.max(config.searchEf, 40);
    return { config, reason: 'autopilot:long_semantic_query' };
  }

  // Default
  return { config, reason: 'autopilot:plan_defaults' };
}
