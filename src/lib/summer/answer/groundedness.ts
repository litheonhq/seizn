/**
 * Groundedness Verification
 *
 * Verifies that generated answers are grounded in source documents.
 * Extracts claims and maps them to supporting evidence.
 */

import type {
  Claim,
  ClaimSource,
  GroundednessResult,
  SourceReference,
} from './types';

// Simple sentence splitter for claim extraction
const SENTENCE_SPLITTERS = /(?<=[.!?])\s+(?=[A-Z])/g;

// Patterns that indicate hedging/uncertainty (less likely to be claims)
const HEDGING_PATTERNS = [
  /\bmight\b/i,
  /\bmay\b/i,
  /\bcould\b/i,
  /\bpossibly\b/i,
  /\bperhaps\b/i,
  /\bI think\b/i,
  /\bI believe\b/i,
  /\bIt seems\b/i,
  /\bin my opinion\b/i,
];

// Patterns that indicate factual claims
const CLAIM_INDICATORS = [
  /\bis\b/i,
  /\bare\b/i,
  /\bwas\b/i,
  /\bwere\b/i,
  /\bhas\b/i,
  /\bhave\b/i,
  /\bcontains\b/i,
  /\bshows\b/i,
  /\bdemonstrates\b/i,
  /\bindicates\b/i,
  /\baccording to\b/i,
  /\bresearch shows\b/i,
  /\bstudies indicate\b/i,
];

/**
 * Extract claims from answer text
 */
export function extractClaims(answer: string): Omit<Claim, 'sources' | 'isGrounded' | 'groundednessScore'>[] {
  const sentences = answer.split(SENTENCE_SPLITTERS).filter((s) => s.trim().length > 10);
  const claims: Omit<Claim, 'sources' | 'isGrounded' | 'groundednessScore'>[] = [];

  let currentOffset = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const startOffset = answer.indexOf(trimmed, currentOffset);
    const endOffset = startOffset + trimmed.length;

    // Skip hedged statements
    const isHedged = HEDGING_PATTERNS.some((p) => p.test(trimmed));

    // Check for claim indicators
    const hasClaim = CLAIM_INDICATORS.some((p) => p.test(trimmed));

    // Calculate confidence based on patterns
    let confidence = 0.5;
    if (hasClaim && !isHedged) confidence = 0.8;
    else if (hasClaim && isHedged) confidence = 0.4;
    else if (!hasClaim && !isHedged) confidence = 0.6;
    else confidence = 0.3;

    // Only include sentences that look like factual claims
    if (confidence >= 0.4 && trimmed.length > 15) {
      claims.push({
        id: `claim_${claims.length}`,
        text: trimmed,
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
 * Compute text similarity using word overlap (Jaccard-like)
 */
function computeSimilarity(text1: string, text2: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  // Use Dice coefficient for better handling of different lengths
  return (2 * intersection) / (words1.size + words2.size);
}

/**
 * Find n-gram matches between claim and source
 */
function findNGramMatches(claim: string, source: string, n: number = 3): string[] {
  const claimWords = claim.toLowerCase().split(/\s+/);
  const sourceWords = source.toLowerCase().split(/\s+/);

  const matches: string[] = [];

  for (let i = 0; i <= claimWords.length - n; i++) {
    const ngram = claimWords.slice(i, i + n).join(' ');
    if (sourceWords.join(' ').includes(ngram)) {
      matches.push(ngram);
    }
  }

  return matches;
}

/**
 * Determine match type based on similarity and patterns
 */
function determineMatchType(
  claim: string,
  sourceText: string,
  similarity: number
): ClaimSource['matchType'] {
  // Check for exact match (high n-gram overlap)
  const ngramMatches = findNGramMatches(claim, sourceText, 4);
  if (ngramMatches.length >= 2 || similarity > 0.8) {
    return 'exact';
  }

  // Check for paraphrase (moderate similarity)
  if (similarity > 0.5) {
    return 'paraphrase';
  }

  // Check for inference (some overlap but requires reasoning)
  if (similarity > 0.25) {
    return 'inference';
  }

  return 'unsupported';
}

/**
 * Find the most relevant text span in source for a claim
 */
function findRelevantSpan(claim: string, sourceContent: string, maxLength: number = 200): string {
  const sentences = sourceContent.split(/[.!?]+/).filter((s) => s.trim());

  let bestSentence = '';
  let bestScore = 0;

  for (const sentence of sentences) {
    const score = computeSimilarity(claim, sentence);
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence.trim();
    }
  }

  if (bestSentence.length > maxLength) {
    return bestSentence.slice(0, maxLength) + '...';
  }

  return bestSentence || sourceContent.slice(0, maxLength);
}

/**
 * Map a single claim to source documents
 */
export function mapClaimToSources(
  claim: Omit<Claim, 'sources' | 'isGrounded' | 'groundednessScore'>,
  sources: SourceReference[]
): Claim {
  const claimSources: ClaimSource[] = [];

  for (const source of sources) {
    const similarity = computeSimilarity(claim.text, source.content);

    // Only include sources with meaningful similarity
    if (similarity > 0.15) {
      const matchType = determineMatchType(claim.text, source.content, similarity);
      const relevantText = findRelevantSpan(claim.text, source.content);

      claimSources.push({
        chunkId: source.chunkId,
        documentId: source.documentId,
        relevantText,
        matchScore: similarity,
        matchType,
      });
    }
  }

  // Sort by match score
  claimSources.sort((a, b) => b.matchScore - a.matchScore);

  // Calculate groundedness score
  const topScore = claimSources[0]?.matchScore ?? 0;
  const hasExactMatch = claimSources.some((s) => s.matchType === 'exact');
  const hasParaphrase = claimSources.some((s) => s.matchType === 'paraphrase');

  let groundednessScore = topScore;
  if (hasExactMatch) groundednessScore = Math.max(groundednessScore, 0.9);
  else if (hasParaphrase) groundednessScore = Math.max(groundednessScore, 0.7);

  return {
    ...claim,
    sources: claimSources.slice(0, 3), // Keep top 3 sources per claim
    isGrounded: groundednessScore >= 0.5,
    groundednessScore,
  };
}

/**
 * Verify groundedness of an answer against sources
 */
export function verifyGroundedness(
  answer: string,
  sources: SourceReference[],
  options: {
    minGroundednessScore?: number;
    requireAllClaims?: boolean;
  } = {}
): GroundednessResult {
  const { minGroundednessScore = 0.5, requireAllClaims = false } = options;

  const warnings: string[] = [];

  // Extract claims from answer
  const rawClaims = extractClaims(answer);

  if (rawClaims.length === 0) {
    warnings.push('No verifiable claims found in answer');
    return {
      isGrounded: true, // No claims = vacuously grounded
      overallScore: 1.0,
      claims: [],
      ungroundedClaims: [],
      summary: {
        totalClaims: 0,
        groundedClaims: 0,
        partiallyGroundedClaims: 0,
        ungroundedClaims: 0,
      },
      warnings,
    };
  }

  if (sources.length === 0) {
    warnings.push('No source documents provided');
    return {
      isGrounded: false,
      overallScore: 0,
      claims: rawClaims.map((c) => ({
        ...c,
        sources: [],
        isGrounded: false,
        groundednessScore: 0,
      })),
      ungroundedClaims: rawClaims.map((c) => ({
        ...c,
        sources: [],
        isGrounded: false,
        groundednessScore: 0,
      })),
      summary: {
        totalClaims: rawClaims.length,
        groundedClaims: 0,
        partiallyGroundedClaims: 0,
        ungroundedClaims: rawClaims.length,
      },
      warnings,
    };
  }

  // Map claims to sources
  const claims = rawClaims.map((claim) => mapClaimToSources(claim, sources));

  // Categorize claims
  const groundedClaims = claims.filter((c) => c.groundednessScore >= 0.7);
  const partiallyGroundedClaims = claims.filter(
    (c) => c.groundednessScore >= 0.4 && c.groundednessScore < 0.7
  );
  const ungroundedClaims = claims.filter((c) => c.groundednessScore < 0.4);

  // Calculate overall score
  const totalScore = claims.reduce((sum, c) => sum + c.groundednessScore, 0);
  const overallScore = claims.length > 0 ? totalScore / claims.length : 0;

  // Determine if answer is grounded
  let isGrounded: boolean;
  if (requireAllClaims) {
    isGrounded = ungroundedClaims.length === 0 && overallScore >= minGroundednessScore;
  } else {
    isGrounded =
      overallScore >= minGroundednessScore &&
      ungroundedClaims.length <= claims.length * 0.3; // Allow up to 30% ungrounded
  }

  // Add warnings
  if (ungroundedClaims.length > 0) {
    warnings.push(`${ungroundedClaims.length} claim(s) could not be verified against sources`);
  }

  if (overallScore < 0.5) {
    warnings.push('Overall groundedness score is low');
  }

  return {
    isGrounded,
    overallScore,
    claims,
    ungroundedClaims,
    summary: {
      totalClaims: claims.length,
      groundedClaims: groundedClaims.length,
      partiallyGroundedClaims: partiallyGroundedClaims.length,
      ungroundedClaims: ungroundedClaims.length,
    },
    warnings,
  };
}

/**
 * Get highlighted answer with groundedness markers
 */
export function highlightGroundedness(
  answer: string,
  claims: Claim[]
): {
  html: string;
  markdown: string;
} {
  // Sort claims by start offset in reverse order for safe replacement
  const sortedClaims = [...claims].sort((a, b) => b.startOffset - a.startOffset);

  let htmlResult = answer;
  let mdResult = answer;

  for (const claim of sortedClaims) {
    const claimText = answer.slice(claim.startOffset, claim.endOffset);

    // Determine color based on groundedness
    let color: string;
    let emoji: string;

    if (claim.groundednessScore >= 0.7) {
      color = 'green';
      emoji = '✓';
    } else if (claim.groundednessScore >= 0.4) {
      color = 'orange';
      emoji = '~';
    } else {
      color = 'red';
      emoji = '✗';
    }

    // HTML highlighting
    const htmlSpan = `<span class="groundedness-${color}" title="Groundedness: ${Math.round(claim.groundednessScore * 100)}%">${claimText}</span>`;
    htmlResult =
      htmlResult.slice(0, claim.startOffset) + htmlSpan + htmlResult.slice(claim.endOffset);

    // Markdown highlighting (using emphasis)
    const mdMark = `${emoji}${claimText}${emoji}`;
    mdResult = mdResult.slice(0, claim.startOffset) + mdMark + mdResult.slice(claim.endOffset);
  }

  return { html: htmlResult, markdown: mdResult };
}

/**
 * Generate groundedness report
 */
export function generateGroundednessReport(result: GroundednessResult): string {
  const lines: string[] = [];

  lines.push('# Groundedness Report\n');
  lines.push(`**Overall Score:** ${Math.round(result.overallScore * 100)}%`);
  lines.push(`**Status:** ${result.isGrounded ? '✓ Grounded' : '✗ Not Grounded'}\n`);

  lines.push('## Summary');
  lines.push(`- Total Claims: ${result.summary.totalClaims}`);
  lines.push(`- Grounded: ${result.summary.groundedClaims}`);
  lines.push(`- Partially Grounded: ${result.summary.partiallyGroundedClaims}`);
  lines.push(`- Ungrounded: ${result.summary.ungroundedClaims}\n`);

  if (result.ungroundedClaims.length > 0) {
    lines.push('## Ungrounded Claims\n');
    for (const claim of result.ungroundedClaims) {
      lines.push(`> "${claim.text}"`);
      lines.push(`  - Score: ${Math.round(claim.groundednessScore * 100)}%`);
      if (claim.sources.length > 0) {
        lines.push(`  - Best match: "${claim.sources[0].relevantText}" (${claim.sources[0].matchType})`);
      }
      lines.push('');
    }
  }

  if (result.warnings.length > 0) {
    lines.push('## Warnings\n');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join('\n');
}
