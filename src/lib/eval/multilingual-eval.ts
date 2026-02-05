/**
 * Multilingual Search Evaluation Harness
 *
 * Measures search quality across languages to prevent regression.
 * Computes Recall@K, MRR, and NDCG metrics on golden test sets.
 *
 * Usage:
 *   import { MultilingualEval } from '@/lib/eval/multilingual-eval';
 *   const eval = new MultilingualEval(supabase);
 *   const report = await eval.run();
 *
 * @module lib/eval/multilingual-eval
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeEmbedding } from '@/lib/embeddings';

// =============================================================================
// Types
// =============================================================================

/**
 * A single evaluation case: query → expected results
 */
export interface EvalCase {
  /** Unique ID for this test case */
  id: string;
  /** The search query */
  query: string;
  /** BCP-47 language of the query */
  queryLanguage: string;
  /** Expected memory IDs in ranked order (best first) */
  expectedIds: string[];
  /** Languages of the expected results */
  expectedLanguages?: string[];
  /** Tags for grouping (e.g., 'cross-lingual', 'same-language', 'cross-script') */
  tags: string[];
  /** Description of what this test case validates */
  description?: string;
}

/**
 * Result for a single evaluation case
 */
export interface EvalCaseResult {
  caseId: string;
  query: string;
  queryLanguage: string;
  tags: string[];
  /** IDs returned by search (in order) */
  returnedIds: string[];
  /** Which expected IDs were found in top K */
  hitsAtK: Record<number, string[]>;
  /** Recall@K values */
  recallAtK: Record<number, number>;
  /** Reciprocal rank of first relevant result */
  mrr: number;
  /** NDCG score */
  ndcg: number;
  /** Search mode used */
  searchMode?: string;
  /** Processing time in ms */
  processingMs: number;
}

/**
 * Aggregated evaluation report
 */
export interface EvalReport {
  /** Timestamp of evaluation */
  timestamp: string;
  /** Total cases evaluated */
  totalCases: number;
  /** Cases that passed (recall@10 >= threshold) */
  passedCases: number;
  /** Cases that failed */
  failedCases: number;
  /** Overall pass rate */
  passRate: number;

  /** Aggregate metrics */
  metrics: {
    /** Mean Recall@K across all cases */
    meanRecallAt5: number;
    meanRecallAt10: number;
    meanRecallAt20: number;
    /** Mean Reciprocal Rank */
    meanMRR: number;
    /** Mean NDCG */
    meanNDCG: number;
  };

  /** Metrics broken down by tag */
  byTag: Record<string, {
    count: number;
    meanRecallAt10: number;
    meanMRR: number;
    meanNDCG: number;
  }>;

  /** Metrics broken down by query language */
  byLanguage: Record<string, {
    count: number;
    meanRecallAt10: number;
    meanMRR: number;
    meanNDCG: number;
  }>;

  /** Per-case results (for debugging) */
  cases: EvalCaseResult[];

  /** Total evaluation time in ms */
  totalProcessingMs: number;
}

// =============================================================================
// Metric Computation
// =============================================================================

/**
 * Compute Recall@K: fraction of expected results found in top K
 */
function computeRecallAtK(
  returnedIds: string[],
  expectedIds: string[],
  k: number
): number {
  if (expectedIds.length === 0) return 1.0;
  const topK = new Set(returnedIds.slice(0, k));
  const hits = expectedIds.filter((id) => topK.has(id));
  return hits.length / expectedIds.length;
}

/**
 * Compute Mean Reciprocal Rank: 1/rank of first relevant result
 */
function computeMRR(returnedIds: string[], expectedIds: string[]): number {
  const expectedSet = new Set(expectedIds);
  for (let i = 0; i < returnedIds.length; i++) {
    if (expectedSet.has(returnedIds[i])) {
      return 1.0 / (i + 1);
    }
  }
  return 0;
}

/**
 * Compute NDCG (Normalized Discounted Cumulative Gain)
 */
function computeNDCG(
  returnedIds: string[],
  expectedIds: string[],
  k: number
): number {
  const relevanceMap = new Map<string, number>();
  // Assign relevance scores: first expected = highest relevance
  for (let i = 0; i < expectedIds.length; i++) {
    relevanceMap.set(expectedIds[i], expectedIds.length - i);
  }

  // DCG
  let dcg = 0;
  for (let i = 0; i < Math.min(returnedIds.length, k); i++) {
    const rel = relevanceMap.get(returnedIds[i]) || 0;
    dcg += rel / Math.log2(i + 2); // i+2 because log2(1) = 0
  }

  // Ideal DCG (perfect ranking)
  const idealRelevances = expectedIds
    .map((_, i) => expectedIds.length - i)
    .sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < Math.min(idealRelevances.length, k); i++) {
    idcg += idealRelevances[i] / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

// =============================================================================
// Evaluation Runner
// =============================================================================

export class MultilingualEval {
  constructor(
    private supabase: SupabaseClient,
    private recallThreshold = 0.5
  ) {}

  /**
   * Run evaluation on a set of test cases
   */
  async run(
    testCases: EvalCase[],
    userId: string
  ): Promise<EvalReport> {
    const startTime = Date.now();
    const caseResults: EvalCaseResult[] = [];

    for (const testCase of testCases) {
      const caseStart = Date.now();

      try {
        // Generate query embedding
        const queryEmbedding = await computeEmbedding(testCase.query, 'query');

        // Run search via the crosslingual RPC (same as production path)
        const { data: results, error } = await this.supabase.rpc(
          'search_memories_crosslingual',
          {
            p_user_id: userId,
            p_query_embedding: queryEmbedding,
            p_language: null,
            p_use_canonical: true,
            p_limit: 20,
            p_min_similarity: 0.3,
          }
        );

        const returnedIds = error
          ? []
          : (results || []).map((r: { id: string }) => r.id);

        // Compute metrics
        const recallAt5 = computeRecallAtK(returnedIds, testCase.expectedIds, 5);
        const recallAt10 = computeRecallAtK(returnedIds, testCase.expectedIds, 10);
        const recallAt20 = computeRecallAtK(returnedIds, testCase.expectedIds, 20);
        const mrr = computeMRR(returnedIds, testCase.expectedIds);
        const ndcg = computeNDCG(returnedIds, testCase.expectedIds, 10);

        caseResults.push({
          caseId: testCase.id,
          query: testCase.query,
          queryLanguage: testCase.queryLanguage,
          tags: testCase.tags,
          returnedIds,
          hitsAtK: {
            5: testCase.expectedIds.filter((id) =>
              returnedIds.slice(0, 5).includes(id)
            ),
            10: testCase.expectedIds.filter((id) =>
              returnedIds.slice(0, 10).includes(id)
            ),
            20: testCase.expectedIds.filter((id) =>
              returnedIds.slice(0, 20).includes(id)
            ),
          },
          recallAtK: { 5: recallAt5, 10: recallAt10, 20: recallAt20 },
          mrr,
          ndcg,
          searchMode: results?.[0]?.search_mode,
          processingMs: Date.now() - caseStart,
        });
      } catch (err) {
        caseResults.push({
          caseId: testCase.id,
          query: testCase.query,
          queryLanguage: testCase.queryLanguage,
          tags: testCase.tags,
          returnedIds: [],
          hitsAtK: { 5: [], 10: [], 20: [] },
          recallAtK: { 5: 0, 10: 0, 20: 0 },
          mrr: 0,
          ndcg: 0,
          processingMs: Date.now() - caseStart,
        });
      }
    }

    // Aggregate metrics
    const n = caseResults.length;
    const sum = (fn: (r: EvalCaseResult) => number) =>
      caseResults.reduce((acc, r) => acc + fn(r), 0);

    const meanRecallAt5 = n > 0 ? sum((r) => r.recallAtK[5]) / n : 0;
    const meanRecallAt10 = n > 0 ? sum((r) => r.recallAtK[10]) / n : 0;
    const meanRecallAt20 = n > 0 ? sum((r) => r.recallAtK[20]) / n : 0;
    const meanMRR = n > 0 ? sum((r) => r.mrr) / n : 0;
    const meanNDCG = n > 0 ? sum((r) => r.ndcg) / n : 0;

    const passedCases = caseResults.filter(
      (r) => r.recallAtK[10] >= this.recallThreshold
    ).length;

    // Group by tag
    const byTag: EvalReport['byTag'] = {};
    for (const result of caseResults) {
      for (const tag of result.tags) {
        if (!byTag[tag]) {
          byTag[tag] = { count: 0, meanRecallAt10: 0, meanMRR: 0, meanNDCG: 0 };
        }
        byTag[tag].count++;
        byTag[tag].meanRecallAt10 += result.recallAtK[10];
        byTag[tag].meanMRR += result.mrr;
        byTag[tag].meanNDCG += result.ndcg;
      }
    }
    for (const tag of Object.keys(byTag)) {
      const count = byTag[tag].count;
      byTag[tag].meanRecallAt10 /= count;
      byTag[tag].meanMRR /= count;
      byTag[tag].meanNDCG /= count;
    }

    // Group by language
    const byLanguage: EvalReport['byLanguage'] = {};
    for (const result of caseResults) {
      const lang = result.queryLanguage;
      if (!byLanguage[lang]) {
        byLanguage[lang] = { count: 0, meanRecallAt10: 0, meanMRR: 0, meanNDCG: 0 };
      }
      byLanguage[lang].count++;
      byLanguage[lang].meanRecallAt10 += result.recallAtK[10];
      byLanguage[lang].meanMRR += result.mrr;
      byLanguage[lang].meanNDCG += result.ndcg;
    }
    for (const lang of Object.keys(byLanguage)) {
      const count = byLanguage[lang].count;
      byLanguage[lang].meanRecallAt10 /= count;
      byLanguage[lang].meanMRR /= count;
      byLanguage[lang].meanNDCG /= count;
    }

    return {
      timestamp: new Date().toISOString(),
      totalCases: n,
      passedCases,
      failedCases: n - passedCases,
      passRate: n > 0 ? passedCases / n : 0,
      metrics: {
        meanRecallAt5,
        meanRecallAt10,
        meanRecallAt20,
        meanMRR,
        meanNDCG,
      },
      byTag,
      byLanguage,
      cases: caseResults,
      totalProcessingMs: Date.now() - startTime,
    };
  }

  /**
   * Check if a report passes the quality gate
   */
  passesGate(report: EvalReport, minRecallAt10 = 0.6): boolean {
    return report.metrics.meanRecallAt10 >= minRecallAt10;
  }

  /**
   * Format report as a human-readable summary
   */
  formatSummary(report: EvalReport): string {
    const lines: string[] = [];
    lines.push('=== Multilingual Search Evaluation ===');
    lines.push(`Date: ${report.timestamp}`);
    lines.push(`Cases: ${report.totalCases} (${report.passedCases} passed, ${report.failedCases} failed)`);
    lines.push(`Pass Rate: ${(report.passRate * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('--- Aggregate Metrics ---');
    lines.push(`Recall@5:  ${(report.metrics.meanRecallAt5 * 100).toFixed(1)}%`);
    lines.push(`Recall@10: ${(report.metrics.meanRecallAt10 * 100).toFixed(1)}%`);
    lines.push(`Recall@20: ${(report.metrics.meanRecallAt20 * 100).toFixed(1)}%`);
    lines.push(`MRR:       ${report.metrics.meanMRR.toFixed(3)}`);
    lines.push(`NDCG:      ${report.metrics.meanNDCG.toFixed(3)}`);
    lines.push('');

    if (Object.keys(report.byLanguage).length > 0) {
      lines.push('--- By Language ---');
      for (const [lang, m] of Object.entries(report.byLanguage)) {
        lines.push(`  ${lang}: R@10=${(m.meanRecallAt10 * 100).toFixed(1)}% MRR=${m.meanMRR.toFixed(3)} (n=${m.count})`);
      }
      lines.push('');
    }

    if (Object.keys(report.byTag).length > 0) {
      lines.push('--- By Tag ---');
      for (const [tag, m] of Object.entries(report.byTag)) {
        lines.push(`  ${tag}: R@10=${(m.meanRecallAt10 * 100).toFixed(1)}% MRR=${m.meanMRR.toFixed(3)} (n=${m.count})`);
      }
      lines.push('');
    }

    lines.push(`Total time: ${report.totalProcessingMs}ms`);
    return lines.join('\n');
  }
}

// =============================================================================
// Golden Test Set Examples
// =============================================================================

/**
 * Sample golden test set for multilingual evaluation.
 * In production, these would be loaded from a database or file.
 *
 * Note: expectedIds must be populated with actual memory IDs
 * from the test database before running evaluation.
 */
export const SAMPLE_EVAL_CASES: EvalCase[] = [
  // Same-language Korean
  {
    id: 'ko-same-1',
    query: '사용자가 아침에 무엇을 마시는지',
    queryLanguage: 'ko',
    expectedIds: [], // Populate with actual IDs
    tags: ['same-language', 'korean', 'preference'],
    description: 'Korean query → Korean memory about morning drink',
  },
  // Cross-lingual: English query → Korean memory
  {
    id: 'en-ko-cross-1',
    query: 'What does the user drink in the morning?',
    queryLanguage: 'en',
    expectedIds: [],
    expectedLanguages: ['ko'],
    tags: ['cross-lingual', 'en-ko', 'preference'],
    description: 'English query → Korean memory (via canonical)',
  },
  // Cross-script: Traditional Chinese → Simplified Chinese
  {
    id: 'zh-cross-script-1',
    query: '電腦',
    queryLanguage: 'zh-Hant',
    expectedIds: [],
    expectedLanguages: ['zh-Hans'],
    tags: ['cross-script', 'chinese', 'keyword'],
    description: 'Traditional Chinese query → Simplified Chinese memory',
  },
  // Cross-lingual: English query → Hindi memory
  {
    id: 'en-hi-cross-1',
    query: 'Where does the user live?',
    queryLanguage: 'en',
    expectedIds: [],
    expectedLanguages: ['hi'],
    tags: ['cross-lingual', 'en-hi', 'fact'],
    description: 'English query → Hindi memory (via canonical)',
  },
  // Cross-script: Romanized Hindi → Devanagari memory
  {
    id: 'hi-cross-script-1',
    query: 'main delhi mein rehta hoon',
    queryLanguage: 'hi-Latn',
    expectedIds: [],
    expectedLanguages: ['hi'],
    tags: ['cross-script', 'hindi', 'romanized'],
    description: 'Romanized Hindi query → Devanagari Hindi memory',
  },
  // Cross-lingual: English query → Ukrainian memory
  {
    id: 'en-uk-cross-1',
    query: 'What is the user working on?',
    queryLanguage: 'en',
    expectedIds: [],
    expectedLanguages: ['uk'],
    tags: ['cross-lingual', 'en-uk', 'fact'],
    description: 'English query → Ukrainian memory (via canonical)',
  },
  // Hybrid search: keyword + semantic
  {
    id: 'hybrid-1',
    query: 'React performance optimization',
    queryLanguage: 'en',
    expectedIds: [],
    tags: ['hybrid', 'english', 'technical'],
    description: 'Technical keyword query benefiting from hybrid search',
  },
];
