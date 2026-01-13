/**
 * Claim Mapper
 *
 * Advanced claim extraction and mapping to source documents.
 * Uses semantic similarity and structural analysis.
 */

import type { Claim, ClaimSource, SourceReference, Citation } from './types';

export interface ClaimExtractionConfig {
  minClaimLength: number;
  maxClaimLength: number;
  splitOnConjunctions: boolean;
  extractNumericalClaims: boolean;
  extractEntityClaims: boolean;
}

export interface MappingResult {
  claims: Claim[];
  citations: Citation[];
  coverageScore: number;
  unmappedClaims: string[];
}

const DEFAULT_EXTRACTION_CONFIG: ClaimExtractionConfig = {
  minClaimLength: 15,
  maxClaimLength: 500,
  splitOnConjunctions: true,
  extractNumericalClaims: true,
  extractEntityClaims: true,
};

// Patterns for identifying different claim types
const CLAIM_PATTERNS = {
  // Numerical claims: "X is Y%" or "X costs $Y"
  numerical: /(?:\d+(?:\.\d+)?%|\$\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*\s*(?:million|billion|trillion)?)/i,

  // Entity claims: "Company X announced..."
  entity: /(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,

  // Causation: "X causes Y", "X leads to Y"
  causation: /\b(?:causes?|leads?\s+to|results?\s+in|due\s+to|because\s+of)\b/i,

  // Comparison: "X is greater than Y"
  comparison: /\b(?:greater|less|more|fewer|higher|lower|better|worse)\s+than\b/i,

  // Temporal: "In 2023", "Since X"
  temporal: /\b(?:in\s+\d{4}|since\s+\d{4}|from\s+\d{4}|before\s+\d{4}|after\s+\d{4})\b/i,
};

/**
 * Extract claims with fine-grained analysis
 */
export function extractClaimsAdvanced(
  text: string,
  config: Partial<ClaimExtractionConfig> = {}
): Array<{
  text: string;
  type: 'factual' | 'numerical' | 'entity' | 'causal' | 'comparative' | 'temporal';
  startOffset: number;
  endOffset: number;
  confidence: number;
}> {
  const finalConfig = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
  const claims: Array<{
    text: string;
    type: 'factual' | 'numerical' | 'entity' | 'causal' | 'comparative' | 'temporal';
    startOffset: number;
    endOffset: number;
    confidence: number;
  }> = [];

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let currentOffset = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const startOffset = text.indexOf(trimmed, currentOffset);
    const endOffset = startOffset + trimmed.length;

    // Skip if too short or too long
    if (trimmed.length < finalConfig.minClaimLength || trimmed.length > finalConfig.maxClaimLength) {
      currentOffset = endOffset;
      continue;
    }

    // Determine claim type
    let type: typeof claims[0]['type'] = 'factual';
    let confidence = 0.6;

    if (CLAIM_PATTERNS.numerical.test(trimmed) && finalConfig.extractNumericalClaims) {
      type = 'numerical';
      confidence = 0.85;
    } else if (CLAIM_PATTERNS.causation.test(trimmed)) {
      type = 'causal';
      confidence = 0.75;
    } else if (CLAIM_PATTERNS.comparison.test(trimmed)) {
      type = 'comparative';
      confidence = 0.7;
    } else if (CLAIM_PATTERNS.temporal.test(trimmed)) {
      type = 'temporal';
      confidence = 0.8;
    } else if (finalConfig.extractEntityClaims) {
      const entityMatches = trimmed.match(CLAIM_PATTERNS.entity);
      if (entityMatches && entityMatches.length >= 2) {
        type = 'entity';
        confidence = 0.7;
      }
    }

    // Split on conjunctions if configured
    if (finalConfig.splitOnConjunctions && /\b(?:and|but|however|although)\b/i.test(trimmed)) {
      const parts = trimmed.split(/\b(?:and|but|however|although)\b/i);
      let partOffset = startOffset;

      for (const part of parts) {
        const partTrimmed = part.trim();
        if (partTrimmed.length >= finalConfig.minClaimLength) {
          const partStart = text.indexOf(partTrimmed, partOffset);
          claims.push({
            text: partTrimmed,
            type,
            startOffset: partStart,
            endOffset: partStart + partTrimmed.length,
            confidence: confidence * 0.9, // Slightly lower confidence for split claims
          });
        }
        partOffset += part.length;
      }
    } else {
      claims.push({
        text: trimmed,
        type,
        startOffset,
        endOffset,
        confidence,
      });
    }

    currentOffset = endOffset;
  }

  return claims;
}

/**
 * Compute semantic similarity using TF-IDF-like approach
 */
function computeSemanticSimilarity(text1: string, text2: string): number {
  // Tokenize and normalize
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Build term frequency maps
  const tf1 = new Map<string, number>();
  const tf2 = new Map<string, number>();

  for (const token of tokens1) {
    tf1.set(token, (tf1.get(token) ?? 0) + 1);
  }
  for (const token of tokens2) {
    tf2.set(token, (tf2.get(token) ?? 0) + 1);
  }

  // Compute cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  const allTokens = new Set([...tf1.keys(), ...tf2.keys()]);

  for (const token of allTokens) {
    const v1 = tf1.get(token) ?? 0;
    const v2 = tf2.get(token) ?? 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Find best matching source span for a claim
 */
function findBestSourceMatch(
  claim: string,
  source: SourceReference
): { span: string; score: number; matchType: ClaimSource['matchType'] } {
  const content = source.content;

  // Try exact substring match first
  if (content.toLowerCase().includes(claim.toLowerCase().slice(0, 30))) {
    return {
      span: claim,
      score: 0.95,
      matchType: 'exact',
    };
  }

  // Split source into sentences and find best match
  const sourceSentences = content.match(/[^.!?]+[.!?]+/g) ?? [content];
  let bestMatch = { span: '', score: 0 };

  for (const sentence of sourceSentences) {
    const score = computeSemanticSimilarity(claim, sentence);
    if (score > bestMatch.score) {
      bestMatch = { span: sentence.trim(), score };
    }
  }

  // Also try sliding window for longer passages
  const words = content.split(/\s+/);
  const claimWords = claim.split(/\s+/).length;
  const windowSize = Math.min(claimWords * 2, words.length);

  for (let i = 0; i <= words.length - windowSize; i += Math.floor(windowSize / 2)) {
    const window = words.slice(i, i + windowSize).join(' ');
    const score = computeSemanticSimilarity(claim, window);
    if (score > bestMatch.score) {
      bestMatch = { span: window, score };
    }
  }

  // Determine match type
  let matchType: ClaimSource['matchType'] = 'unsupported';
  if (bestMatch.score >= 0.8) matchType = 'exact';
  else if (bestMatch.score >= 0.5) matchType = 'paraphrase';
  else if (bestMatch.score >= 0.25) matchType = 'inference';

  return { ...bestMatch, matchType };
}

/**
 * Map claims to sources with detailed attribution
 */
export function mapClaimsToSources(
  claims: Array<{ text: string; startOffset: number; endOffset: number; confidence: number }>,
  sources: SourceReference[]
): MappingResult {
  const mappedClaims: Claim[] = [];
  const citations: Citation[] = [];
  const unmappedClaims: string[] = [];
  const usedSourceIds = new Set<string>();

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const claimSources: ClaimSource[] = [];

    // Find matching sources
    for (const source of sources) {
      const match = findBestSourceMatch(claim.text, source);

      if (match.score > 0.2) {
        claimSources.push({
          chunkId: source.chunkId,
          documentId: source.documentId,
          relevantText: match.span.slice(0, 200),
          matchScore: match.score,
          matchType: match.matchType,
        });
      }
    }

    // Sort by score and keep top matches
    claimSources.sort((a, b) => b.matchScore - a.matchScore);
    const topSources = claimSources.slice(0, 3);

    // Calculate groundedness
    const bestScore = topSources[0]?.matchScore ?? 0;
    const isGrounded = bestScore >= 0.4;

    mappedClaims.push({
      id: `claim_${i}`,
      text: claim.text,
      startOffset: claim.startOffset,
      endOffset: claim.endOffset,
      confidence: claim.confidence,
      sources: topSources,
      isGrounded,
      groundednessScore: bestScore,
    });

    if (!isGrounded) {
      unmappedClaims.push(claim.text);
    }

    // Create citation for best-grounded claims
    if (isGrounded && topSources[0]) {
      const topSource = topSources[0];
      const sourceRef = sources.find((s) => s.chunkId === topSource.chunkId);

      if (sourceRef && !usedSourceIds.has(topSource.chunkId)) {
        usedSourceIds.add(topSource.chunkId);

        citations.push({
          id: `cite_${citations.length + 1}`,
          text: topSource.relevantText,
          sourceChunkId: topSource.chunkId,
          documentId: topSource.documentId,
          documentTitle: sourceRef.documentTitle,
          page: sourceRef.page,
          inlineMarker: `[${citations.length + 1}]`,
        });
      }
    }
  }

  // Calculate coverage score
  const groundedCount = mappedClaims.filter((c) => c.isGrounded).length;
  const coverageScore = claims.length > 0 ? groundedCount / claims.length : 1;

  return {
    claims: mappedClaims,
    citations,
    coverageScore,
    unmappedClaims,
  };
}

/**
 * Insert citation markers into answer text
 */
export function insertCitations(
  answer: string,
  claims: Claim[],
  citations: Citation[]
): string {
  // Create a map of chunk IDs to citation markers
  const chunkToCitation = new Map<string, string>();
  for (const citation of citations) {
    chunkToCitation.set(citation.sourceChunkId, citation.inlineMarker);
  }

  // Sort claims by end offset in reverse (to preserve offsets during insertion)
  const sortedClaims = [...claims]
    .filter((c) => c.isGrounded && c.sources.length > 0)
    .sort((a, b) => b.endOffset - a.endOffset);

  let result = answer;

  for (const claim of sortedClaims) {
    const bestSource = claim.sources[0];
    const marker = chunkToCitation.get(bestSource.chunkId);

    if (marker) {
      // Find the end of the sentence containing the claim
      let insertPos = claim.endOffset;

      // Look for sentence-ending punctuation
      const nextPeriod = result.indexOf('.', claim.endOffset);
      const nextQuestion = result.indexOf('?', claim.endOffset);
      const nextExclamation = result.indexOf('!', claim.endOffset);

      const candidates = [nextPeriod, nextQuestion, nextExclamation].filter((p) => p !== -1);

      if (candidates.length > 0) {
        insertPos = Math.min(...candidates);
      }

      // Insert citation marker
      result = result.slice(0, insertPos) + marker + result.slice(insertPos);
    }
  }

  return result;
}

/**
 * Generate formatted references section
 */
export function generateReferences(citations: Citation[]): string {
  if (citations.length === 0) return '';

  const lines: string[] = ['', '---', '## References', ''];

  for (const citation of citations) {
    let ref = `${citation.inlineMarker} `;

    if (citation.documentTitle) {
      ref += `*${citation.documentTitle}*`;
    } else {
      ref += `Document ${citation.documentId.slice(0, 8)}`;
    }

    if (citation.page) {
      ref += `, p. ${citation.page}`;
    }

    lines.push(ref);
  }

  return lines.join('\n');
}

/**
 * Full pipeline: extract, map, and cite
 */
export function processAnswerWithCitations(
  answer: string,
  sources: SourceReference[],
  config: Partial<ClaimExtractionConfig> = {}
): {
  citedAnswer: string;
  references: string;
  mapping: MappingResult;
} {
  // Extract claims
  const rawClaims = extractClaimsAdvanced(answer, config);

  // Map to sources
  const mapping = mapClaimsToSources(rawClaims, sources);

  // Insert citations
  const citedAnswer = insertCitations(answer, mapping.claims, mapping.citations);

  // Generate references
  const references = generateReferences(mapping.citations);

  return {
    citedAnswer,
    references,
    mapping,
  };
}
