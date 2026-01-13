/**
 * ECL Translator - Apply learned translation to vectors
 *
 * Provides a high-level interface for translating embeddings
 * between different model spaces using trained ECL models.
 */

import { createServerClient } from '@/lib/supabase';
import {
  applyTranslation,
  applyTranslationBatch,
  normalizeVector,
} from './trainer';
import type {
  TranslationModel,
  ECLConfig,
  ECLTranslationModelRow,
} from './types';
import { rowToModel } from './types';

// ============================================
// ECL Translator Class
// ============================================

/**
 * ECL Translator
 *
 * Applies learned translation models to convert embeddings
 * from one model's vector space to another.
 */
export class ECLTranslator {
  private model: TranslationModel;
  private normalizeOutput: boolean;

  constructor(model: TranslationModel, normalizeOutput: boolean = false) {
    if (model.status !== 'ready') {
      throw new Error(`ECL model ${model.id} is not ready (status: ${model.status})`);
    }
    if (!model.weights) {
      throw new Error(`ECL model ${model.id} has no trained weights`);
    }
    this.model = model;
    this.normalizeOutput = normalizeOutput;
  }

  /**
   * Get the source model identifier
   */
  get sourceModel(): string {
    return this.model.sourceModel;
  }

  /**
   * Get the target model identifier
   */
  get targetModel(): string {
    return this.model.targetModel;
  }

  /**
   * Get source dimension
   */
  get sourceDim(): number {
    return this.model.sourceDim;
  }

  /**
   * Get target dimension
   */
  get targetDim(): number {
    return this.model.targetDim;
  }

  /**
   * Get model quality metrics
   */
  get quality(): {
    rmse?: number;
    r2?: number;
    cosineSimilarity?: number;
    trainingSamples: number;
  } {
    return {
      rmse: this.model.validationRmse,
      r2: this.model.validationR2,
      cosineSimilarity: this.model.cosineSimilarityMean,
      trainingSamples: this.model.trainingSamples,
    };
  }

  /**
   * Translate a single query vector
   */
  translateQuery(queryVector: number[]): number[] {
    if (queryVector.length !== this.model.sourceDim) {
      throw new Error(
        `Vector dimension ${queryVector.length} doesn't match source dimension ${this.model.sourceDim}`
      );
    }

    const translated = applyTranslation(
      queryVector,
      this.model.weights!,
      this.model.bias
    );

    return this.normalizeOutput ? normalizeVector(translated) : translated;
  }

  /**
   * Translate multiple vectors
   */
  translateBatch(vectors: number[][]): number[][] {
    // Validate dimensions
    for (const v of vectors) {
      if (v.length !== this.model.sourceDim) {
        throw new Error(
          `Vector dimension ${v.length} doesn't match source dimension ${this.model.sourceDim}`
        );
      }
    }

    const translated = applyTranslationBatch(
      vectors,
      this.model.weights!,
      this.model.bias
    );

    if (this.normalizeOutput) {
      return translated.map(normalizeVector);
    }
    return translated;
  }

  /**
   * Get model info
   */
  getModelInfo(): {
    id: string;
    name: string;
    sourceModel: string;
    targetModel: string;
    translationType: string;
    trainedAt?: string;
  } {
    return {
      id: this.model.id,
      name: this.model.name,
      sourceModel: this.model.sourceModel,
      targetModel: this.model.targetModel,
      translationType: this.model.translationType,
      trainedAt: this.model.trainedAt,
    };
  }
}

// ============================================
// Translator Factory
// ============================================

/**
 * Cache of loaded translators (model ID -> translator)
 */
const translatorCache = new Map<string, ECLTranslator>();

/**
 * Load an ECL translator from the database
 */
export async function loadTranslator(
  modelId: string,
  options?: { useCache?: boolean; normalizeOutput?: boolean }
): Promise<ECLTranslator> {
  const useCache = options?.useCache ?? true;
  const normalizeOutput = options?.normalizeOutput ?? false;

  // Check cache
  if (useCache && translatorCache.has(modelId)) {
    return translatorCache.get(modelId)!;
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('ecl_translation_models')
    .select('*')
    .eq('id', modelId)
    .single();

  if (error || !data) {
    throw new Error(`ECL model not found: ${modelId}`);
  }

  const model = rowToModel(data as ECLTranslationModelRow);

  if (model.status !== 'ready') {
    throw new Error(`ECL model ${modelId} is not ready (status: ${model.status})`);
  }

  const translator = new ECLTranslator(model, normalizeOutput);

  if (useCache) {
    translatorCache.set(modelId, translator);
  }

  return translator;
}

/**
 * Load or auto-select the best ECL translator for a model pair
 */
export async function getTranslatorForModels(
  userId: string,
  sourceModel: string,
  targetModel: string,
  options?: { normalizeOutput?: boolean }
): Promise<ECLTranslator | null> {
  const supabase = createServerClient();

  // Find the best model for this pair
  const { data, error } = await supabase
    .from('ecl_translation_models')
    .select('*')
    .eq('user_id', userId)
    .eq('source_model', sourceModel)
    .eq('target_model', targetModel)
    .eq('status', 'ready')
    .order('validation_rmse', { ascending: true, nullsFirst: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  const model = rowToModel(data as ECLTranslationModelRow);
  return new ECLTranslator(model, options?.normalizeOutput ?? false);
}

/**
 * Clear the translator cache (useful after model updates)
 */
export function clearTranslatorCache(modelId?: string): void {
  if (modelId) {
    translatorCache.delete(modelId);
  } else {
    translatorCache.clear();
  }
}

// ============================================
// ECL Pipeline Integration
// ============================================

/**
 * ECL-aware query translation for the retrieval pipeline
 *
 * Translates a query embedding if an ECL model is configured and available.
 */
export async function translateQueryIfNeeded(
  queryVector: number[],
  userId: string,
  sourceModel: string,
  targetModel: string,
  config: ECLConfig
): Promise<{
  vector: number[];
  wasTranslated: boolean;
  modelId?: string;
}> {
  // ECL disabled
  if (!config.enabled) {
    return { vector: queryVector, wasTranslated: false };
  }

  // Same model, no translation needed
  if (sourceModel === targetModel) {
    return { vector: queryVector, wasTranslated: false };
  }

  try {
    let translator: ECLTranslator | null = null;

    // Use specific model if provided
    if (config.modelId) {
      translator = await loadTranslator(config.modelId);

      // Verify model matches the expected source/target
      if (
        translator.sourceModel !== sourceModel ||
        translator.targetModel !== targetModel
      ) {
        console.warn(
          `ECL model ${config.modelId} doesn't match expected models ` +
            `(${sourceModel} -> ${targetModel}). Using auto-selection.`
        );
        translator = await getTranslatorForModels(userId, sourceModel, targetModel);
      }
    } else if (config.autoTranslate) {
      // Auto-select model
      translator = await getTranslatorForModels(userId, sourceModel, targetModel);
    }

    if (!translator) {
      // No translator available
      if (config.fallbackToOriginal) {
        return { vector: queryVector, wasTranslated: false };
      }
      throw new Error(
        `No ECL model available for ${sourceModel} -> ${targetModel}`
      );
    }

    const translatedVector = translator.translateQuery(queryVector);
    return {
      vector: translatedVector,
      wasTranslated: true,
      modelId: translator.getModelInfo().id,
    };
  } catch (error) {
    if (config.fallbackToOriginal) {
      console.warn('ECL translation failed, falling back to original:', error);
      return { vector: queryVector, wasTranslated: false };
    }
    throw error;
  }
}

// ============================================
// Batch Translation Service
// ============================================

/**
 * Progress callback for batch operations
 */
export type BatchProgressCallback = (
  processed: number,
  total: number,
  current?: string
) => void;

/**
 * Batch translate embeddings with progress tracking
 */
export async function batchTranslate(
  translator: ECLTranslator,
  items: Array<{ id: string; vector: number[] }>,
  options?: {
    batchSize?: number;
    onProgress?: BatchProgressCallback;
  }
): Promise<Array<{ id: string; translatedVector: number[] }>> {
  const batchSize = options?.batchSize ?? 100;
  const results: Array<{ id: string; translatedVector: number[] }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const vectors = batch.map((item) => item.vector);

    const translatedVectors = translator.translateBatch(vectors);

    for (let j = 0; j < batch.length; j++) {
      results.push({
        id: batch[j].id,
        translatedVector: translatedVectors[j],
      });
    }

    if (options?.onProgress) {
      options.onProgress(
        Math.min(i + batchSize, items.length),
        items.length,
        batch[batch.length - 1]?.id
      );
    }
  }

  return results;
}

// ============================================
// Exports
// ============================================

export { applyTranslation, applyTranslationBatch } from './trainer';
