import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, ServerErrors } from '@/lib/api-error';
import { analyzeWhyNotStandalone } from '@/lib/retrieval/why-not';
import type { TraceConfig } from '@/lib/fall/flight-recorder/types';

/**
 * POST /api/retrieval/why-not
 *
 * Standalone why-not analysis without a trace.
 * Analyzes why specific document(s) would NOT be returned for a given query.
 *
 * Request Body:
 * - query: string (required) - The search query to simulate
 * - collection_id: string (required) - Collection to search in
 * - document_id: string (single document)
 * - document_ids: string[] (multiple documents)
 * - config: object (optional) - Retrieval configuration to simulate
 *   - top_k: number
 *   - rerank_enabled: boolean
 *   - rerank_top_n: number
 *   - threshold: number
 *   - search_type: 'semantic' | 'keyword' | 'hybrid'
 *
 * Response:
 * - results: WhyNotResult[]
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return ValidationErrors.missingField('query');
    }

    if (!body.collection_id || typeof body.collection_id !== 'string') {
      return ValidationErrors.missingField('collection_id');
    }

    // Parse document IDs
    let documentIds: string[] = [];

    if (body.document_id) {
      documentIds = [body.document_id];
    } else if (body.document_ids && Array.isArray(body.document_ids)) {
      documentIds = body.document_ids;
    }

    if (documentIds.length === 0) {
      return ValidationErrors.missingField('document_id or document_ids');
    }

    // Validate document IDs
    for (const id of documentIds) {
      if (typeof id !== 'string' || id.trim() === '') {
        return ValidationErrors.invalidField('document_id', id);
      }
    }

    // Limit number of documents
    if (documentIds.length > 20) {
      return ValidationErrors.invalidField(
        'document_ids',
        `Too many documents (${documentIds.length}). Maximum is 20.`
      );
    }

    // Parse optional config
    const config: Partial<TraceConfig> = {};

    if (body.config) {
      if (typeof body.config.top_k === 'number') {
        config.topK = body.config.top_k;
      }
      if (typeof body.config.rerank_enabled === 'boolean') {
        config.rerankEnabled = body.config.rerank_enabled;
      }
      if (typeof body.config.rerank_top_n === 'number') {
        config.rerankTopN = body.config.rerank_top_n;
      }
      if (typeof body.config.threshold === 'number') {
        config.hybridAlpha = body.config.threshold;
      }
      if (body.config.search_type) {
        config.searchType = body.config.search_type;
      }
    }

    // Perform analysis
    const results = await analyzeWhyNotStandalone({
      query: body.query,
      userId: authResult.userId,
      collectionId: body.collection_id,
      documentIds,
      config,
    });

    return NextResponse.json({
      success: true,
      query: body.query,
      collection_id: body.collection_id,
      config: {
        top_k: config.topK || 10,
        rerank_enabled: config.rerankEnabled || false,
        rerank_top_n: config.rerankTopN || 5,
        threshold: config.hybridAlpha || 0.5,
        search_type: config.searchType || 'hybrid',
      },
      results,
      analyzed_count: results.length,
      found_count: results.filter((r) => r.found).length,
      blocked_count: results.filter((r) => !r.found).length,
    });
  } catch (error) {
    console.error('Standalone why-not analysis error:', error);
    return ServerErrors.internal('why_not_standalone');
  }
}
