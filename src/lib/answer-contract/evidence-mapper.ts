import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Evidence Mapper
 *
 * Maps extracted claims to evidence chunks from the knowledge base.
 * Determines support strength and identifies contradictions.
 */

import {
  Claim,
  EvidenceChunk,
  EvidenceMapping,
  EvidenceRef,
  SupportStrength,
} from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Prompt for evidence mapping
 */
const EVIDENCE_MAPPING_PROMPT = `You are an expert at analyzing whether evidence supports, contradicts, or is neutral to claims.

## Your Task
Given a claim and a list of evidence chunks, determine:
1. Whether each evidence chunk supports, contradicts, or is neutral to the claim
2. The relevant excerpt from the evidence
3. The relevance score (0.0-1.0)

## Guidelines
- "supports": Evidence directly confirms the claim or provides information that makes the claim more likely true
- "contradicts": Evidence directly refutes the claim or provides information that makes the claim likely false
- "neutral": Evidence is unrelated or does not affect the claim's truth value

## Output Format
Return a JSON object:
{
  "supported": true/false,
  "supportStrength": "strong|weak|none|contradicted",
  "evidence": [
    {
      "chunkId": "the chunk id",
      "supportType": "supports|contradicts|neutral",
      "excerpt": "relevant quote from the chunk",
      "relevance": 0.0-1.0,
      "explanation": "brief explanation"
    }
  ],
  "overallExplanation": "summary of the evidence analysis"
}

Return ONLY the JSON object, no markdown.`;

/**
 * Options for evidence mapping
 */
export interface EvidenceMappingOptions {
  /** Model to use */
  model?: 'haiku' | 'sonnet';
  /** Minimum relevance threshold */
  minRelevance?: number;
  /** Maximum evidence chunks to consider per claim */
  maxChunksPerClaim?: number;
}

/**
 * Raw evidence mapping from LLM
 */
interface RawEvidenceMapping {
  supported: boolean;
  supportStrength: string;
  evidence: Array<{
    chunkId: string;
    supportType: string;
    excerpt: string;
    relevance: number;
    explanation?: string;
  }>;
  overallExplanation?: string;
}

/**
 * Map claims to evidence chunks
 */
export async function mapClaimsToEvidence(
  claims: Claim[],
  evidenceChunks: EvidenceChunk[],
  options: EvidenceMappingOptions = {}
): Promise<EvidenceMapping[]> {
  const {
    model = 'haiku',
    minRelevance = 0.3,
    maxChunksPerClaim = 5,
  } = options;

  const mappings: EvidenceMapping[] = [];

  // Process claims in batches for efficiency
  const batchSize = 5;
  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize);
    const batchMappings = await Promise.all(
      batch.map((claim) =>
        mapSingleClaimToEvidence(claim, evidenceChunks, {
          model,
          minRelevance,
          maxChunksPerClaim,
        })
      )
    );
    mappings.push(...batchMappings);
  }

  return mappings;
}

/**
 * Map a single claim to evidence
 */
async function mapSingleClaimToEvidence(
  claim: Claim,
  evidenceChunks: EvidenceChunk[],
  options: EvidenceMappingOptions
): Promise<EvidenceMapping> {
  const {
    model = 'haiku',
    minRelevance = 0.3,
    maxChunksPerClaim = 5,
  } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  // Pre-filter evidence chunks by score to reduce LLM calls
  const relevantChunks = evidenceChunks
    .filter((chunk) => chunk.score >= minRelevance)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunksPerClaim);

  // If no relevant chunks, return empty mapping
  if (relevantChunks.length === 0) {
    return {
      claimId: claim.id,
      evidenceRefs: [],
      supported: false,
      supportStrength: 'none',
      explanation: 'No relevant evidence chunks found',
    };
  }

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  // Build evidence context
  const evidenceContext = relevantChunks
    .map((chunk, idx) => `[Chunk ${chunk.chunkId}] (score: ${chunk.score.toFixed(2)})\n${chunk.text}`)
    .join('\n\n---\n\n');

  const userMessage = `Claim: "${claim.text}"

Evidence Chunks:
${evidenceContext}

Analyze whether the evidence supports, contradicts, or is neutral to this claim.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2048,
        system: EVIDENCE_MAPPING_PROMPT,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Evidence mapping API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse response
    let rawMapping: RawEvidenceMapping;
    try {
      rawMapping = JSON.parse(text);
    } catch {
      // Try to extract JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        rawMapping = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse evidence mapping response');
      }
    }

    // Transform to EvidenceMapping
    const evidenceRefs: EvidenceRef[] = (rawMapping.evidence || [])
      .filter((e) => e.relevance >= minRelevance)
      .map((e) => ({
        chunkId: e.chunkId,
        excerpt: e.excerpt,
        relevance: Math.min(1, Math.max(0, e.relevance)),
        supportType: normalizeSupportType(e.supportType),
        highlights: extractHighlights(e.excerpt, claim.text),
      }));

    return {
      claimId: claim.id,
      evidenceRefs,
      supported: rawMapping.supported,
      supportStrength: normalizeSupportStrength(rawMapping.supportStrength),
      explanation: rawMapping.overallExplanation,
    };
  } catch (error) {
    console.error(`Failed to map claim ${claim.id}:`, error);
    // Return a fallback mapping using simple heuristics
    return mapClaimSimple(claim, relevantChunks);
  }
}

/**
 * Simple fallback mapping using text similarity
 */
function mapClaimSimple(claim: Claim, chunks: EvidenceChunk[]): EvidenceMapping {
  const evidenceRefs: EvidenceRef[] = [];
  let hasSupport = false;

  for (const chunk of chunks) {
    const similarity = calculateTextSimilarity(claim.text, chunk.text);
    if (similarity > 0.3) {
      evidenceRefs.push({
        chunkId: chunk.chunkId,
        excerpt: extractRelevantExcerpt(chunk.text, claim.text),
        relevance: similarity,
        supportType: 'supports', // Assume support if similar
      });
      hasSupport = true;
    }
  }

  return {
    claimId: claim.id,
    evidenceRefs,
    supported: hasSupport,
    supportStrength: hasSupport ? 'weak' : 'none',
    explanation: 'Fallback text similarity mapping',
  };
}

/**
 * Normalize support type from LLM response
 */
function normalizeSupportType(type: string): 'supports' | 'contradicts' | 'neutral' {
  const normalized = type.toLowerCase();
  if (normalized.includes('support')) return 'supports';
  if (normalized.includes('contradict')) return 'contradicts';
  return 'neutral';
}

/**
 * Normalize support strength from LLM response
 */
function normalizeSupportStrength(strength: string): SupportStrength {
  const normalized = strength.toLowerCase();
  if (normalized.includes('strong')) return 'strong';
  if (normalized.includes('weak')) return 'weak';
  if (normalized.includes('contradict')) return 'contradicted';
  return 'none';
}

/**
 * Calculate simple text similarity (Jaccard)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Extract relevant excerpt from evidence that relates to the claim
 */
function extractRelevantExcerpt(evidence: string, claim: string, maxLength = 200): string {
  const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const sentences = evidence.split(/[.!?]+/);

  // Find sentence with most matching words
  let bestSentence = sentences[0] || evidence;
  let bestScore = 0;

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    const score = claimWords.filter(word => sentenceLower.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // Truncate if needed
  const trimmed = bestSentence.trim();
  if (trimmed.length > maxLength) {
    return trimmed.substring(0, maxLength - 3) + '...';
  }
  return trimmed;
}

/**
 * Extract highlighted portions matching the claim
 */
function extractHighlights(excerpt: string, claim: string): string[] {
  const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const highlights: string[] = [];

  for (const word of claimWords) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\w*\\b`, 'gi');
    const matches = excerpt.match(regex);
    if (matches) {
      highlights.push(...matches);
    }
  }

  return [...new Set(highlights)];
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aggregate evidence mappings to calculate overall scores
 */
export function aggregateEvidenceMappings(mappings: EvidenceMapping[]): {
  supportedCount: number;
  unsupportedCount: number;
  contradictedCount: number;
  avgRelevance: number;
  strongSupportCount: number;
} {
  let supportedCount = 0;
  let unsupportedCount = 0;
  let contradictedCount = 0;
  let strongSupportCount = 0;
  let totalRelevance = 0;
  let relevanceCount = 0;

  for (const mapping of mappings) {
    if (mapping.supported) {
      supportedCount++;
      if (mapping.supportStrength === 'strong') {
        strongSupportCount++;
      }
    } else if (mapping.supportStrength === 'contradicted') {
      contradictedCount++;
    } else {
      unsupportedCount++;
    }

    for (const ref of mapping.evidenceRefs) {
      totalRelevance += ref.relevance;
      relevanceCount++;
    }
  }

  return {
    supportedCount,
    unsupportedCount,
    contradictedCount,
    avgRelevance: relevanceCount > 0 ? totalRelevance / relevanceCount : 0,
    strongSupportCount,
  };
}

/**
 * Find the best evidence for a specific claim
 */
export function findBestEvidence(
  claimId: string,
  mappings: EvidenceMapping[]
): EvidenceRef | null {
  const mapping = mappings.find(m => m.claimId === claimId);
  if (!mapping || mapping.evidenceRefs.length === 0) {
    return null;
  }

  // Find evidence with highest relevance that supports
  const supportingRefs = mapping.evidenceRefs
    .filter(r => r.supportType === 'supports')
    .sort((a, b) => b.relevance - a.relevance);

  return supportingRefs[0] || mapping.evidenceRefs[0];
}
