/**
 * Reranker Dataset Management
 *
 * Manages training datasets for reranker models.
 * Supports multiple data sources: manual labels, click data, user feedback.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  TrainingSample,
  TrainingDataset,
  DatasetStats,
} from './types';
import { DEFAULT_SPLIT_RATIO } from './types';

export interface CreateDatasetParams {
  name: string;
  description?: string;
  collectionId?: string;
  splitRatio?: {
    train: number;
    validation: number;
    test: number;
  };
}

export interface AddSampleParams {
  datasetId: string;
  query: string;
  positiveDoc: string;
  negativeDoc: string;
  positiveScore?: number;
  negativeScore?: number;
  source?: TrainingSample['source'];
  metadata?: Record<string, unknown>;
}

export interface SampleFromClickParams {
  datasetId: string;
  query: string;
  clickedDocId: string;
  shownDocIds: string[];
  collectionId: string;
}

export interface SampleFromFeedbackParams {
  datasetId: string;
  query: string;
  relevantDocId: string;
  irrelevantDocId: string;
  feedbackType: 'thumbs' | 'rating' | 'explicit';
}

/**
 * Create a new training dataset
 */
export async function createDataset(params: CreateDatasetParams): Promise<TrainingDataset> {
  const supabase = createServerClient();

  const dataset: Omit<TrainingDataset, 'samples' | 'stats'> = {
    id: crypto.randomUUID(),
    name: params.name,
    description: params.description,
    collectionId: params.collectionId,
    sampleCount: 0,
    splitRatio: params.splitRatio ?? DEFAULT_SPLIT_RATIO,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const { error } = await supabase.from('summer_reranker_datasets').insert({
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    collection_id: dataset.collectionId,
    sample_count: 0,
    split_ratio: dataset.splitRatio,
    created_at: dataset.createdAt.toISOString(),
    updated_at: dataset.updatedAt.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to create dataset: ${error.message}`);
  }

  return {
    ...dataset,
    samples: [],
    stats: {
      totalSamples: 0,
      uniqueQueries: 0,
      avgQueryLength: 0,
      avgDocLength: 0,
      sourceDistribution: {},
    },
  };
}

/**
 * Add a training sample to dataset
 */
export async function addSample(params: AddSampleParams): Promise<TrainingSample> {
  const supabase = createServerClient();

  const sample: TrainingSample = {
    id: crypto.randomUUID(),
    query: params.query,
    positiveDoc: params.positiveDoc,
    negativeDoc: params.negativeDoc,
    positiveScore: params.positiveScore,
    negativeScore: params.negativeScore,
    source: params.source ?? 'manual',
    metadata: params.metadata,
    createdAt: new Date(),
  };

  const { error: sampleError } = await supabase.from('summer_reranker_samples').insert({
    id: sample.id,
    dataset_id: params.datasetId,
    query: sample.query,
    positive_doc: sample.positiveDoc,
    negative_doc: sample.negativeDoc,
    positive_score: sample.positiveScore,
    negative_score: sample.negativeScore,
    source: sample.source,
    metadata: sample.metadata,
    created_at: sample.createdAt.toISOString(),
  });

  if (sampleError) {
    throw new Error(`Failed to add sample: ${sampleError.message}`);
  }

  // Update dataset count
  await supabase.rpc('increment_dataset_sample_count', {
    p_dataset_id: params.datasetId,
  });

  return sample;
}

/**
 * Add multiple samples in batch
 */
export async function addSamplesBatch(
  datasetId: string,
  samples: Array<Omit<AddSampleParams, 'datasetId'>>
): Promise<{ added: number; errors: string[] }> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let added = 0;

  const batchSize = 100;

  for (let i = 0; i < samples.length; i += batchSize) {
    const batch = samples.slice(i, i + batchSize);

    const records = batch.map((s) => ({
      id: crypto.randomUUID(),
      dataset_id: datasetId,
      query: s.query,
      positive_doc: s.positiveDoc,
      negative_doc: s.negativeDoc,
      positive_score: s.positiveScore,
      negative_score: s.negativeScore,
      source: s.source ?? 'manual',
      metadata: s.metadata,
      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('summer_reranker_samples').insert(records);

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      added += batch.length;
    }
  }

  // Update total count
  if (added > 0) {
    await supabase
      .from('summer_reranker_datasets')
      .update({
        sample_count: supabase.rpc('get_dataset_sample_count', { p_dataset_id: datasetId }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', datasetId);
  }

  return { added, errors };
}

/**
 * Generate sample from click data
 */
export async function generateSampleFromClick(
  params: SampleFromClickParams
): Promise<TrainingSample | null> {
  const supabase = createServerClient();

  // Fetch document contents
  const { data: clickedDoc } = await supabase
    .from('summer_chunks')
    .select('content')
    .eq('id', params.clickedDocId)
    .single();

  if (!clickedDoc) return null;

  // Get a non-clicked doc as negative
  const nonClickedIds = params.shownDocIds.filter((id) => id !== params.clickedDocId);
  if (nonClickedIds.length === 0) return null;

  // Randomly select a negative
  const negativeId = nonClickedIds[Math.floor(Math.random() * nonClickedIds.length)];

  const { data: negativeDoc } = await supabase
    .from('summer_chunks')
    .select('content')
    .eq('id', negativeId)
    .single();

  if (!negativeDoc) return null;

  return addSample({
    datasetId: params.datasetId,
    query: params.query,
    positiveDoc: clickedDoc.content,
    negativeDoc: negativeDoc.content,
    positiveScore: 1.0,
    negativeScore: 0.0,
    source: 'click',
    metadata: {
      clickedDocId: params.clickedDocId,
      negativeDocId: negativeId,
      totalShown: params.shownDocIds.length,
    },
  });
}

/**
 * Generate sample from user feedback
 */
export async function generateSampleFromFeedback(
  params: SampleFromFeedbackParams
): Promise<TrainingSample | null> {
  const supabase = createServerClient();

  const { data: docs } = await supabase
    .from('summer_chunks')
    .select('id, content')
    .in('id', [params.relevantDocId, params.irrelevantDocId]);

  if (!docs || docs.length !== 2) return null;

  const relevantDoc = docs.find((d) => d.id === params.relevantDocId);
  const irrelevantDoc = docs.find((d) => d.id === params.irrelevantDocId);

  if (!relevantDoc || !irrelevantDoc) return null;

  return addSample({
    datasetId: params.datasetId,
    query: params.query,
    positiveDoc: relevantDoc.content,
    negativeDoc: irrelevantDoc.content,
    positiveScore: 1.0,
    negativeScore: 0.0,
    source: 'feedback',
    metadata: {
      feedbackType: params.feedbackType,
      relevantDocId: params.relevantDocId,
      irrelevantDocId: params.irrelevantDocId,
    },
  });
}

/**
 * Generate synthetic negatives using hard negative mining
 */
export async function generateHardNegatives(
  datasetId: string,
  query: string,
  positiveDoc: string,
  collectionId: string,
  count: number = 3
): Promise<TrainingSample[]> {
  const supabase = createServerClient();

  // Find similar but not identical documents (hard negatives)
  // This would ideally use vector similarity search
  const { data: candidates } = await supabase
    .from('summer_chunks')
    .select('id, content')
    .eq('collection_id', collectionId)
    .neq('content', positiveDoc)
    .limit(count * 2);

  if (!candidates || candidates.length === 0) return [];

  // Simple filtering: select docs that share some keywords but aren't the positive
  const positiveWords = new Set(
    positiveDoc
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
  );

  const scoredCandidates = candidates.map((c) => {
    const words = c.content
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3);
    const overlap = words.filter((w: string) => positiveWords.has(w)).length;
    return { ...c, score: overlap / Math.max(words.length, 1) };
  });

  // Sort by overlap (hard negatives have some overlap but not too much)
  scoredCandidates.sort((a, b) => {
    // Prefer moderate overlap (0.2-0.5)
    const idealA = Math.abs(a.score - 0.35);
    const idealB = Math.abs(b.score - 0.35);
    return idealA - idealB;
  });

  const samples: TrainingSample[] = [];

  for (const candidate of scoredCandidates.slice(0, count)) {
    const sample = await addSample({
      datasetId,
      query,
      positiveDoc,
      negativeDoc: candidate.content,
      positiveScore: 1.0,
      negativeScore: 0.0,
      source: 'synthetic',
      metadata: {
        hardNegativeScore: candidate.score,
        negativeDocId: candidate.id,
      },
    });
    samples.push(sample);
  }

  return samples;
}

/**
 * Get dataset with samples
 */
export async function getDataset(datasetId: string): Promise<TrainingDataset | null> {
  const supabase = createServerClient();

  const { data: dataset } = await supabase
    .from('summer_reranker_datasets')
    .select('*')
    .eq('id', datasetId)
    .single();

  if (!dataset) return null;

  const { data: samples } = await supabase
    .from('summer_reranker_samples')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false });

  const sampleList: TrainingSample[] = (samples ?? []).map((s) => ({
    id: s.id,
    query: s.query,
    positiveDoc: s.positive_doc,
    negativeDoc: s.negative_doc,
    positiveScore: s.positive_score,
    negativeScore: s.negative_score,
    source: s.source,
    metadata: s.metadata,
    createdAt: new Date(s.created_at),
  }));

  const stats = computeDatasetStats(sampleList);

  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    collectionId: dataset.collection_id,
    sampleCount: dataset.sample_count,
    samples: sampleList,
    splitRatio: dataset.split_ratio,
    stats,
    createdAt: new Date(dataset.created_at),
    updatedAt: new Date(dataset.updated_at),
  };
}

/**
 * Compute dataset statistics
 */
export function computeDatasetStats(samples: TrainingSample[]): DatasetStats {
  if (samples.length === 0) {
    return {
      totalSamples: 0,
      uniqueQueries: 0,
      avgQueryLength: 0,
      avgDocLength: 0,
      sourceDistribution: {},
    };
  }

  const uniqueQueries = new Set(samples.map((s) => s.query)).size;

  const queryLengths = samples.map((s) => s.query.length);
  const avgQueryLength = queryLengths.reduce((a, b) => a + b, 0) / queryLengths.length;

  const docLengths = samples.flatMap((s) => [s.positiveDoc.length, s.negativeDoc.length]);
  const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;

  const sourceDistribution: Record<string, number> = {};
  for (const sample of samples) {
    sourceDistribution[sample.source] = (sourceDistribution[sample.source] ?? 0) + 1;
  }

  return {
    totalSamples: samples.length,
    uniqueQueries,
    avgQueryLength: Math.round(avgQueryLength),
    avgDocLength: Math.round(avgDocLength),
    sourceDistribution,
  };
}

/**
 * Split dataset into train/validation/test sets
 */
export function splitDataset(
  samples: TrainingSample[],
  ratio: { train: number; validation: number; test: number }
): {
  train: TrainingSample[];
  validation: TrainingSample[];
  test: TrainingSample[];
} {
  // Shuffle samples
  const shuffled = [...samples].sort(() => Math.random() - 0.5);

  const trainSize = Math.floor(shuffled.length * ratio.train);
  const valSize = Math.floor(shuffled.length * ratio.validation);

  return {
    train: shuffled.slice(0, trainSize),
    validation: shuffled.slice(trainSize, trainSize + valSize),
    test: shuffled.slice(trainSize + valSize),
  };
}

/**
 * Export dataset to JSONL format for training
 */
export function exportToJSONL(samples: TrainingSample[]): string {
  return samples
    .map((s) =>
      JSON.stringify({
        query: s.query,
        positive: s.positiveDoc,
        negative: s.negativeDoc,
        positive_score: s.positiveScore ?? 1.0,
        negative_score: s.negativeScore ?? 0.0,
      })
    )
    .join('\n');
}

/**
 * Export to CSV format
 */
export function exportToCSV(samples: TrainingSample[]): string {
  const header = 'query,positive_doc,negative_doc,positive_score,negative_score,source';
  const rows = samples.map((s) => {
    const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;
    return [
      escape(s.query),
      escape(s.positiveDoc),
      escape(s.negativeDoc),
      s.positiveScore ?? 1.0,
      s.negativeScore ?? 0.0,
      s.source,
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Delete dataset and all samples
 */
export async function deleteDataset(datasetId: string): Promise<boolean> {
  const supabase = createServerClient();

  // Samples are deleted via CASCADE
  const { error } = await supabase.from('summer_reranker_datasets').delete().eq('id', datasetId);

  return !error;
}
