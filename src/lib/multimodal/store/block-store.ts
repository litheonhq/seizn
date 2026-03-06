/**
 * Block Store - Supabase Storage for Document Blocks
 *
 * Stores and retrieves document blocks with:
 * - Full-text content storage
 * - Embedding vector storage (pgvector)
 * - Block type filtering
 * - Page range filtering
 * - Similarity search
 */

import { createServerClient } from '@/lib/supabase';
import { logServerWarn } from '@/lib/server/logger';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import type {
  DocumentBlock,
  BlockType,
  BlockQueryOptions,
  BlockStoreResult,
} from '../types';

/**
 * Database row type for document_blocks table
 */
interface BlockRow {
  id: string;
  document_id: string;
  user_id: string;
  collection_id: string;
  block_type: BlockType;
  page_number: number;
  order_index: number;
  content: string;
  content_html: string | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  parent_block_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Store document blocks in Supabase
 */
export async function storeBlocks(
  userId: string,
  collectionId: string,
  blocks: DocumentBlock[],
  options?: {
    generateEmbeddings?: boolean;
    batchSize?: number;
  }
): Promise<BlockStoreResult> {
  const supabase = createServerClient();
  const generateEmbeddings = options?.generateEmbeddings ?? true;
  const batchSize = options?.batchSize ?? 50;

  if (blocks.length === 0) {
    return {
      storedCount: 0,
      documentId: '',
      blockIds: [],
    };
  }

  const documentId = blocks[0].documentId;
  const blockIds: string[] = [];

  // Generate embeddings if requested
  const embeddings: number[][] = [];
  if (generateEmbeddings) {
    const embeddingProvider = getEmbeddingProvider();
    const texts = blocks.map((b) => b.content);

    // Process in batches to avoid API limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await embeddingProvider.embed(batch, 'document');
      embeddings.push(...batchEmbeddings);
    }
  }

  // Prepare rows for insertion
  const rows = blocks.map((block, idx) => ({
    id: block.id,
    document_id: block.documentId,
    user_id: userId,
    collection_id: collectionId,
    block_type: block.blockType,
    page_number: block.pageNumber,
    order_index: block.orderIndex ?? idx,
    content: block.content,
    content_html: block.contentHtml ?? null,
    bbox: block.bbox ?? null,
    embedding: generateEmbeddings && embeddings[idx] ? embeddings[idx] : null,
    metadata: block.metadata,
    parent_block_id: block.parentBlockId ?? null,
  }));

  // Insert in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('document_blocks')
      .upsert(batch, { onConflict: 'id' })
      .select('id');

    if (error) {
      throw new Error(`Failed to store blocks: ${error.message}`);
    }

    if (data) {
      blockIds.push(...data.map((row) => row.id));
    }
  }

  return {
    storedCount: blockIds.length,
    documentId,
    blockIds,
  };
}

/**
 * Query blocks with filters
 */
export async function queryBlocks(
  userId: string,
  collectionId: string,
  options: BlockQueryOptions = {}
): Promise<DocumentBlock[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('document_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('collection_id', collectionId);

  // Apply filters
  if (options.documentId) {
    query = query.eq('document_id', options.documentId);
  }

  if (options.blockTypes && options.blockTypes.length > 0) {
    query = query.in('block_type', options.blockTypes);
  }

  if (options.pageRange) {
    if (options.pageRange.start !== undefined) {
      query = query.gte('page_number', options.pageRange.start);
    }
    if (options.pageRange.end !== undefined) {
      query = query.lte('page_number', options.pageRange.end);
    }
  }

  // Ordering
  const orderField = options.orderBy ?? 'order_index';
  const orderDir = options.orderDirection ?? 'asc';
  query = query.order(orderField, { ascending: orderDir === 'asc' });

  // Pagination
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to query blocks: ${error.message}`);
  }

  return (data as BlockRow[]).map(rowToBlock);
}

/**
 * Get a single block by ID
 */
export async function getBlock(
  userId: string,
  blockId: string
): Promise<DocumentBlock | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('document_blocks')
    .select('*')
    .eq('id', blockId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get block: ${error.message}`);
  }

  return rowToBlock(data as BlockRow);
}

/**
 * Get blocks by document ID
 */
export async function getBlocksByDocument(
  userId: string,
  collectionId: string,
  documentId: string
): Promise<DocumentBlock[]> {
  return queryBlocks(userId, collectionId, {
    documentId,
    orderBy: 'orderIndex',
    orderDirection: 'asc',
  });
}

/**
 * Delete blocks by document ID
 */
export async function deleteBlocksByDocument(
  userId: string,
  documentId: string
): Promise<number> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('document_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .select('id');

  if (error) {
    throw new Error(`Failed to delete blocks: ${error.message}`);
  }

  return data?.length ?? 0;
}

/**
 * Search blocks by embedding similarity
 */
export async function searchBlocksBySimilarity(
  userId: string,
  collectionId: string,
  queryEmbedding: number[],
  options: {
    topK?: number;
    threshold?: number;
    blockTypes?: BlockType[];
    pageRange?: { start?: number; end?: number };
  } = {}
): Promise<Array<DocumentBlock & { similarity: number }>> {
  const supabase = createServerClient();
  const topK = options.topK ?? 10;
  const threshold = options.threshold ?? 0.5;

  // Use Supabase RPC for vector similarity search
  const { data, error } = await supabase.rpc('search_document_blocks', {
    p_user_id: userId,
    p_collection_id: collectionId,
    p_query_embedding: queryEmbedding,
    p_match_threshold: threshold,
    p_match_count: topK,
    p_block_types: options.blockTypes ?? null,
    p_page_start: options.pageRange?.start ?? null,
    p_page_end: options.pageRange?.end ?? null,
  });

  if (error) {
    // Fallback to client-side similarity if RPC not available
    logServerWarn(
      'Vector search RPC not available, falling back to basic query'
    );
    return searchBlocksFallback(userId, collectionId, queryEmbedding, options, topK, threshold);
  }

  return (data as Array<BlockRow & { similarity: number }>).map((row) => ({
    ...rowToBlock(row),
    similarity: row.similarity,
  }));
}

/**
 * Fallback similarity search (client-side calculation)
 * Used when RPC function is not available
 */
async function searchBlocksFallback(
  userId: string,
  collectionId: string,
  queryEmbedding: number[],
  options: {
    blockTypes?: BlockType[];
    pageRange?: { start?: number; end?: number };
  },
  topK: number,
  threshold: number
): Promise<Array<DocumentBlock & { similarity: number }>> {
  const supabase = createServerClient();

  let query = supabase
    .from('document_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .not('embedding', 'is', null);

  if (options.blockTypes && options.blockTypes.length > 0) {
    query = query.in('block_type', options.blockTypes);
  }

  if (options.pageRange) {
    if (options.pageRange.start !== undefined) {
      query = query.gte('page_number', options.pageRange.start);
    }
    if (options.pageRange.end !== undefined) {
      query = query.lte('page_number', options.pageRange.end);
    }
  }

  // Limit to reasonable number for client-side processing
  query = query.limit(500);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to search blocks: ${error.message}`);
  }

  // Calculate cosine similarity client-side
  const results = (data as BlockRow[])
    .map((row) => {
      const embedding = row.embedding;
      if (!embedding) return null;

      const similarity = cosineSimilarity(queryEmbedding, embedding);
      if (similarity < threshold) return null;

      return {
        ...rowToBlock(row),
        similarity,
      };
    })
    .filter((r): r is DocumentBlock & { similarity: number } => r !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Get surrounding blocks for context expansion
 */
export async function getContextBlocks(
  userId: string,
  collectionId: string,
  blockId: string,
  windowSize: number = 2
): Promise<{
  before: DocumentBlock[];
  after: DocumentBlock[];
}> {
  const supabase = createServerClient();

  // Get the target block first
  const targetBlock = await getBlock(userId, blockId);
  if (!targetBlock || targetBlock.orderIndex === undefined) {
    return { before: [], after: [] };
  }

  const orderIndex = targetBlock.orderIndex;
  const documentId = targetBlock.documentId;

  // Get blocks before
  const { data: beforeData, error: beforeError } = await supabase
    .from('document_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('document_id', documentId)
    .lt('order_index', orderIndex)
    .order('order_index', { ascending: false })
    .limit(windowSize);

  if (beforeError) {
    console.error('Failed to get before blocks:', beforeError);
  }

  // Get blocks after
  const { data: afterData, error: afterError } = await supabase
    .from('document_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('document_id', documentId)
    .gt('order_index', orderIndex)
    .order('order_index', { ascending: true })
    .limit(windowSize);

  if (afterError) {
    console.error('Failed to get after blocks:', afterError);
  }

  return {
    before: ((beforeData as BlockRow[]) ?? []).map(rowToBlock).reverse(),
    after: ((afterData as BlockRow[]) ?? []).map(rowToBlock),
  };
}

/**
 * Update block embedding
 */
export async function updateBlockEmbedding(
  userId: string,
  blockId: string,
  embedding: number[]
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('document_blocks')
    .update({ embedding, updated_at: new Date().toISOString() })
    .eq('id', blockId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update embedding: ${error.message}`);
  }
}

/**
 * Convert database row to DocumentBlock
 */
function rowToBlock(row: BlockRow): DocumentBlock {
  return {
    id: row.id,
    documentId: row.document_id,
    blockType: row.block_type,
    pageNumber: row.page_number,
    bbox: row.bbox ?? undefined,
    content: row.content,
    contentHtml: row.content_html ?? undefined,
    embedding: row.embedding ?? undefined,
    metadata: row.metadata,
    orderIndex: row.order_index,
    parentBlockId: row.parent_block_id ?? undefined,
  };
}
