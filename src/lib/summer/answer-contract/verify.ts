const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export interface AnswerContractResult {
  ok: boolean;
  citations: string[];
  unknownCitations: string[];
  citedChunkCoverage: number; // 0..1
  issues: string[];
}

/**
 * MVP Answer Contract verifier.
 *
 * Assumptions:
 * - The answer cites sources using chunk UUIDs: [<chunk_id>]
 * - You pass the retrieved chunks with their ids
 *
 * Upgrade path:
 * - LLM-based claim->source mapping
 * - sentence-level coverage checks
 * - groundedness checks using NLI/LLM judges
 */
export function verifyAnswerContract(params: {
  answerText: string;
  availableChunkIds: string[];
}): AnswerContractResult {
  const issues: string[] = [];

  const found = (params.answerText.match(UUID_RE) ?? []).map((s) => s.toLowerCase());
  const citations = Array.from(new Set(found));

  if (citations.length === 0) {
    issues.push('No chunk-id citations found in the answer.');
  }

  const available = new Set(params.availableChunkIds.map((s) => s.toLowerCase()));
  const unknownCitations = citations.filter((c) => !available.has(c));

  if (unknownCitations.length > 0) {
    issues.push('Answer contains citations not present in retrieved context.');
  }

  const citedKnown = citations.filter((c) => available.has(c));
  const coverage = available.size > 0 ? citedKnown.length / available.size : 0;

  if (available.size > 0 && citedKnown.length === 0) {
    issues.push('Answer did not cite any of the provided chunks.');
  }

  return {
    ok: issues.length === 0,
    citations,
    unknownCitations,
    citedChunkCoverage: coverage,
    issues,
  };
}
