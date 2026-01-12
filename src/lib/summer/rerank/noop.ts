import type { RerankProvider, RerankResult, RerankDocument } from '../types';

export class NoopRerankProvider implements RerankProvider {
  public readonly id = 'noop';

  async rerank(_query: string, documents: RerankDocument[]): Promise<RerankResult[]> {
    // Keep original order with descending pseudo-score.
    return documents.map((d, idx) => ({
      id: d.id,
      score: documents.length - idx,
      index: idx,
    }));
  }
}
