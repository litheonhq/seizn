export interface RagMetrics {
  context_precision?: number;
  context_recall?: number;
  mrr?: number;
  faithfulness?: number;
  faithfulness_explanation?: string;
}

export interface FaithfulnessInput {
  answer: string;
  contextChunks: { id: string; text: string }[];
}

/**
 * Compute aggregate metrics from individual case metrics
 */
export function computeAggregateMetrics(
  metrics: RagMetrics[]
): Record<string, number | null> {
  const sums: Record<string, { sum: number; count: number }> = {};
  const keys: (keyof RagMetrics)[] = ['context_precision', 'context_recall', 'mrr', 'faithfulness'];

  for (const m of metrics) {
    for (const key of keys) {
      const val = m[key];
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (!sums[key]) sums[key] = { sum: 0, count: 0 };
        sums[key].sum += val;
        sums[key].count += 1;
      }
    }
  }

  const result: Record<string, number | null> = {};
  for (const key of keys) {
    result[`avg_${key}`] = sums[key]?.count ? sums[key].sum / sums[key].count : null;
  }

  return result;
}

function safeDiv(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

export function computeContextPrecisionRecall(params: {
  retrievedChunkIds: string[];
  expectedChunkIds?: string[] | null;
}): Pick<RagMetrics, 'context_precision' | 'context_recall' | 'mrr'> {
  const expected = (params.expectedChunkIds ?? []).filter(Boolean);
  const retrieved = params.retrievedChunkIds ?? [];

  if (expected.length === 0 || retrieved.length === 0) {
    return { context_precision: undefined, context_recall: undefined, mrr: undefined };
  }

  const expectedSet = new Set(expected);
  const hits = retrieved.filter((id) => expectedSet.has(id));

  const precision = safeDiv(hits.length, retrieved.length);
  const recall = safeDiv(hits.length, expected.length);

  // MRR (1 / rank of first relevant)
  let mrr: number | undefined = undefined;
  for (let i = 0; i < retrieved.length; i++) {
    if (expectedSet.has(retrieved[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  return { context_precision: precision, context_recall: recall, mrr };
}
