import type { VectorSearchResult } from '../types';

export interface RetrievalRound {
  query: string;
  source: string;
  results: VectorSearchResult[];
  weight?: number;
}

interface RankAccumulator {
  score: number;
  best: VectorSearchResult;
}

const DEFAULT_RRF_K = 60;

const QUERY_SYNONYMS: Record<string, string[]> = {
  bug: ['issue', 'error'],
  issue: ['bug', 'problem'],
  fix: ['resolve', 'patch'],
  optimize: ['improve', 'tune'],
  compare: ['difference', 'vs'],
  기억: ['메모리', '기록'],
  메모리: ['기억', '컨텍스트'],
  속도: ['성능', 'latency'],
  보안: ['security', '안전'],
};

function normalizeQuery(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function replaceWord(source: string, word: string, replacement: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
  return source.replace(pattern, replacement);
}

export function expandQueryVariants(query: string, aggressive: boolean): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const tokens = normalized.toLowerCase().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const synonyms = QUERY_SYNONYMS[token];
    if (!synonyms || synonyms.length === 0) continue;

    for (const synonym of synonyms) {
      variants.add(normalizeQuery(replaceWord(normalized, token, synonym)));
      if (!aggressive) break;
    }
  }

  if (aggressive && /\b(compare|vs|difference|비교)\b/i.test(normalized)) {
    variants.add(`${normalized} tradeoff`);
    variants.add(`${normalized} benchmark`);
  }

  const maxVariants = aggressive ? 4 : 2;
  return Array.from(variants).slice(0, maxVariants);
}

export function fuseRetrievalRounds(
  rounds: RetrievalRound[],
  topK: number,
  rrfK: number = DEFAULT_RRF_K
): VectorSearchResult[] {
  const accumulator = new Map<string, RankAccumulator>();

  for (const round of rounds) {
    const weight = round.weight ?? 1;
    round.results.forEach((result, index) => {
      const rank = index + 1;
      const contribution = weight / (rrfK + rank);
      const existing = accumulator.get(result.chunkId);

      if (!existing) {
        accumulator.set(result.chunkId, {
          score: contribution,
          best: {
            ...result,
            combinedScore: contribution,
            source: result.source ?? round.source,
          },
        });
        return;
      }

      existing.score += contribution;
      if ((result.similarity ?? 0) > (existing.best.similarity ?? 0)) {
        existing.best = {
          ...result,
          source: result.source ?? round.source,
        };
      }
    });
  }

  return Array.from(accumulator.values())
    .map((entry) => ({
      ...entry.best,
      combinedScore: entry.score,
    }))
    .sort((a, b) => (b.combinedScore ?? 0) - (a.combinedScore ?? 0))
    .slice(0, topK);
}

export function calculateOverlapAtK(
  primary: VectorSearchResult[],
  secondary: VectorSearchResult[],
  k: number
): number {
  const primaryIds = new Set(primary.slice(0, k).map((item) => item.chunkId));
  const secondaryIds = new Set(secondary.slice(0, k).map((item) => item.chunkId));

  if (primaryIds.size === 0) return 0;

  let intersection = 0;
  for (const id of primaryIds) {
    if (secondaryIds.has(id)) intersection++;
  }

  return intersection / primaryIds.size;
}

