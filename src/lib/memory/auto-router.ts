/**
 * Auto Router for Memory Search
 *
 * Automatically selects the best search strategy based on query characteristics:
 * - slot: For deterministic lookups (name, preferences, settings)
 * - keyword: For short, noun-based queries
 * - hybrid: For ambiguous or important queries
 * - vector: For semantic, long-form queries
 *
 * Benefits:
 * - Reduces unnecessary embedding API calls
 * - Improves response latency
 * - Lowers costs
 */

export type SearchMode = 'slot' | 'keyword' | 'hybrid' | 'vector' | 'auto';

export interface RouterDecision {
  strategy: Exclude<SearchMode, 'auto'>;
  confidence: number;
  reason: string;
  skipEmbedding: boolean;
  suggestedParams: {
    topK: number;
    threshold: number;
    useCache: boolean;
  };
}

// Slot patterns - deterministic queries that should use KV lookup
const SLOT_PATTERNS = [
  // Personal info
  /^(my|the|what('?s)?)\s*(name|email|phone|job|title|position|role|company|organization)/i,
  /^(who\s+am\s+i|what\s+do\s+i\s+do)/i,
  // Preferences
  /^(my|the|what('?s)?)\s*(preference|favorite|preferred|setting|config)/i,
  /^(what|how)\s+(do\s+)?i\s+(like|prefer|want|use)/i,
  // Restrictions/rules
  /^(my|the|what('?s)?)\s*(restriction|rule|forbidden|prohibited|banned|avoid|금지|선호|설정)/i,
  /^(what|which)\s+(should\s+)?i\s+(avoid|not\s+do|never)/i,
  // Account/profile
  /^(my|the|what('?s)?)\s*(account|profile|subscription|plan|tier)/i,
  // Direct slot queries
  /^(get|show|what\s+is)\s+(my\s+)?(user|profile|preference|setting)/i,
];

// Keyword patterns - short, noun-based queries
const KEYWORD_PATTERNS = [
  // Very short queries (1-3 words, mostly nouns)
  /^[\w가-힣]+(\s+[\w가-힣]+){0,2}$/,
  // Code/technical terms
  /^(api|sdk|cli|url|uri|http|json|xml|sql|db|auth|oauth|jwt|sse|rpc|grpc|rest)/i,
  // File/path patterns
  /\.(ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|sql|sh|bash)$/i,
  // Error codes
  /^(error|err|exception|bug|issue|problem)\s*[:_-]?\s*\w+/i,
  // Version queries
  /^v?\d+\.\d+(\.\d+)?/,
];

// Semantic patterns - queries that benefit from vector search
const SEMANTIC_PATTERNS = [
  // Questions
  /^(what|why|how|when|where|who|which|can|could|should|would|is|are|do|does|did)/i,
  // Explanation requests
  /(explain|describe|tell\s+me|help\s+me\s+understand)/i,
  // Comparison/analysis
  /(compare|difference|between|vs|versus|similar|like)/i,
  // Long queries (>50 chars usually semantic)
  /.{50,}/,
  // Korean question patterns
  /[?？]/,
  /(무엇|왜|어떻게|언제|어디|누가|어느|할\s*수|해야|인가요?|입니까?)/,
];

/**
 * Analyze query and determine best search strategy
 */
export function routeQuery(query: string): RouterDecision {
  const normalizedQuery = query.trim();
  const queryLength = normalizedQuery.length;
  const wordCount = normalizedQuery.split(/\s+/).length;

  // 1. Check for slot patterns (highest priority for deterministic data)
  for (const pattern of SLOT_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        strategy: 'slot',
        confidence: 0.9,
        reason: 'Query matches slot pattern for deterministic lookup',
        skipEmbedding: true,
        suggestedParams: {
          topK: 5,
          threshold: 0.5,
          useCache: true,
        },
      };
    }
  }

  // 2. Check for keyword patterns (short, specific queries)
  if (wordCount <= 3 && queryLength < 30) {
    for (const pattern of KEYWORD_PATTERNS) {
      if (pattern.test(normalizedQuery)) {
        return {
          strategy: 'keyword',
          confidence: 0.85,
          reason: 'Short query with keyword/code pattern',
          skipEmbedding: true,
          suggestedParams: {
            topK: 10,
            threshold: 0.3,
            useCache: true,
          },
        };
      }
    }

    // Very short queries default to keyword
    if (wordCount <= 2) {
      return {
        strategy: 'keyword',
        confidence: 0.7,
        reason: 'Very short query, keyword search preferred',
        skipEmbedding: true,
        suggestedParams: {
          topK: 10,
          threshold: 0.3,
          useCache: true,
        },
      };
    }
  }

  // 3. Check for semantic patterns (questions, long queries)
  for (const pattern of SEMANTIC_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      // For questions, use hybrid for best accuracy
      if (/^(what|why|how|when|where|who|which)/i.test(normalizedQuery)) {
        return {
          strategy: 'hybrid',
          confidence: 0.8,
          reason: 'Question query benefits from hybrid search',
          skipEmbedding: false,
          suggestedParams: {
            topK: 10,
            threshold: 0.6,
            useCache: true,
          },
        };
      }

      // Long semantic queries use vector
      if (queryLength > 50) {
        return {
          strategy: 'vector',
          confidence: 0.85,
          reason: 'Long semantic query, vector search optimal',
          skipEmbedding: false,
          suggestedParams: {
            topK: 10,
            threshold: 0.7,
            useCache: true,
          },
        };
      }
    }
  }

  // 4. Medium-length queries (ambiguous) -> hybrid for safety
  if (wordCount >= 3 && wordCount <= 8) {
    return {
      strategy: 'hybrid',
      confidence: 0.65,
      reason: 'Medium-length query, hybrid search for coverage',
      skipEmbedding: false,
      suggestedParams: {
        topK: 10,
        threshold: 0.6,
        useCache: true,
      },
    };
  }

  // 5. Default: vector search for semantic understanding
  return {
    strategy: 'vector',
    confidence: 0.6,
    reason: 'Default to vector search for semantic matching',
    skipEmbedding: false,
    suggestedParams: {
      topK: 10,
      threshold: 0.7,
      useCache: true,
    },
  };
}

/**
 * Check if a query should use slot lookup
 * Returns the slot key if applicable, null otherwise
 */
export function extractSlotKey(query: string): string | null {
  const patterns: [RegExp, string][] = [
    [/^(my|the|what('?s)?)\s*name/i, 'user.name'],
    [/^(my|the|what('?s)?)\s*(email|e-mail)/i, 'user.email'],
    [/^(my|the|what('?s)?)\s*(job|title|position|role)/i, 'user.job_title'],
    [/^(my|the|what('?s)?)\s*(company|organization|org)/i, 'user.company'],
    [/^(my|the|what('?s)?)\s*(phone|tel|mobile)/i, 'user.phone'],
    [/^(my|the|what('?s)?)\s*(timezone|time\s*zone)/i, 'user.timezone'],
    [/^(my|the|what('?s)?)\s*(language|lang|locale)/i, 'user.language'],
    [/^(my|the|what('?s)?)\s*(preferred|favorite)\s*(language|lang)/i, 'preference.language'],
    [/^(my|the|what('?s)?)\s*(preferred|favorite)\s*(theme|mode)/i, 'preference.theme'],
    [/^(my|the|what('?s)?)\s*(restriction|forbidden|avoid|금지)/i, 'restriction.general'],
  ];

  for (const [pattern, slotKey] of patterns) {
    if (pattern.test(query.trim())) {
      return slotKey;
    }
  }

  return null;
}

/**
 * Get routing statistics for monitoring
 */
export function getRouterStats(decisions: RouterDecision[]): {
  slotCount: number;
  keywordCount: number;
  hybridCount: number;
  vectorCount: number;
  embeddingsSaved: number;
  avgConfidence: number;
} {
  const stats = {
    slotCount: 0,
    keywordCount: 0,
    hybridCount: 0,
    vectorCount: 0,
    embeddingsSaved: 0,
    avgConfidence: 0,
  };

  if (decisions.length === 0) return stats;

  let totalConfidence = 0;

  for (const decision of decisions) {
    switch (decision.strategy) {
      case 'slot':
        stats.slotCount++;
        break;
      case 'keyword':
        stats.keywordCount++;
        break;
      case 'hybrid':
        stats.hybridCount++;
        break;
      case 'vector':
        stats.vectorCount++;
        break;
    }

    if (decision.skipEmbedding) {
      stats.embeddingsSaved++;
    }

    totalConfidence += decision.confidence;
  }

  stats.avgConfidence = totalConfidence / decisions.length;

  return stats;
}
