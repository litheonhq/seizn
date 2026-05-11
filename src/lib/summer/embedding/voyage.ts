import { getCachedEmbedding, setCachedEmbedding } from '@/lib/redis';
import type { EmbeddingInputType, EmbeddingProvider } from '../types';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

// Hard cap on a single Voyage call. Bridge/route layers add their own deadlines,
// so this is the inner watchdog that prevents a hung embedding request from
// consuming the full Vercel function budget.
const VOYAGE_FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.VOYAGE_FETCH_TIMEOUT_MS || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 10_000;
})();

export interface VoyageEmbeddingProviderOptions {
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

async function callVoyage(texts: string[], inputType: EmbeddingInputType, apiKey: string, model: string): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOYAGE_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        input_type: inputType,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(`Voyage API timeout after ${VOYAGE_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${error}`);
  }

  const data = await response.json();
  if (!data?.data || !Array.isArray(data.data)) {
    throw new Error('Voyage API: unexpected response shape');
  }

  // Preserve order
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  public readonly id = 'voyage';
  public readonly dimensions: number;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: VoyageEmbeddingProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

    this.apiKey = apiKey;
    this.model = options.model ?? process.env.VOYAGE_MODEL ?? 'voyage-3';
    this.dimensions = options.dimensions ?? 1024;
  }

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    // 1) Cache lookup
    const cached: Array<number[] | null> = await Promise.all(
      texts.map((t) => getCachedEmbedding(t, inputType))
    );

    const missingIndexes: number[] = [];
    const missingTexts: string[] = [];
    cached.forEach((v, idx) => {
      if (!v) {
        missingIndexes.push(idx);
        missingTexts.push(texts[idx]);
      }
    });

    if (missingTexts.length === 0) {
      return cached as number[][];
    }

    // 2) API call (batch first, fall back to per-item)
    let freshEmbeddings: number[][];
    try {
      freshEmbeddings = await callVoyage(missingTexts, inputType, this.apiKey, this.model);
    } catch {
      // Fallback: per-item to reduce blast radius (rate limits / payload limits)
      freshEmbeddings = await Promise.all(
        missingTexts.map((t) => callVoyage([t], inputType, this.apiKey, this.model).then((arr) => arr[0]))
      );
    }

    // 3) Fill output and async cache set
    const output: number[][] = [...(cached as number[][])];
    missingIndexes.forEach((originalIdx, i) => {
      output[originalIdx] = freshEmbeddings[i];
      setCachedEmbedding(texts[originalIdx], inputType, freshEmbeddings[i]).catch(console.error);
    });

    return output;
  }
}
