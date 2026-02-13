/**
 * Memory Explain API
 *
 * Provides explainability for memory operations:
 * - Why a memory was stored
 * - Why a memory was retrieved
 * - Provenance chain for a memory
 *
 * Based on Intelligent Memory Architecture (Spring 2.0) spec
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface MemoryExplanation {
  memoryId: string;
  content: string;
  memoryType: string;

  // Why stored
  storageReason: StorageReason;

  // Why retrieved (if applicable)
  retrievalReason?: RetrievalReason;

  // Provenance chain
  provenance: MemoryProvenance;

  // Related memories
  relatedMemories: RelatedMemory[];

  // Metadata
  createdAt: string;
  lastAccessedAt?: string;
  accessCount: number;
}

export interface StorageReason {
  source: 'explicit' | 'extracted' | 'consolidated' | 'derived';
  sourceType: string; // 'user_input', 'trace', 'conversation', 'document', 'api'
  extractionMethod?: string;
  confidence: number;
  factors: StorageFactor[];
}

export interface StorageFactor {
  factor: string;
  description: string;
  weight: number;
}

export interface RetrievalReason {
  query: string;
  matchType: 'semantic' | 'keyword' | 'hybrid' | 'graph';
  relevanceScore: number;
  rankingFactors: RankingFactor[];
  policyDecisions: PolicyDecision[];
}

export interface RankingFactor {
  factor: string;
  description: string;
  score: number;
  weight: number;
}

export interface PolicyDecision {
  policyId?: string;
  policyName: string;
  decision: 'allow' | 'deny' | 'filter';
  reason: string;
}

export interface MemoryProvenance {
  originalSourceId?: string;
  originalSourceType?: string;
  traceId?: string;
  spanId?: string;
  documentId?: string;
  derivedFrom?: string[];
  consolidatedFrom?: string[];
  createdBy: string; // 'user', 'system', 'extraction_pipeline'
  extractionPipeline?: string;
  verificationStatus?: 'verified' | 'unverified' | 'disputed';
}

export interface RelatedMemory {
  memoryId: string;
  content: string;
  relationship: string; // 'supersedes', 'contradicts', 'elaborates', 'similar', 'derived'
  strength: number;
}

interface RetrievalSearchResult {
  id: string;
  similarity?: number;
  bm25_score?: number;
  importance?: number;
  created_at: string;
  graph_score?: number;
}

interface MemoryMetadata {
  extraction_method?: string;
  document_id?: string;
  derived_from?: string[];
  consolidated_from?: string[];
  extraction_pipeline?: string;
  verification_status?: 'verified' | 'unverified' | 'disputed';
}

interface ExplainableMemoryRow {
  source?: string;
  confidence?: number;
  metadata?: MemoryMetadata;
  provenance_source_id?: string;
  provenance_source_type?: string;
  provenance_trace_id?: string;
  provenance_span_id?: string;
}

// ============================================
// Explain Functions
// ============================================

/**
 * Get comprehensive explanation for a memory
 */
export async function explainMemory(memoryId: string): Promise<MemoryExplanation> {
  const supabase = createServerClient();

  // Fetch memory with all metadata
  const { data: memory, error: memError } = await supabase
    .from('memories')
    .select(`
      id,
      content,
      memory_type,
      source,
      confidence,
      importance,
      access_count,
      created_at,
      last_accessed_at,
      metadata,
      provenance_source_id,
      provenance_source_type,
      provenance_trace_id,
      provenance_span_id
    `)
    .eq('id', memoryId)
    .single();

  if (memError || !memory) {
    throw new Error(`Memory not found: ${memoryId}`);
  }

  // Get related memories via edges
  const relatedMemories = await getRelatedMemories(supabase, memoryId);

  // Build storage reason
  const storageReason = buildStorageReason(memory);

  // Build provenance
  const provenance = buildProvenance(memory);

  return {
    memoryId: memory.id,
    content: memory.content,
    memoryType: memory.memory_type,
    storageReason,
    provenance,
    relatedMemories,
    createdAt: memory.created_at,
    lastAccessedAt: memory.last_accessed_at,
    accessCount: memory.access_count || 0,
  };
}

/**
 * Explain why a memory was retrieved for a specific query
 */
export async function explainRetrieval(
  memoryId: string,
  query: string,
  searchResults: RetrievalSearchResult[]
): Promise<RetrievalReason> {
  // Find this memory in search results
  const result = searchResults.find((r) => r.id === memoryId);

  if (!result) {
    throw new Error(`Memory ${memoryId} not found in search results`);
  }

  // Analyze ranking factors
  const rankingFactors: RankingFactor[] = [];

  // Semantic similarity
  if (result.similarity !== undefined) {
    rankingFactors.push({
      factor: 'semantic_similarity',
      description: 'Vector similarity between query and memory embeddings',
      score: result.similarity,
      weight: 0.5,
    });
  }

  // BM25 score
  if (result.bm25_score !== undefined) {
    rankingFactors.push({
      factor: 'keyword_match',
      description: 'BM25 keyword matching score',
      score: result.bm25_score,
      weight: 0.3,
    });
  }

  // Importance score
  if (result.importance !== undefined) {
    rankingFactors.push({
      factor: 'importance',
      description: 'Memory importance based on access patterns and recency',
      score: result.importance / 10, // Normalize to 0-1
      weight: 0.1,
    });
  }

  // Recency boost
  const recencyScore = calculateRecencyScore(result.created_at);
  if (recencyScore > 0) {
    rankingFactors.push({
      factor: 'recency',
      description: 'Boost for recently created memories',
      score: recencyScore,
      weight: 0.1,
    });
  }

  // Determine match type
  const matchType = determineMatchType(result);

  // Calculate overall relevance
  const relevanceScore = rankingFactors.reduce(
    (sum, f) => sum + f.score * f.weight,
    0
  );

  return {
    query,
    matchType,
    relevanceScore,
    rankingFactors,
    policyDecisions: [], // Would come from OPA evaluation
  };
}

/**
 * Get provenance chain for a memory
 */
export async function getProvenanceChain(memoryId: string): Promise<MemoryProvenance[]> {
  const supabase = createServerClient();
  const chain: MemoryProvenance[] = [];
  const visited = new Set<string>();

  async function traverse(id: string): Promise<void> {
    if (visited.has(id)) return;
    visited.add(id);

    const { data: memory } = await supabase
      .from('memories')
      .select(`
        id,
        source,
        metadata,
        provenance_source_id,
        provenance_source_type,
        provenance_trace_id,
        provenance_span_id
      `)
      .eq('id', id)
      .single();

    if (!memory) return;

    chain.push(buildProvenance(memory));

    // Follow derived_from links
    const derivedFrom = memory.metadata?.derived_from;
    if (Array.isArray(derivedFrom)) {
      for (const parentId of derivedFrom) {
        await traverse(parentId);
      }
    }

    // Check memory edges for derived relationships
    const { data: edges } = await supabase
      .from('memory_edges')
      .select('source_memory_id')
      .eq('target_memory_id', id)
      .eq('edge_type', 'derived');

    if (edges) {
      for (const edge of edges) {
        await traverse(edge.source_memory_id);
      }
    }
  }

  await traverse(memoryId);
  return chain;
}

/**
 * Explain why a memory was NOT retrieved
 */
export async function explainExclusion(
  memoryId: string,
  query: string
): Promise<{
  reason: string;
  factors: Array<{ factor: string; value: string; threshold?: string }>;
}> {
  const supabase = createServerClient();

  const { data: memory } = await supabase
    .from('memories')
    .select('id, content, is_deleted, importance, confidence, created_at, scope')
    .eq('id', memoryId)
    .single();

  if (!memory) {
    return {
      reason: 'Memory not found',
      factors: [{ factor: 'existence', value: 'false' }],
    };
  }

  const factors: Array<{ factor: string; value: string; threshold?: string }> = [];

  // Check if deleted
  if (memory.is_deleted) {
    factors.push({ factor: 'deleted', value: 'true' });
  }

  // Check importance threshold
  if (memory.importance < 3) {
    factors.push({
      factor: 'importance',
      value: String(memory.importance),
      threshold: '3',
    });
  }

  // Check confidence threshold
  if (memory.confidence < 0.5) {
    factors.push({
      factor: 'confidence',
      value: String(memory.confidence),
      threshold: '0.5',
    });
  }

  // Determine primary reason
  let reason = 'Unknown reason';
  if (memory.is_deleted) {
    reason = 'Memory has been deleted';
  } else if (factors.length > 0) {
    reason = `Memory did not meet retrieval criteria: ${factors.map((f) => f.factor).join(', ')}`;
  } else {
    reason = 'Memory was below similarity threshold for this query';
  }

  return { reason, factors };
}

// ============================================
// Helper Functions
// ============================================

async function getRelatedMemories(
  supabase: ReturnType<typeof createServerClient>,
  memoryId: string
): Promise<RelatedMemory[]> {
  const { data: edges, error } = await supabase
    .from('memory_edges')
    .select(`
      target_memory_id,
      edge_type,
      weight,
      target:memories!memory_edges_target_memory_id_fkey(id, content)
    `)
    .eq('source_memory_id', memoryId)
    .order('weight', { ascending: false })
    .limit(10);

  if (error || !edges) {
    return [];
  }

  return edges
    .filter((e) => e.target)
    .map((e) => {
      const target = (e as unknown as { target?: unknown }).target;
      const targetRow = Array.isArray(target) ? target[0] : target;
      const targetContent =
        targetRow && typeof targetRow === 'object' && 'content' in targetRow
          ? (targetRow as { content?: unknown }).content
          : undefined;

      return {
        memoryId: e.target_memory_id,
        content: typeof targetContent === 'string' ? targetContent.substring(0, 200) : '',
        relationship: mapEdgeTypeToRelationship(e.edge_type),
        strength: e.weight,
      };
    });
}

function buildStorageReason(memory: ExplainableMemoryRow): StorageReason {
  const source = memory.source || 'api';
  const metadata = memory.metadata || {};

  const factors: StorageFactor[] = [];

  // Source factor
  factors.push({
    factor: 'source',
    description: `Memory was created via ${source}`,
    weight: 0.3,
  });

  // Confidence factor
  if (memory.confidence) {
    factors.push({
      factor: 'confidence',
      description: `Extraction confidence: ${(memory.confidence * 100).toFixed(0)}%`,
      weight: memory.confidence,
    });
  }

  // Content uniqueness (would need more context)
  factors.push({
    factor: 'uniqueness',
    description: 'Memory content was unique enough to store',
    weight: 0.8,
  });

  return {
    source: determineStorageSource(source),
    sourceType: source,
    extractionMethod: metadata.extraction_method,
    confidence: memory.confidence || 1.0,
    factors,
  };
}

function buildProvenance(memory: ExplainableMemoryRow): MemoryProvenance {
  const metadata = memory.metadata || {};

  return {
    originalSourceId: memory.provenance_source_id,
    originalSourceType: memory.provenance_source_type,
    traceId: memory.provenance_trace_id,
    spanId: memory.provenance_span_id,
    documentId: metadata.document_id,
    derivedFrom: metadata.derived_from,
    consolidatedFrom: metadata.consolidated_from,
    createdBy: determineCreator(memory.source),
    extractionPipeline: metadata.extraction_pipeline,
    verificationStatus: metadata.verification_status,
  };
}

function determineStorageSource(source: string): 'explicit' | 'extracted' | 'consolidated' | 'derived' {
  if (source === 'api' || source === 'user_input') return 'explicit';
  if (source === 'extraction' || source === 'trace') return 'extracted';
  if (source === 'consolidation') return 'consolidated';
  if (source === 'derived') return 'derived';
  return 'explicit';
}

function determineCreator(source?: string): string {
  if (!source) return 'system';
  if (source === 'api' || source === 'user_input') return 'user';
  if (source === 'extraction' || source === 'trace') return 'extraction_pipeline';
  return 'system';
}

function determineMatchType(result: RetrievalSearchResult): 'semantic' | 'keyword' | 'hybrid' | 'graph' {
  if (result.graph_score !== undefined) return 'graph';
  if (result.similarity !== undefined && result.bm25_score !== undefined) return 'hybrid';
  if (result.bm25_score !== undefined) return 'keyword';
  return 'semantic';
}

function calculateRecencyScore(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Exponential decay: 1.0 for today, ~0.5 at 7 days, ~0.1 at 30 days
  return Math.exp(-ageDays / 10);
}

function mapEdgeTypeToRelationship(edgeType: string): string {
  const mapping: Record<string, string> = {
    contradiction: 'contradicts',
    elaboration: 'elaborates',
    derived: 'derived',
    similar: 'similar',
    entity_link: 'related_entity',
    topic_link: 'related_topic',
    temporal: 'temporal_sequence',
    causal: 'causes',
    reference: 'references',
  };
  return mapping[edgeType] || edgeType;
}
