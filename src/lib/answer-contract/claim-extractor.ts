import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Claim Extractor
 *
 * Extracts atomic claims from answer text for verification.
 * Each claim should be independently verifiable against evidence.
 */

import { Claim, ClaimType } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Prompt for claim extraction
 */
const CLAIM_EXTRACTION_PROMPT = `You are an expert at decomposing text into atomic, verifiable claims.

## Your Task
Given an answer text, extract all individual claims that can be independently verified against source evidence.

## Claim Types
- **factual**: Objective statements about facts, events, or properties
- **opinion**: Subjective judgments or assessments
- **comparison**: Statements comparing two or more things
- **temporal**: Claims about time, dates, sequences, or durations
- **quantitative**: Claims involving numbers, measurements, or quantities

## Guidelines
1. Each claim should be atomic - one verifiable fact per claim
2. Preserve the original meaning precisely
3. Include implicit claims that are clearly stated
4. Skip filler words, hedges, and meta-statements
5. Assign confidence based on how clearly the claim is stated (0.0-1.0)
6. Mark position as character offsets in the original text

## Output Format
Return a JSON array of claims. Each claim object:
{
  "text": "the atomic claim",
  "type": "factual|opinion|comparison|temporal|quantitative",
  "confidence": 0.0-1.0,
  "start": character_start_position,
  "end": character_end_position
}

Return ONLY the JSON array, no explanation or markdown.`;

/**
 * Options for claim extraction
 */
export interface ClaimExtractionOptions {
  /** Model to use (haiku for speed, sonnet for accuracy) */
  model?: 'haiku' | 'sonnet';
  /** Minimum confidence threshold to include a claim */
  minConfidence?: number;
  /** Maximum number of claims to extract */
  maxClaims?: number;
  /** Language hint for better extraction */
  language?: 'en' | 'ko' | 'auto';
}

/**
 * Raw claim from LLM response
 */
interface RawClaim {
  text: string;
  type: string;
  confidence: number;
  start: number;
  end: number;
}

/**
 * Generate a unique ID for a claim
 */
function generateClaimId(): string {
  return `clm_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
}

/**
 * Validate and normalize claim type
 */
function normalizeClaimType(type: string): ClaimType {
  const validTypes: ClaimType[] = ['factual', 'opinion', 'comparison', 'temporal', 'quantitative'];
  const normalized = type.toLowerCase() as ClaimType;
  return validTypes.includes(normalized) ? normalized : 'factual';
}

/**
 * Normalize a claim for better matching
 */
function normalizeClaim(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract claims from answer text using LLM
 */
export async function extractClaims(
  answer: string,
  options: ClaimExtractionOptions = {}
): Promise<Claim[]> {
  const {
    model = 'haiku',
    minConfidence = 0.5,
    maxClaims = 50,
    language = 'auto'
  } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  // Choose model based on preference
  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  // Build the user message
  let userMessage = `Extract claims from this answer:\n\n${answer}`;
  if (language !== 'auto') {
    userMessage += `\n\n[Language: ${language === 'en' ? 'English' : 'Korean'}]`;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: CLAIM_EXTRACTION_PROMPT,
      messages: [
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claim extraction failed: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Parse the response
  let rawClaims: RawClaim[];
  try {
    rawClaims = JSON.parse(text);
  } catch {
    console.error('Failed to parse claim extraction response:', text);
    // Fallback: try to extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        rawClaims = JSON.parse(jsonMatch[0]);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  // Validate and transform claims
  const claims: Claim[] = rawClaims
    .filter((raw) => {
      // Filter by confidence
      if (raw.confidence < minConfidence) return false;
      // Filter empty claims
      if (!raw.text || raw.text.trim().length === 0) return false;
      return true;
    })
    .slice(0, maxClaims)
    .map((raw) => ({
      id: generateClaimId(),
      text: raw.text.trim(),
      type: normalizeClaimType(raw.type),
      confidence: Math.min(1, Math.max(0, raw.confidence)),
      position: {
        start: Math.max(0, raw.start || 0),
        end: Math.min(answer.length, raw.end || answer.length),
      },
      normalized: normalizeClaim(raw.text),
    }));

  return claims;
}

/**
 * Extract claims using a simpler rule-based approach (fallback)
 * Used when LLM extraction fails or for quick estimation
 */
export function extractClaimsSimple(answer: string): Claim[] {
  const claims: Claim[] = [];

  // Split by sentence
  const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 10);

  let currentPosition = 0;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;

    // Find position in original text
    const start = answer.indexOf(trimmed, currentPosition);
    const end = start + trimmed.length;
    currentPosition = end;

    // Determine claim type heuristically
    let type: ClaimType = 'factual';
    const lowerSentence = trimmed.toLowerCase();

    if (/\d+/.test(trimmed)) {
      type = 'quantitative';
    } else if (/than|more|less|better|worse|compared/i.test(lowerSentence)) {
      type = 'comparison';
    } else if (/when|after|before|during|since|until|year|month|day/i.test(lowerSentence)) {
      type = 'temporal';
    } else if (/think|believe|feel|seems|appears|probably|might/i.test(lowerSentence)) {
      type = 'opinion';
    }

    claims.push({
      id: generateClaimId(),
      text: trimmed,
      type,
      confidence: 0.7, // Default confidence for rule-based
      position: { start: Math.max(0, start), end },
      normalized: normalizeClaim(trimmed),
    });
  }

  return claims;
}

/**
 * Merge similar claims to avoid redundancy
 */
export function deduplicateClaims(claims: Claim[], similarityThreshold = 0.8): Claim[] {
  const uniqueClaims: Claim[] = [];

  for (const claim of claims) {
    const isDuplicate = uniqueClaims.some((existing) => {
      const similarity = calculateSimilarity(existing.normalized || '', claim.normalized || '');
      return similarity >= similarityThreshold;
    });

    if (!isDuplicate) {
      uniqueClaims.push(claim);
    }
  }

  return uniqueClaims;
}

/**
 * Calculate simple word-based similarity between two strings
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Group claims by type for organized analysis
 */
export function groupClaimsByType(claims: Claim[]): Record<ClaimType, Claim[]> {
  const groups: Record<ClaimType, Claim[]> = {
    factual: [],
    opinion: [],
    comparison: [],
    temporal: [],
    quantitative: [],
  };

  for (const claim of claims) {
    groups[claim.type].push(claim);
  }

  return groups;
}

/**
 * Get claim statistics
 */
export function getClaimStats(claims: Claim[]): {
  total: number;
  byType: Record<ClaimType, number>;
  avgConfidence: number;
  highConfidenceCount: number;
} {
  const byType: Record<ClaimType, number> = {
    factual: 0,
    opinion: 0,
    comparison: 0,
    temporal: 0,
    quantitative: 0,
  };

  let totalConfidence = 0;
  let highConfidenceCount = 0;

  for (const claim of claims) {
    byType[claim.type]++;
    totalConfidence += claim.confidence;
    if (claim.confidence >= 0.8) {
      highConfidenceCount++;
    }
  }

  return {
    total: claims.length,
    byType,
    avgConfidence: claims.length > 0 ? totalConfidence / claims.length : 0,
    highConfidenceCount,
  };
}
