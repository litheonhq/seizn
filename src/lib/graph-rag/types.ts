/**
 * GraphRAG Types
 *
 * Type definitions for Graph-Augmented Retrieval (GraphRAG) system.
 * Entities and relations extracted from documents form a knowledge graph
 * that enhances retrieval by providing structured context.
 */

// ============================================
// Entity Types
// ============================================

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'concept'
  | 'technology'
  | 'method'
  | 'event'
  | 'product'
  | 'document'
  | 'custom';

export interface Entity {
  id: string;
  name: string;
  aliases: string[];
  type: EntityType;
  description?: string;
  embedding?: number[];
  confidence: number;
  sourceChunks: string[];
  metadata: Record<string, unknown>;
}

export interface EntityInput {
  name: string;
  aliases?: string[];
  type: EntityType;
  description?: string;
  confidence?: number;
  sourceChunkId: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Relation Types
// ============================================

export type RelationType =
  | 'is_a'
  | 'part_of'
  | 'belongs_to'
  | 'causes'
  | 'requires'
  | 'depends_on'
  | 'authored_by'
  | 'affiliated_with'
  | 'located_in'
  | 'occurred_at'
  | 'compares_to'
  | 'contrasts_with';

export interface Relation {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  evidence?: string;
  evidenceChunkId: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface RelationInput {
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  evidence?: string;
  evidenceChunkId: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Graph Query Types
// ============================================

export interface GraphQuery {
  startEntities?: string[];
  relationTypes?: RelationType[];
  maxDepth?: number;
  direction?: 'outgoing' | 'incoming' | 'both';
}

export interface GraphPath {
  nodes: Entity[];
  edges: Relation[];
  score: number;
}

export interface GraphSearchResult {
  paths: GraphPath[];
  entities: Entity[];
  relations: Relation[];
  totalScore: number;
}

// ============================================
// Extraction Types
// ============================================

export interface ExtractionResult {
  entities: EntityInput[];
  relations: RelationInput[];
  processingTimeMs: number;
}

export interface ChunkInput {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractionOptions {
  /** Use LLM for extraction (default: true) */
  useLlm?: boolean;
  /** Use rule-based patterns (default: true) */
  useRules?: boolean;
  /** LLM model to use */
  model?: 'haiku' | 'sonnet';
  /** Entity types to extract (default: all) */
  entityTypes?: EntityType[];
  /** Minimum confidence threshold (default: 0.5) */
  minConfidence?: number;
  /** Maximum entities per chunk (default: 50) */
  maxEntitiesPerChunk?: number;
}

// ============================================
// Store Types
// ============================================

export interface GraphStoreConfig {
  userId: string;
  collectionId: string;
}

export interface EntityQuery {
  /** Search by name (partial match) */
  name?: string;
  /** Filter by entity type */
  type?: EntityType | EntityType[];
  /** Search by embedding similarity */
  embedding?: number[];
  /** Limit results */
  limit?: number;
  /** Minimum similarity score for embedding search */
  minSimilarity?: number;
}

export interface RelationQuery {
  /** Filter by source entity */
  sourceEntityId?: string;
  /** Filter by target entity */
  targetEntityId?: string;
  /** Filter by relation type */
  type?: RelationType | RelationType[];
  /** Limit results */
  limit?: number;
}

// ============================================
// Retrieval Types
// ============================================

export interface GraphRetrievalOptions {
  /** Maximum graph traversal depth (default: 2) */
  maxDepth?: number;
  /** Direction of graph traversal */
  direction?: 'outgoing' | 'incoming' | 'both';
  /** Relation types to follow */
  relationTypes?: RelationType[];
  /** Weight for vector similarity (0-1, default: 0.5) */
  vectorWeight?: number;
  /** Weight for graph connectivity (0-1, default: 0.5) */
  graphWeight?: number;
  /** Top K results for initial vector search */
  vectorTopK?: number;
  /** Top K final results */
  topK?: number;
  /** Include entity context in results */
  includeEntityContext?: boolean;
}

export interface GraphRetrievalResult {
  /** Retrieved chunks with scores */
  chunks: Array<{
    id: string;
    content: string;
    score: number;
    vectorScore: number;
    graphScore: number;
    metadata: Record<string, unknown>;
  }>;
  /** Related entities found */
  entities: Entity[];
  /** Relations connecting entities */
  relations: Relation[];
  /** Graph paths traversed */
  paths: GraphPath[];
  /** Total processing time */
  latencyMs: number;
}

// ============================================
// Database Schema Types (Supabase)
// ============================================

export interface DbEntity {
  id: string;
  user_id: string;
  collection_id: string;
  name: string;
  aliases: string[];
  type: EntityType;
  description: string | null;
  embedding: number[] | null;
  confidence: number;
  source_chunks: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbRelation {
  id: string;
  user_id: string;
  collection_id: string;
  source_entity_id: string;
  target_entity_id: string;
  type: RelationType;
  evidence: string | null;
  evidence_chunk_id: string;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
}
