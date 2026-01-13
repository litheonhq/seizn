import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  listKnowledgeGaps,
  createKnowledgeGap,
  getGapStatistics,
  type GapStatus,
  type GapType,
} from '@/lib/knowledge-gap';

/**
 * GET /api/knowledge-gaps
 * List knowledge gaps with optional filters
 *
 * Query params:
 * - status: Filter by status (open, in_progress, resolved, wont_fix)
 * - gap_type: Filter by gap type
 * - collection_id: Filter by collection
 * - page: Page number (default: 1)
 * - page_size: Items per page (default: 20)
 * - include_stats: Include statistics summary (default: false)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as GapStatus | null;
    const gapType = searchParams.get('gap_type') as GapType | null;
    const collectionId = searchParams.get('collection_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '20', 10), 100);
    const includeStats = searchParams.get('include_stats') === 'true';

    // Fetch gaps
    const { gaps, total } = await listKnowledgeGaps(userId, {
      status: status || undefined,
      gapType: gapType || undefined,
      collectionId: collectionId || undefined,
      page,
      pageSize,
    });

    // Optionally include statistics
    let statistics;
    if (includeStats) {
      statistics = await getGapStatistics(userId);
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/knowledge-gaps', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        gaps,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        statistics,
      },
      { status: 200 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('List knowledge gaps error:', err);
    return ServerErrors.internal('list_knowledge_gaps');
  }
}

/**
 * POST /api/knowledge-gaps
 * Create a new knowledge gap manually
 *
 * Body:
 * {
 *   "query_text": "string",
 *   "gap_type": "missing_entity" | "outdated_doc" | ...,
 *   "collection_id"?: "uuid",
 *   "missing_entities"?: [...],
 *   "suggested_sources"?: [...],
 *   "confidence"?: number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const body = await request.json();

    // Validate required fields
    if (!body.query_text || typeof body.query_text !== 'string') {
      return ValidationErrors.missingField('query_text');
    }

    if (!body.gap_type || typeof body.gap_type !== 'string') {
      return ValidationErrors.missingField('gap_type');
    }

    const validGapTypes: GapType[] = [
      'missing_entity',
      'missing_table',
      'outdated_doc',
      'permission_denied',
      'coverage_gap',
      'domain_mismatch',
    ];

    if (!validGapTypes.includes(body.gap_type as GapType)) {
      return ValidationErrors.invalidField('gap_type', `must be one of: ${validGapTypes.join(', ')}`);
    }

    // Create the gap
    const gap = await createKnowledgeGap({
      userId,
      queryText: body.query_text,
      gapType: body.gap_type as GapType,
      collectionId: body.collection_id,
      missingEntities: body.missing_entities || [],
      suggestedSources: body.suggested_sources || [],
      relatedDocs: body.related_docs || [],
      confidence: body.confidence || 0.5,
      analysisMetadata: body.metadata || {},
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/knowledge-gaps', method: 'POST', startTime },
      201
    );

    const response = NextResponse.json(
      {
        success: true,
        gap,
      },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Create knowledge gap error:', err);
    return ServerErrors.internal('create_knowledge_gap');
  }
}
