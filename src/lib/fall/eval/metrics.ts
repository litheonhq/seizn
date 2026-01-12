export interface RagMetrics {
  context_precision?: number;
  context_recall?: number;
  mrr?: number;
  faithfulness?: number;
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
