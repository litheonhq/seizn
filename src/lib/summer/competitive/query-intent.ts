export type CompetitiveSearchType = 'semantic' | 'keyword' | 'hybrid';

export type CompetitiveIntent =
  | 'fact_lookup'
  | 'code_lookup'
  | 'how_to'
  | 'analysis'
  | 'open_question';

export interface QueryIntentDecision {
  intent: CompetitiveIntent;
  confidence: number;
  recommendedSearchType: CompetitiveSearchType;
  topKMultiplier: number;
  reason: string;
}

const FACT_LOOKUP_PATTERNS: RegExp[] = [
  /^(what is|who is|when is|where is)\b/i,
  /^(정의|뜻|의미|누구|언제|어디)\b/,
  /\b(id|uuid|email|version|status)\b/i,
];

const CODE_LOOKUP_PATTERNS: RegExp[] = [
  /\b(api|sdk|rpc|endpoint|http|json|sql|schema|migration|stacktrace)\b/i,
  /[`'"][\w./-]+\.(ts|tsx|js|jsx|py|go|md|sql|json)[`'"]/i,
  /(^| )error[: ]/i,
];

const HOW_TO_PATTERNS: RegExp[] = [
  /^(how to|how do i|best way to)\b/i,
  /^(어떻게|방법|절차|가이드)\b/,
  /\b(steps|guide|playbook|tutorial)\b/i,
];

const ANALYSIS_PATTERNS: RegExp[] = [
  /\b(compare|tradeoff|pros and cons|benchmark|analyze)\b/i,
  /\b(비교|장단점|분석|최적화)\b/,
];

function isShortQuery(query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  return tokens.length <= 3 || query.trim().length <= 24;
}

export function inferQueryIntent(
  query: string,
  fallbackSearchType: CompetitiveSearchType
): QueryIntentDecision {
  const normalized = query.trim();

  if (normalized.length === 0) {
    return {
      intent: 'open_question',
      confidence: 0.4,
      recommendedSearchType: fallbackSearchType,
      topKMultiplier: 1,
      reason: 'Empty query, fallback strategy',
    };
  }

  if (isShortQuery(normalized) && FACT_LOOKUP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      intent: 'fact_lookup',
      confidence: 0.82,
      recommendedSearchType: 'keyword',
      topKMultiplier: 1,
      reason: 'Short deterministic lookup pattern',
    };
  }

  if (CODE_LOOKUP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      intent: 'code_lookup',
      confidence: 0.84,
      recommendedSearchType: 'hybrid',
      topKMultiplier: 1.2,
      reason: 'Code or API syntax pattern detected',
    };
  }

  if (HOW_TO_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      intent: 'how_to',
      confidence: 0.78,
      recommendedSearchType: 'hybrid',
      topKMultiplier: 1.4,
      reason: 'Procedural question likely needs broader recall',
    };
  }

  if (ANALYSIS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      intent: 'analysis',
      confidence: 0.76,
      recommendedSearchType: 'hybrid',
      topKMultiplier: 1.5,
      reason: 'Comparative query benefits from diversified evidence',
    };
  }

  if (normalized.length >= 80) {
    return {
      intent: 'open_question',
      confidence: 0.74,
      recommendedSearchType: 'semantic',
      topKMultiplier: 1.3,
      reason: 'Long semantic query favors dense retrieval',
    };
  }

  return {
    intent: 'open_question',
    confidence: 0.62,
    recommendedSearchType: fallbackSearchType,
    topKMultiplier: 1.1,
    reason: 'No strong pattern, use fallback with slight recall boost',
  };
}

