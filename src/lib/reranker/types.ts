/**
 * Domain-adaptive Reranker Types
 */

export interface RerankerConfig {
  model: RerankerModel;
  domain?: DomainType;
  customModelId?: string;
  threshold?: number;
  maxCandidates?: number;
  batchSize?: number;
  includeScores?: boolean;
}

export type RerankerModel =
  | 'cohere-rerank-v3'
  | 'cohere-rerank-multilingual-v3'
  | 'cross-encoder/ms-marco-MiniLM-L-6-v2'
  | 'cross-encoder/ms-marco-TinyBERT-L-2-v2'
  | 'bge-reranker-base'
  | 'bge-reranker-large'
  | 'custom';

export type DomainType =
  | 'general'
  | 'legal'
  | 'medical'
  | 'technical'
  | 'scientific'
  | 'financial'
  | 'ecommerce'
  | 'custom';

export interface DomainConfig {
  type: DomainType;
  name: string;
  description: string;
  recommendedModel: RerankerModel;
  defaultThreshold: number;
  specializations: string[];
}

export interface RerankRequest {
  query: string;
  documents: RerankDocument[];
  config?: Partial<RerankerConfig>;
}

export interface RerankDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  originalScore?: number;
}

export interface RerankResult {
  documents: RankedDocument[];
  model: string;
  domain: DomainType;
  latency_ms: number;
  tokensUsed?: number;
}

export interface RankedDocument extends RerankDocument {
  rerankScore: number;
  rank: number;
  scoreImprovement?: number;
}

export interface TrainingDataset {
  id: string;
  name: string;
  domain: DomainType;
  samples: TrainingSample[];
  createdAt: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
}

export interface TrainingSample {
  query: string;
  positives: string[];
  negatives: string[];
  hardNegatives?: string[];
}

export interface CustomModelConfig {
  id: string;
  name: string;
  baseModel: RerankerModel;
  domain: DomainType;
  trainingDatasetId: string;
  status: 'training' | 'ready' | 'failed';
  metrics?: {
    mrr: number;
    ndcg: number;
    map: number;
  };
  createdAt: string;
  trainedAt?: string;
}

export interface RerankerMetrics {
  totalRequests: number;
  avgLatencyMs: number;
  avgScoreImprovement: number;
  modelUsage: Record<string, number>;
  domainUsage: Record<string, number>;
}
