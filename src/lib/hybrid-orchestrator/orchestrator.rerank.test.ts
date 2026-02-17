import { describe, expect, it } from 'vitest';
import type { FusedResult } from './types';
import { rerankFusedResults } from './orchestrator';

const fusedCandidates: FusedResult[] = [
  {
    id: 'doc-1',
    finalScore: 0.9,
    rank: 1,
    sourceStrategies: ['vector'],
    strategyScores: { vector: 0.9, keyword: 0, multi_query: 0 },
    data: {
      chunkId: 'c1',
      documentId: 'd1',
      text: 'Guide for machine learning model deployment pipelines',
      metadata: {},
      similarity: 0.9,
    },
  },
  {
    id: 'doc-2',
    finalScore: 0.75,
    rank: 2,
    sourceStrategies: ['vector', 'keyword'],
    strategyScores: { vector: 0.72, keyword: 0.78, multi_query: 0 },
    data: {
      chunkId: 'c2',
      documentId: 'd2',
      text: 'How to brew coffee manually with a V60 dripper',
      metadata: {},
      similarity: 0.75,
    },
  },
];

describe('rerankFusedResults', () => {
  it('keeps fused results unchanged when rerank is disabled', async () => {
    const result = await rerankFusedResults('machine learning deployment', fusedCandidates, {
      rerank: false,
    });

    expect(result.applied).toBe(false);
    expect(result.results[0].id).toBe('doc-1');
    expect(result.results[1].id).toBe('doc-2');
  });

  it('applies rerank and promotes more relevant content', async () => {
    const result = await rerankFusedResults('machine learning deployment', fusedCandidates, {
      rerank: true,
      rerankTopN: 2,
      rerankThreshold: 0,
      rerankModel: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    });

    expect(result.applied).toBe(true);
    expect(result.results[0].id).toBe('doc-1');
    expect(result.results[0].finalScore).toBeGreaterThanOrEqual(result.results[1].finalScore);
  });
});
