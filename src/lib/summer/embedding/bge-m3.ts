/**
 * BGE-M3 Embedding Provider
 *
 * Multilingual embedding provider using BAAI/bge-m3 model via
 * HuggingFace Inference API or a self-hosted endpoint.
 *
 * BGE-M3 supports 100+ languages and produces 1024-dimensional
 * dense embeddings optimized for multilingual retrieval.
 *
 * Environment variables:
 * - BGE_M3_API_URL: Endpoint URL (default: HuggingFace Inference API)
 * - BGE_M3_API_KEY: API key for authentication
 * - BGE_M3_MODEL: Model name (default: BAAI/bge-m3)
 *
 * @module summer/embedding/bge-m3
 */

import { getCachedEmbedding, setCachedEmbedding } from '@/lib/redis';
import type { EmbeddingInputType, EmbeddingProvider } from '../types';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_HF_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
const DEFAULT_MODEL = 'BAAI/bge-m3';
const MAX_BATCH_SIZE = 32;
const MAX_INPUT_LENGTH = 8192; // BGE-M3 max token length

// =============================================================================
// Types
// =============================================================================

export interface BGEM3ProviderOptions {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

interface HFFeatureExtractionResponse {
  // HuggingFace returns array of embeddings
  [index: number]: number[];
}

// =============================================================================
// API Call
// =============================================================================

async function callBGEM3(
  texts: string[],
  inputType: EmbeddingInputType,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<number[][]> {
  // BGE-M3 uses instruction prefixes for query vs document
  const prefixedTexts = texts.map((text) => {
    // Truncate to max input length (approximate chars)
    const truncated = text.length > MAX_INPUT_LENGTH * 4
      ? text.slice(0, MAX_INPUT_LENGTH * 4)
      : text;

    return inputType === 'query'
      ? `Represent this sentence for searching relevant passages: ${truncated}`
      : truncated;
  });

  // Determine endpoint based on URL format
  const isHuggingFace = apiUrl.includes('huggingface.co');
  const url = isHuggingFace
    ? `${apiUrl}/${model}`
    : apiUrl;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: prefixedTexts,
      options: {
        wait_for_model: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BGE-M3 API error (${response.status}): ${errorText}`);
  }

  const data: unknown = await response.json();

  // HuggingFace returns nested arrays; normalize response shape
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (Array.isArray(first) && typeof first[0] === 'number') {
      // Shape: number[][] — already the right format
      return data as number[][];
    }
    // Shape might be number[][][] (token-level), take [CLS] or mean pool
    if (Array.isArray(first) && Array.isArray(first[0])) {
      // Mean pool over tokens
      return (data as number[][][]).map((tokenEmbeddings) => {
        const dim = tokenEmbeddings[0].length;
        const mean = new Array<number>(dim).fill(0);
        for (const token of tokenEmbeddings) {
          for (let i = 0; i < dim; i++) {
            mean[i] += token[i];
          }
        }
        for (let i = 0; i < dim; i++) {
          mean[i] /= tokenEmbeddings.length;
        }
        return mean;
      });
    }
  }

  throw new Error('BGE-M3 API: unexpected response shape');
}

// =============================================================================
// Provider Class
// =============================================================================

export class BGEM3EmbeddingProvider implements EmbeddingProvider {
  public readonly id = 'bge-m3';
  public readonly dimensions: number;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: BGEM3ProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.BGE_M3_API_KEY ?? process.env.HF_API_KEY;
    if (!apiKey) {
      throw new Error('BGE_M3_API_KEY or HF_API_KEY not set');
    }

    this.apiKey = apiKey;
    this.apiUrl = options.apiUrl ?? process.env.BGE_M3_API_URL ?? DEFAULT_HF_URL;
    this.model = options.model ?? process.env.BGE_M3_MODEL ?? DEFAULT_MODEL;
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

    // 2) API call in batches
    let freshEmbeddings: number[][] = [];

    for (let i = 0; i < missingTexts.length; i += MAX_BATCH_SIZE) {
      const batch = missingTexts.slice(i, i + MAX_BATCH_SIZE);
      try {
        const batchEmbeddings = await callBGEM3(
          batch,
          inputType,
          this.apiUrl,
          this.apiKey,
          this.model
        );
        freshEmbeddings = freshEmbeddings.concat(batchEmbeddings);
      } catch {
        // Fallback: per-item to reduce blast radius
        const perItem = await Promise.all(
          batch.map((t) =>
            callBGEM3([t], inputType, this.apiUrl, this.apiKey, this.model)
              .then((arr) => arr[0])
          )
        );
        freshEmbeddings = freshEmbeddings.concat(perItem);
      }
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
