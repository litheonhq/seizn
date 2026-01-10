// Seizn Spring - Smart Model Recommender
// Analyzes queries and recommends optimal AI models

import type { AIModel } from './types';

export interface ModelRecommendation {
  model: AIModel;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  alternatives: Array<{
    model: AIModel;
    reason: string;
  }>;
  queryType: QueryType;
}

export type QueryType =
  | 'code'
  | 'reasoning'
  | 'creative'
  | 'roleplay'
  | 'vision'
  | 'long_context'
  | 'simple'
  | 'general';

// Keywords and patterns for query classification
const QUERY_PATTERNS: Record<QueryType, { keywords: string[]; patterns: RegExp[] }> = {
  code: {
    keywords: [
      'code', 'function', 'debug', 'error', 'bug', 'implement', 'programming',
      'javascript', 'python', 'typescript', 'react', 'api', 'database', 'sql',
      'algorithm', 'refactor', 'optimize', 'deploy', 'build', 'compile',
      '코드', '함수', '디버그', '버그', '구현', '프로그래밍', '개발', '에러',
    ],
    patterns: [
      /```[\s\S]*```/,
      /\b(function|const|let|var|class|def|import|from)\b/i,
      /(fix|write|create|modify)\s+(the\s+)?(code|function|script)/i,
    ],
  },
  reasoning: {
    keywords: [
      'why', 'explain', 'reason', 'because', 'analyze', 'think', 'step',
      'logic', 'proof', 'math', 'calculate', 'solve', 'derive',
      '왜', '설명', '이유', '분석', '논리', '증명', '계산', '수학',
    ],
    patterns: [
      /step[\s-]?by[\s-]?step/i,
      /explain\s+(why|how)/i,
      /think\s+(through|about)/i,
      /what\s+is\s+the\s+reason/i,
    ],
  },
  creative: {
    keywords: [
      'write', 'story', 'poem', 'creative', 'imagine', 'compose', 'draft',
      'blog', 'article', 'essay', 'script', 'dialogue', 'narrative',
      '작성', '글', '스토리', '소설', '시', '창작', '에세이', '블로그',
    ],
    patterns: [
      /write\s+(a|an|me)\s+(story|poem|blog|article|essay)/i,
      /create\s+(a|an)\s+(story|narrative|script)/i,
    ],
  },
  roleplay: {
    keywords: [
      'roleplay', 'character', 'persona', 'pretend', 'act', 'play',
      'dialogue', 'conversation', 'scenario', 'imagine you are',
      '롤플레이', '캐릭터', '연기', '역할', '대화', '시나리오',
    ],
    patterns: [
      /act\s+as\s+(a|an)?/i,
      /pretend\s+(to\s+be|you.?re)/i,
      /you\s+are\s+(now\s+)?(a|an)/i,
      /roleplay\s+as/i,
      /in\s+character/i,
    ],
  },
  vision: {
    keywords: [
      'image', 'picture', 'photo', 'see', 'look', 'visual', 'describe',
      'screenshot', 'diagram', 'chart', 'graph',
      '이미지', '사진', '그림', '화면', '스크린샷', '차트',
    ],
    patterns: [
      /what\s+(do\s+you\s+see|is\s+in\s+this)/i,
      /describe\s+(this|the)\s+(image|picture|photo)/i,
      /look\s+at\s+(this|the)/i,
    ],
  },
  long_context: {
    keywords: [
      'document', 'file', 'pdf', 'book', 'chapter', 'paper', 'research',
      'summarize', 'entire', 'full', 'complete', 'whole',
      '문서', '파일', '책', '논문', '전체', '요약',
    ],
    patterns: [
      /summarize\s+(this|the)\s+(document|file|paper)/i,
      /read\s+(the\s+)?(entire|whole|full)/i,
      /analyze\s+(this|the)\s+(document|paper|report)/i,
    ],
  },
  simple: {
    keywords: [
      'hi', 'hello', 'thanks', 'yes', 'no', 'ok', 'okay', 'bye',
      'what time', 'weather', 'simple', 'quick', 'fast', 'brief',
      '안녕', '감사', '고마워', '응', '아니', '간단', '빠르게',
    ],
    patterns: [
      /^(hi|hello|hey|thanks|thank you|bye|goodbye)!?$/i,
      /^(yes|no|ok|okay|sure|got it)\.?$/i,
    ],
  },
  general: {
    keywords: [],
    patterns: [],
  },
};

// Model capabilities and best use cases
const MODEL_STRENGTHS: Record<AIModel, {
  types: QueryType[];
  priority: number;
  costTier: 'free' | 'low' | 'medium' | 'high';
}> = {
  // Free tier models
  'gpt-4o-mini': { types: ['simple', 'general'], priority: 1, costTier: 'free' },
  'o3-mini': { types: ['reasoning', 'code'], priority: 2, costTier: 'free' },
  'claude-3-5-haiku-20241022': { types: ['simple', 'general', 'creative'], priority: 1, costTier: 'free' },
  'deepseek-chat': { types: ['general', 'code'], priority: 1, costTier: 'free' },
  'mistral-small-latest': { types: ['simple', 'general'], priority: 1, costTier: 'free' },

  // Low cost tier
  'gemini-2.0-flash-exp': { types: ['general', 'long_context'], priority: 2, costTier: 'low' },
  'o1-mini': { types: ['reasoning', 'code'], priority: 3, costTier: 'low' },
  'deepseek-reasoner': { types: ['reasoning'], priority: 3, costTier: 'low' },
  'codestral-latest': { types: ['code'], priority: 3, costTier: 'low' },

  // Medium cost tier
  'gpt-4o': { types: ['general', 'vision', 'creative', 'code'], priority: 4, costTier: 'medium' },
  'claude-3-5-sonnet-20241022': { types: ['creative', 'code', 'roleplay', 'general'], priority: 4, costTier: 'medium' },
  'mistral-large-latest': { types: ['general', 'code', 'vision'], priority: 4, costTier: 'medium' },
  'grok-2': { types: ['general', 'creative'], priority: 4, costTier: 'medium' },
  'grok-2-vision': { types: ['vision', 'general'], priority: 4, costTier: 'medium' },
  'gpt-4-turbo': { types: ['general', 'vision'], priority: 4, costTier: 'medium' },
  'gpt-5': { types: ['general', 'creative', 'reasoning'], priority: 5, costTier: 'medium' },

  // High cost tier
  'o1-preview': { types: ['reasoning'], priority: 5, costTier: 'high' },
  'claude-3-opus-20240229': { types: ['creative', 'reasoning', 'roleplay'], priority: 5, costTier: 'high' },
  'claude-opus-4-20250514': { types: ['creative', 'reasoning', 'roleplay'], priority: 6, costTier: 'high' },
  'gemini-1.5-pro': { types: ['long_context'], priority: 5, costTier: 'high' },
};

// Classify query type
function classifyQuery(query: string): QueryType {
  const queryLower = query.toLowerCase();
  const scores: Record<QueryType, number> = {
    code: 0,
    reasoning: 0,
    creative: 0,
    roleplay: 0,
    vision: 0,
    long_context: 0,
    simple: 0,
    general: 0,
  };

  // Check each pattern type
  for (const [type, patterns] of Object.entries(QUERY_PATTERNS)) {
    const queryType = type as QueryType;

    // Keyword matching
    for (const keyword of patterns.keywords) {
      if (queryLower.includes(keyword.toLowerCase())) {
        scores[queryType] += 2;
      }
    }

    // Pattern matching (higher weight)
    for (const pattern of patterns.patterns) {
      if (pattern.test(query)) {
        scores[queryType] += 5;
      }
    }
  }

  // Simple query detection based on length
  if (query.length < 20) {
    scores.simple += 3;
  }

  // Find highest score
  let maxType: QueryType = 'general';
  let maxScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type as QueryType;
    }
  }

  // If no clear winner, default to general
  return maxScore > 0 ? maxType : 'general';
}

// Get recommended model for query
export function recommendModel(
  query: string,
  options?: {
    hasImage?: boolean;
    contextLength?: number;
    preferCost?: 'low' | 'balanced' | 'quality';
    availableModels?: AIModel[];
  }
): ModelRecommendation {
  const queryType = classifyQuery(query);
  const hasImage = options?.hasImage || false;
  const contextLength = options?.contextLength || query.length;
  const preferCost = options?.preferCost || 'balanced';
  const availableModels = options?.availableModels || Object.keys(MODEL_STRENGTHS) as AIModel[];

  // Override type if image is attached
  let effectiveType = queryType;
  if (hasImage) {
    effectiveType = 'vision';
  }

  // Override for very long context
  if (contextLength > 50000) {
    effectiveType = 'long_context';
  }

  // Filter models by availability and type match
  const candidates = availableModels
    .filter((model) => {
      const strength = MODEL_STRENGTHS[model];
      if (!strength) return false;

      // Must support the query type
      if (!strength.types.includes(effectiveType) && effectiveType !== 'general') {
        return false;
      }

      // Must support vision if image attached
      if (hasImage) {
        const visionModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022', 'gemini-2.0-flash-exp', 'gemini-1.5-pro',
          'mistral-large-latest', 'grok-2-vision', 'claude-3-opus-20240229', 'claude-opus-4-20250514'];
        if (!visionModels.includes(model)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const strengthA = MODEL_STRENGTHS[a];
      const strengthB = MODEL_STRENGTHS[b];

      // Sort by cost preference first
      const costOrder = { free: 0, low: 1, medium: 2, high: 3 };
      const costDiff = costOrder[strengthA.costTier] - costOrder[strengthB.costTier];

      if (preferCost === 'low' && costDiff !== 0) return costDiff;
      if (preferCost === 'quality' && costDiff !== 0) return -costDiff;

      // Then by priority
      return strengthB.priority - strengthA.priority;
    });

  // Select best model
  const bestModel = candidates[0] || 'gpt-4o-mini';
  const strength = MODEL_STRENGTHS[bestModel];

  // Generate alternatives
  const alternatives = candidates.slice(1, 4).map((model) => {
    const altStrength = MODEL_STRENGTHS[model];
    return {
      model,
      reason: getModelReason(model, effectiveType, altStrength?.costTier || 'medium'),
    };
  });

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (strength?.types.includes(effectiveType)) {
    confidence = 'high';
  } else if (effectiveType === 'general') {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    model: bestModel,
    reason: getModelReason(bestModel, effectiveType, strength?.costTier || 'medium'),
    confidence,
    alternatives,
    queryType: effectiveType,
  };
}

function getModelReason(model: AIModel, queryType: QueryType, costTier: string): string {
  const typeReasons: Record<QueryType, string> = {
    code: 'Best for coding tasks',
    reasoning: 'Excellent at logical reasoning',
    creative: 'Great for creative writing',
    roleplay: 'Good for character roleplay',
    vision: 'Supports image understanding',
    long_context: 'Handles long documents',
    simple: 'Fast and efficient',
    general: 'Good all-around performance',
  };

  const costReasons: Record<string, string> = {
    free: '• Free tier',
    low: '• Low cost',
    medium: '• Balanced cost',
    high: '• Premium model',
  };

  return `${typeReasons[queryType]} ${costReasons[costTier]}`;
}

// Get query type display name
export function getQueryTypeLabel(type: QueryType): string {
  const labels: Record<QueryType, string> = {
    code: '💻 Code',
    reasoning: '🧠 Reasoning',
    creative: '✨ Creative',
    roleplay: '🎭 Roleplay',
    vision: '👁️ Vision',
    long_context: '📄 Long Context',
    simple: '⚡ Quick',
    general: '💬 General',
  };
  return labels[type] || '💬 General';
}
