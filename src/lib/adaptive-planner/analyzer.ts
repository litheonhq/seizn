/**
 * Seizn Adaptive Planner - Query Analyzer
 *
 * Analyzes queries to extract features for plan matching.
 * Uses NLP heuristics and pattern matching.
 */

import type {
  QueryFeatures,
  QueryIntent,
  QueryComplexity,
} from './types';

// ============================================
// Intent Detection Patterns
// ============================================

const FACTUAL_PATTERNS = [
  /^what\s+is\b/i,
  /^who\s+(is|was|are|were)\b/i,
  /^when\s+(did|was|is|will)\b/i,
  /^where\s+(is|was|are|were|did)\b/i,
  /^which\s+/i,
  /^define\s+/i,
  /^explain\s+/i,
  /\bfact(s)?\b/i,
  /\bdefinition\b/i,
  /^tell me about\b/i,
  /\bwhat does\b.*\bmean\b/i,
];

const EXPLORATORY_PATTERNS = [
  /^how\s+can\s+i\b/i,
  /\bexplore\b/i,
  /\bdiscover\b/i,
  /\blearn about\b/i,
  /\bunderstand\b/i,
  /\bresearch\b/i,
  /\binvestigate\b/i,
  /\bfind out\b/i,
  /\blooking for\b/i,
  /\binterested in\b/i,
  /^what are (some|the)\b/i,
  /\bmore about\b/i,
];

const COMPARISON_PATTERNS = [
  /\bcompare\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\bdifference\s+between\b/i,
  /\bsimilar\s+to\b/i,
  /\bbetter than\b/i,
  /\bworse than\b/i,
  /\balternative\s+to\b/i,
  /\bpros and cons\b/i,
  /\badvantages\s+(and|or)\s+disadvantages\b/i,
  /\bwhich\s+is\s+(better|best)\b/i,
  /\bor\b.*\bshould\s+i\b/i,
];

const PROCEDURAL_PATTERNS = [
  /^how\s+(do|to|can)\b/i,
  /\bstep[s]?\s+to\b/i,
  /\bprocess\s+(for|of)\b/i,
  /\binstructions?\b/i,
  /\btutorial\b/i,
  /\bguide\s+(for|to|on)\b/i,
  /\bprocedure\b/i,
  /\bway\s+to\b/i,
  /\bmethod\s+(for|of)\b/i,
  /^can\s+you\s+show\s+me\b/i,
  /\bimplementing\b/i,
  /\bsetting\s+up\b/i,
  /\binstall(ing|ation)?\b/i,
  /\bconfigurating\b/i,
];

const OPINION_PATTERNS = [
  /\bopinion\b/i,
  /\bthink\s+(about|of)\b/i,
  /\brecommend\b/i,
  /\bsuggestion\b/i,
  /\badvice\b/i,
  /\bshould\s+i\b/i,
  /\bwhat\s+do\s+you\s+think\b/i,
  /\bbest\s+(way|practice|approach)\b/i,
  /\breview(s)?\b/i,
  /\bworth\s+it\b/i,
  /\bgood\s+idea\b/i,
];

// ============================================
// Question Type Detection
// ============================================

const QUESTION_TYPE_PATTERNS: Record<QueryFeatures['questionType'] & string, RegExp> = {
  what: /^what\b/i,
  how: /^how\b/i,
  why: /^why\b/i,
  when: /^when\b/i,
  where: /^where\b/i,
  who: /^who\b/i,
  which: /^which\b/i,
  other: /^.*/i,
};

// ============================================
// Entity Patterns
// ============================================

const ENTITY_PATTERNS = {
  // Technical entities
  code: /\b(function|class|method|api|endpoint|module|package|library|framework|sdk)\b/i,
  tech: /\b(javascript|typescript|python|react|node|nextjs|supabase|postgres|redis|docker)\b/i,
  // Temporal
  temporal: /\b(today|yesterday|tomorrow|last\s+week|next\s+month|in\s+\d+\s+(day|week|month|year)s?|\d{4}[-/]\d{2}[-/]\d{2})\b/i,
  date: /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(st|nd|rd|th)?)\b/i,
  // Quantitative
  number: /\b\d+(\.\d+)?\b/,
  percentage: /\b\d+(\.\d+)?%\b/,
  currency: /\$\d+|\d+\s*(dollars?|euros?|won|yen|pounds?)/i,
  // Named entities (capitalized words that aren't at start)
  properNoun: /(?<!\.\s)(?<!^)\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/,
};

// ============================================
// Stop Words (for keyword extraction)
// ============================================

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'and', 'but', 'if', 'or', 'because',
  'until', 'while', 'about', 'against', 'both', 'any', 'this', 'that',
  'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'it',
  'its', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
  'himself', 'she', 'her', 'hers', 'herself', 'they', 'them', 'their',
  'theirs', 'themselves', 'please', 'thanks', 'thank', 'hi', 'hello',
]);

// ============================================
// Follow-up Detection
// ============================================

const FOLLOW_UP_PATTERNS = [
  /^(and|also|additionally|furthermore|moreover)\b/i,
  /^what about\b/i,
  /^how about\b/i,
  /^(can|could) you also\b/i,
  /^one more\b/i,
  /^another\b/i,
  /\b(previous|last|earlier|before)\b/i,
  /\bthat\s+(one|thing|answer|response)\b/i,
  /\byou\s+mentioned\b/i,
  /\byou\s+said\b/i,
];

// ============================================
// Main Analysis Function
// ============================================

/**
 * Analyze a query to extract features for plan matching
 */
export async function analyzeQuery(query: string): Promise<QueryFeatures> {
  const normalizedQuery = query.trim();
  const words = normalizedQuery.split(/\s+/).filter(w => w.length > 0);

  // Basic features
  const length = normalizedQuery.length;
  const wordCount = words.length;

  // Detect intent
  const intent = detectIntent(normalizedQuery);

  // Detect complexity
  const complexity = assessComplexity(normalizedQuery, wordCount);

  // Extract entities
  const entities = extractEntities(normalizedQuery);
  const hasEntities = entities.length > 0;

  // Detect temporal and quantitative references
  const temporalRefs = hasTemporalRefs(normalizedQuery);
  const quantitativeRefs = hasQuantitativeRefs(normalizedQuery);

  // Extract keywords
  const keywords = extractKeywords(normalizedQuery, words);

  // Detect question type
  const questionType = detectQuestionType(normalizedQuery);

  // Detect follow-up
  const isFollowUp = detectFollowUp(normalizedQuery);

  // Detect language (basic detection)
  const language = detectLanguage(normalizedQuery);

  return {
    length,
    wordCount,
    hasEntities,
    entities,
    intent,
    complexity,
    temporalRefs,
    quantitativeRefs,
    keywords,
    questionType,
    isFollowUp,
    language,
  };
}

// ============================================
// Intent Detection
// ============================================

/**
 * Detect the primary intent of a query
 */
function detectIntent(query: string): QueryIntent {
  const scores: Record<QueryIntent, number> = {
    factual: 0,
    exploratory: 0,
    comparison: 0,
    procedural: 0,
    opinion: 0,
  };

  // Score each intent based on pattern matches
  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.test(query)) scores.factual += 1;
  }

  for (const pattern of EXPLORATORY_PATTERNS) {
    if (pattern.test(query)) scores.exploratory += 1;
  }

  for (const pattern of COMPARISON_PATTERNS) {
    if (pattern.test(query)) scores.comparison += 1;
  }

  for (const pattern of PROCEDURAL_PATTERNS) {
    if (pattern.test(query)) scores.procedural += 1;
  }

  for (const pattern of OPINION_PATTERNS) {
    if (pattern.test(query)) scores.opinion += 1;
  }

  // Find the intent with highest score
  let maxScore = 0;
  let bestIntent: QueryIntent = 'factual'; // Default

  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestIntent = intent as QueryIntent;
    }
  }

  // If no strong match, use heuristics
  if (maxScore === 0) {
    // Short queries are often factual
    if (query.length < 30) {
      return 'factual';
    }
    // Questions starting with "how" without procedural markers lean exploratory
    if (/^how\b/i.test(query)) {
      return 'exploratory';
    }
    // Default to exploratory for longer queries
    return 'exploratory';
  }

  return bestIntent;
}

// ============================================
// Complexity Assessment
// ============================================

/**
 * Assess the complexity of a query
 */
function assessComplexity(query: string, wordCount: number): QueryComplexity {
  let complexityScore = 0;

  // Word count factor
  if (wordCount <= 5) {
    complexityScore += 0;
  } else if (wordCount <= 15) {
    complexityScore += 1;
  } else if (wordCount <= 30) {
    complexityScore += 2;
  } else {
    complexityScore += 3;
  }

  // Multiple clauses (commas, conjunctions)
  const clauseCount = (query.match(/,|;|\band\b|\bor\b|\bbut\b/gi) || []).length;
  if (clauseCount >= 3) {
    complexityScore += 2;
  } else if (clauseCount >= 1) {
    complexityScore += 1;
  }

  // Multiple questions
  const questionCount = (query.match(/\?/g) || []).length;
  if (questionCount > 1) {
    complexityScore += 1;
  }

  // Technical terms
  if (ENTITY_PATTERNS.code.test(query) || ENTITY_PATTERNS.tech.test(query)) {
    complexityScore += 1;
  }

  // Nested concepts (parentheses, quotes)
  if (/[()]|["'].*["']/.test(query)) {
    complexityScore += 1;
  }

  // Map score to complexity level
  if (complexityScore <= 1) {
    return 'simple';
  } else if (complexityScore <= 3) {
    return 'moderate';
  } else {
    return 'complex';
  }
}

// ============================================
// Entity Extraction
// ============================================

/**
 * Extract named entities from a query
 */
function extractEntities(query: string): string[] {
  const entities: string[] = [];

  // Code/tech terms
  const codeMatches = query.match(ENTITY_PATTERNS.code);
  if (codeMatches) {
    entities.push(...codeMatches.map(m => m.toLowerCase()));
  }

  const techMatches = query.match(ENTITY_PATTERNS.tech);
  if (techMatches) {
    entities.push(...techMatches.map(m => m.toLowerCase()));
  }

  // Proper nouns (excluding first word to avoid sentence start)
  const words = query.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, '');
    if (word.length > 2 && /^[A-Z][a-z]+$/.test(word)) {
      // Check if it's not a common word
      if (!STOP_WORDS.has(word.toLowerCase())) {
        entities.push(word);
      }
    }
  }

  // Remove duplicates
  return [...new Set(entities)];
}

// ============================================
// Temporal Detection
// ============================================

/**
 * Check if query contains temporal references
 */
function hasTemporalRefs(query: string): boolean {
  return ENTITY_PATTERNS.temporal.test(query) || ENTITY_PATTERNS.date.test(query);
}

// ============================================
// Quantitative Detection
// ============================================

/**
 * Check if query contains quantitative references
 */
function hasQuantitativeRefs(query: string): boolean {
  return (
    ENTITY_PATTERNS.percentage.test(query) ||
    ENTITY_PATTERNS.currency.test(query) ||
    // More than just a single number (to avoid matching IDs)
    /\b\d+(\.\d+)?\s*(percent|times|more|less|%|x)\b/i.test(query)
  );
}

// ============================================
// Keyword Extraction
// ============================================

/**
 * Extract meaningful keywords from a query
 */
function extractKeywords(query: string, words: string[]): string[] {
  const keywords: string[] = [];

  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');

    // Skip stop words and very short words
    if (cleanWord.length <= 2 || STOP_WORDS.has(cleanWord)) {
      continue;
    }

    // Skip pure numbers
    if (/^\d+$/.test(cleanWord)) {
      continue;
    }

    keywords.push(cleanWord);
  }

  // Remove duplicates and limit
  return [...new Set(keywords)].slice(0, 10);
}

// ============================================
// Question Type Detection
// ============================================

/**
 * Detect the type of question (what, how, why, etc.)
 */
function detectQuestionType(query: string): QueryFeatures['questionType'] {
  for (const [type, pattern] of Object.entries(QUESTION_TYPE_PATTERNS)) {
    if (pattern.test(query)) {
      return type as QueryFeatures['questionType'];
    }
  }

  // Check if it's a question at all
  if (query.includes('?')) {
    return 'other';
  }

  return undefined;
}

// ============================================
// Follow-up Detection
// ============================================

/**
 * Detect if the query is likely a follow-up
 */
function detectFollowUp(query: string): boolean {
  for (const pattern of FOLLOW_UP_PATTERNS) {
    if (pattern.test(query)) {
      return true;
    }
  }
  return false;
}

// ============================================
// Language Detection (Basic)
// ============================================

/**
 * Basic language detection based on character patterns
 */
function detectLanguage(query: string): string | undefined {
  // Korean
  if (/[\uAC00-\uD7AF]/.test(query)) {
    return 'ko';
  }

  // Japanese (Hiragana, Katakana, or specific Kanji ranges)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(query)) {
    return 'ja';
  }

  // Chinese (common CJK ideographs)
  if (/[\u4E00-\u9FFF]/.test(query) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(query)) {
    return 'zh';
  }

  // Cyrillic (Russian, etc.)
  if (/[\u0400-\u04FF]/.test(query)) {
    return 'ru';
  }

  // Arabic
  if (/[\u0600-\u06FF]/.test(query)) {
    return 'ar';
  }

  // Default to English for Latin script
  if (/[a-zA-Z]/.test(query)) {
    return 'en';
  }

  return undefined;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get a brief summary of query features
 */
export function summarizeFeatures(features: QueryFeatures): string {
  const parts: string[] = [];

  parts.push(`Intent: ${features.intent}`);
  parts.push(`Complexity: ${features.complexity}`);
  parts.push(`Words: ${features.wordCount}`);

  if (features.questionType) {
    parts.push(`Type: ${features.questionType}`);
  }

  if (features.hasEntities) {
    parts.push(`Entities: ${features.entities.length}`);
  }

  if (features.temporalRefs) {
    parts.push('Has temporal refs');
  }

  if (features.quantitativeRefs) {
    parts.push('Has quantitative refs');
  }

  if (features.isFollowUp) {
    parts.push('Follow-up query');
  }

  return parts.join(' | ');
}

/**
 * Calculate similarity between two query feature sets
 */
export function featureSimilarity(a: QueryFeatures, b: QueryFeatures): number {
  let score = 0;
  let maxScore = 0;

  // Intent match (high weight)
  maxScore += 3;
  if (a.intent === b.intent) score += 3;

  // Complexity match (medium weight)
  maxScore += 2;
  if (a.complexity === b.complexity) score += 2;

  // Question type match
  maxScore += 1;
  if (a.questionType === b.questionType) score += 1;

  // Length similarity (within 20%)
  maxScore += 1;
  const lengthRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (lengthRatio >= 0.8) score += 1;

  // Entity overlap
  maxScore += 1;
  if (a.hasEntities === b.hasEntities) {
    score += 0.5;
    // Check for actual entity overlap
    const overlap = a.entities.filter(e => b.entities.includes(e.toLowerCase())).length;
    if (overlap > 0) score += 0.5;
  }

  // Temporal/quantitative similarity
  maxScore += 0.5;
  if (a.temporalRefs === b.temporalRefs) score += 0.25;
  if (a.quantitativeRefs === b.quantitativeRefs) score += 0.25;

  return score / maxScore;
}
