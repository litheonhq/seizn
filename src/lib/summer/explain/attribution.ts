/**
 * Explain My Retrieval - Source Attribution Analysis
 *
 * Analyzes search results to determine why they matched and
 * provides detailed source attribution information.
 */

import type {
  AttributionInfo,
  MatchedTerm,
  SemanticMatch,
  MATCH_TYPE_COLORS,
} from './types';

// ============================================
// Text Analysis Utilities
// ============================================

/**
 * Common stop words to ignore in term matching
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if',
]);

/**
 * Simple stemmer for English words
 */
function stem(word: string): string {
  let w = word.toLowerCase();

  // Remove common suffixes
  if (w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.endsWith('ly')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('es')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  else if (w.endsWith('ment')) w = w.slice(0, -4);
  else if (w.endsWith('ness')) w = w.slice(0, -4);
  else if (w.endsWith('tion')) w = w.slice(0, -4);
  else if (w.endsWith('able')) w = w.slice(0, -4);
  else if (w.endsWith('ible')) w = w.slice(0, -4);

  return w;
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Find all positions of a substring in text (case-insensitive)
 */
function findPositions(text: string, searchTerm: string): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  const lowerText = text.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();

  let pos = 0;
  while ((pos = lowerText.indexOf(lowerSearch, pos)) !== -1) {
    positions.push({ start: pos, end: pos + searchTerm.length });
    pos += 1;
  }

  return positions;
}

// ============================================
// Term Matching Analysis
// ============================================

interface TermMatchInput {
  query: string;
  content: string;
}

/**
 * Find matched terms between query and content
 */
function findMatchedTerms(input: TermMatchInput): MatchedTerm[] {
  const { query, content } = input;
  const queryTokens = tokenize(query);
  const contentLower = content.toLowerCase();
  const matchedTerms: MatchedTerm[] = [];
  const seenTerms = new Set<string>();

  for (const queryToken of queryTokens) {
    // Skip if already found
    if (seenTerms.has(queryToken)) continue;

    // Exact match
    const exactPositions = findPositions(content, queryToken);
    if (exactPositions.length > 0) {
      matchedTerms.push({
        term: queryToken,
        positions: exactPositions,
        matchType: 'exact',
        contribution: 0.3 * exactPositions.length,
        queryTerm: queryToken,
      });
      seenTerms.add(queryToken);
      continue;
    }

    // Stem match
    const queryStem = stem(queryToken);
    const contentTokens = tokenize(content);

    for (const contentToken of contentTokens) {
      if (seenTerms.has(contentToken)) continue;

      const contentStem = stem(contentToken);
      if (queryStem === contentStem && queryToken !== contentToken) {
        const stemPositions = findPositions(content, contentToken);
        if (stemPositions.length > 0) {
          matchedTerms.push({
            term: contentToken,
            positions: stemPositions,
            matchType: 'stem',
            contribution: 0.2 * stemPositions.length,
            queryTerm: queryToken,
          });
          seenTerms.add(contentToken);
        }
      }
    }
  }

  // Sort by contribution (highest first)
  matchedTerms.sort((a, b) => b.contribution - a.contribution);

  return matchedTerms;
}

// ============================================
// Semantic Match Analysis
// ============================================

interface SemanticMatchInput {
  query: string;
  content: string;
  vectorScore?: number;
}

/**
 * Identify semantic matches between query and content
 */
function findSemanticMatches(input: SemanticMatchInput): SemanticMatch[] {
  const { query, content, vectorScore = 0 } = input;
  const matches: SemanticMatch[] = [];

  // Split content into sentences
  const sentences = content
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  // Extract key phrases from query
  const queryPhrases = extractKeyPhrases(query);

  // Find semantically similar sentences
  for (const sentence of sentences) {
    const sentencePhrases = extractKeyPhrases(sentence);

    // Check for conceptual overlap
    for (const queryPhrase of queryPhrases) {
      for (const sentencePhrase of sentencePhrases) {
        const similarity = calculatePhraseSimilarity(queryPhrase, sentencePhrase);

        if (similarity > 0.4) {
          const position = content.indexOf(sentence);
          matches.push({
            queryPhrase,
            matchedPassage: sentence.length > 100 ? sentence.substring(0, 100) + '...' : sentence,
            similarity: similarity * (vectorScore || 0.7),
            position: {
              start: position,
              end: position + sentence.length,
            },
            reason: generateMatchReason(queryPhrase, sentencePhrase, similarity),
          });
        }
      }
    }
  }

  // Sort by similarity and deduplicate
  matches.sort((a, b) => b.similarity - a.similarity);

  // Return top 5 unique matches
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = m.matchedPassage.substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

/**
 * Extract key phrases from text
 */
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];
  const words = tokenize(text);

  // Single important words
  phrases.push(...words.filter((w) => w.length > 4).slice(0, 5));

  // Bigrams
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  return phrases.slice(0, 10);
}

/**
 * Calculate similarity between two phrases
 */
function calculatePhraseSimilarity(phrase1: string, phrase2: string): number {
  const words1 = new Set(tokenize(phrase1).map(stem));
  const words2 = new Set(tokenize(phrase2).map(stem));

  if (words1.size === 0 || words2.size === 0) return 0;

  // Jaccard similarity
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Generate reason for semantic match
 */
function generateMatchReason(queryPhrase: string, matchPhrase: string, similarity: number): string {
  if (similarity > 0.8) {
    return `Strong conceptual match with "${queryPhrase}"`;
  } else if (similarity > 0.6) {
    return `Related to "${queryPhrase}" through similar concepts`;
  } else {
    return `Contextually relevant to "${queryPhrase}"`;
  }
}

// ============================================
// Relevance Reason Generation
// ============================================

interface RelevanceReasonInput {
  matchedTerms: MatchedTerm[];
  semanticMatches: SemanticMatch[];
  vectorScore?: number;
  keywordRank?: number;
}

/**
 * Generate a human-readable relevance explanation
 */
function generateRelevanceReason(input: RelevanceReasonInput): string {
  const { matchedTerms, semanticMatches, vectorScore, keywordRank } = input;
  const reasons: string[] = [];

  // Keyword matches
  const exactMatches = matchedTerms.filter((m) => m.matchType === 'exact');
  if (exactMatches.length > 0) {
    const topTerms = exactMatches.slice(0, 3).map((m) => `"${m.term}"`);
    reasons.push(`Contains exact matches for ${topTerms.join(', ')}`);
  }

  // Semantic similarity
  if (vectorScore && vectorScore > 0.7) {
    reasons.push(
      `High semantic similarity (${(vectorScore * 100).toFixed(0)}%) with the query concept`
    );
  } else if (vectorScore && vectorScore > 0.5) {
    reasons.push(
      `Moderate semantic relevance to the query topic`
    );
  }

  // Keyword ranking
  if (keywordRank && keywordRank <= 5) {
    reasons.push(`Strong keyword alignment (ranked #${keywordRank} in keyword search)`);
  }

  // Semantic matches
  if (semanticMatches.length > 0) {
    const topMatch = semanticMatches[0];
    reasons.push(`${topMatch.reason}`);
  }

  // Default reason
  if (reasons.length === 0) {
    reasons.push('Matches query through contextual relevance');
  }

  return reasons.join('. ') + '.';
}

// ============================================
// Main Attribution Function
// ============================================

interface AttributionInput {
  query: string;
  chunkId: string;
  documentId: string;
  content: string;
  metadata?: Record<string, unknown>;
  vectorScore?: number;
  keywordRank?: number;
}

/**
 * Analyze and generate attribution information for a search result
 */
export async function analyzeAttribution(input: AttributionInput): Promise<AttributionInfo> {
  const {
    query,
    chunkId,
    documentId,
    content,
    metadata,
    vectorScore,
    keywordRank,
  } = input;

  // Find matched terms
  const matchedTerms = findMatchedTerms({ query, content });

  // Find semantic matches
  const semanticMatches = findSemanticMatches({ query, content, vectorScore });

  // Generate relevance reason
  const relevanceReason = generateRelevanceReason({
    matchedTerms,
    semanticMatches,
    vectorScore,
    keywordRank,
  });

  // Calculate confidence based on match quality
  const confidence = calculateConfidence({
    matchedTerms,
    semanticMatches,
    vectorScore,
  });

  // Extract document info from metadata
  const documentTitle = metadata?.title as string | undefined;
  const source = metadata?.source as string | undefined;
  const page = metadata?.page as number | undefined;
  const sections = metadata?.sections as string[] | undefined;

  return {
    chunkId,
    documentId,
    documentTitle,
    source,
    page,
    sections,
    matchedTerms,
    semanticMatches,
    relevanceReason,
    confidence,
    metadata,
  };
}

/**
 * Calculate confidence score for attribution
 */
function calculateConfidence(input: {
  matchedTerms: MatchedTerm[];
  semanticMatches: SemanticMatch[];
  vectorScore?: number;
}): number {
  const { matchedTerms, semanticMatches, vectorScore = 0 } = input;

  let confidence = 0;

  // Term matches contribute up to 0.4
  const termContribution = Math.min(
    0.4,
    matchedTerms.reduce((sum, m) => sum + m.contribution * 0.1, 0)
  );
  confidence += termContribution;

  // Semantic matches contribute up to 0.3
  const semanticContribution = Math.min(
    0.3,
    semanticMatches.reduce((sum, m) => sum + m.similarity * 0.1, 0)
  );
  confidence += semanticContribution;

  // Vector score contributes up to 0.3
  confidence += vectorScore * 0.3;

  return Math.min(1, Math.max(0, confidence));
}

// ============================================
// Batch Attribution
// ============================================

/**
 * Analyze attribution for multiple results
 */
export async function analyzeAttributionBatch(
  query: string,
  results: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    metadata?: Record<string, unknown>;
    vectorScore?: number;
    keywordRank?: number;
  }>
): Promise<AttributionInfo[]> {
  const attributions = await Promise.all(
    results.map((result) =>
      analyzeAttribution({
        query,
        ...result,
      })
    )
  );

  return attributions;
}

export default analyzeAttribution;
