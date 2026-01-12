import type { RetrievalMode, VectorSearchResult } from '../types';

export type FederatedProvider =
  | 'supabase'
  | 'pinecone'
  | 'weaviate'
  | 'azure_ai_search'
  | 'vespa'
  | 'custom';

export interface FederatedCapabilities {
  vector?: boolean;
  keyword?: boolean;
  hybrid?: boolean;
}

export interface FederatedSourceConfig {
  provider: FederatedProvider;
  /** Provider-specific configuration (decrypted) */
  config: Record<string, unknown>;
  capabilities: FederatedCapabilities;
}

export interface FederatedBinding {
  id: string;
  collectionId: string;
  sourceId: string;
  remoteCollection: string;
  policy: Record<string, unknown>;
  source: FederatedSourceConfig;
}

export interface FederatedSearchParams {
  userId: string;
  queryText: string;
  queryEmbedding: number[];
  topK: number;
  mode: RetrievalMode;
}

export interface FederatedSource {
  id: string;
  provider: FederatedProvider;
  capabilities: FederatedCapabilities;

  search(params: FederatedSearchParams & { binding: FederatedBinding }): Promise<VectorSearchResult[]>;
}
