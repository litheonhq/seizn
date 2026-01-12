import type { RerankProvider, RerankResult, RerankDocument } from '../types';

const COHERE_RERANK_URL = 'https://api.cohere.ai/v1/rerank';

export interface CohereRerankProviderOptions {
  apiKey?: string;
  model?: string;
}

export class CohereRerankProvider implements RerankProvider {
  public readonly id = 'cohere';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: CohereRerankProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.COHERE_API_KEY;
    if (!apiKey) throw new Error('COHERE_API_KEY not set');

    this.apiKey = apiKey;
    this.model = options.model ?? process.env.COHERE_RERANK_MODEL ?? 'rerank-english-v3.0';
  }

  async rerank(query: string, documents: RerankDocument[], options?: { topN?: number }): Promise<RerankResult[]> {
    if (documents.length === 0) return [];

    const topN = options?.topN ?? Math.min(documents.length, 10);

    const response = await fetch(COHERE_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: documents.map((d) => d.text),
        top_n: topN,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere rerank error: ${error}`);
    }

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    const mapped: RerankResult[] = results.map((r: { index: number; relevance_score: number }) => {
      const idx = r.index;
      const doc = documents[idx];
      return {
        id: doc?.id ?? String(idx),
        score: typeof r.relevance_score === 'number' ? r.relevance_score : 0,
        index: idx,
      };
    });

    // Sort desc by score to enforce contract
    mapped.sort((a, b) => b.score - a.score);
    return mapped;
  }
}
