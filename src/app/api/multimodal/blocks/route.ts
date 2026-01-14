import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import {
  queryBlocks,
  getBlock,
  deleteBlocksByDocument,
} from '@/lib/multimodal';
import type { BlockType, BlockQueryOptions } from '@/lib/multimodal';

/**
 * GET /api/multimodal/blocks
 *
 * Query document blocks with filters.
 *
 * Query Parameters:
 * - collection_id: Required - Collection ID
 * - document_id: Filter by document
 * - block_types: Comma-separated block types (text,heading,table,etc.)
 * - page_start: Start page number
 * - page_end: End page number
 * - limit: Max results (default: 100)
 * - offset: Pagination offset
 * - order_by: Sort field (orderIndex, pageNumber, createdAt)
 * - order_dir: Sort direction (asc, desc)
 *
 * Response:
 * {
 *   "success": true,
 *   "blocks": [...],
 *   "total": 45,
 *   "hasMore": false
 * }
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id');
    const documentId = searchParams.get('document_id');
    const blockTypesParam = searchParams.get('block_types');
    const pageStart = searchParams.get('page_start');
    const pageEnd = searchParams.get('page_end');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const orderBy = searchParams.get('order_by');
    const orderDir = searchParams.get('order_dir');
    const blockId = searchParams.get('block_id');

    // If block_id is provided, return single block
    if (blockId) {
      const block = await getBlock(userId, blockId);

      if (!block) {
        await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'GET', startTime }, 404);
        return NotFoundErrors.resource('Block', blockId);
      }

      await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'GET', startTime }, 200);

      const response = NextResponse.json({
        success: true,
        block,
      });

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    // Validate collection_id
    if (!collectionId) {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'GET', startTime }, 400);
      return ValidationErrors.missingField('collection_id');
    }

    // Build query options
    const options: BlockQueryOptions = {};

    if (documentId) {
      options.documentId = documentId;
    }

    if (blockTypesParam) {
      const types = blockTypesParam.split(',').map((t) => t.trim()) as BlockType[];
      const validTypes: BlockType[] = ['text', 'table', 'figure', 'heading', 'list', 'code', 'caption'];
      const invalidTypes = types.filter((t) => !validTypes.includes(t));
      if (invalidTypes.length > 0) {
        await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'GET', startTime }, 400);
        return ValidationErrors.invalidField('block_types', `Invalid types: ${invalidTypes.join(', ')}`);
      }
      options.blockTypes = types;
    }

    if (pageStart || pageEnd) {
      options.pageRange = {};
      if (pageStart) options.pageRange.start = parseInt(pageStart, 10);
      if (pageEnd) options.pageRange.end = parseInt(pageEnd, 10);
    }

    options.limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 100;
    options.offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (orderBy && ['orderIndex', 'pageNumber', 'createdAt'].includes(orderBy)) {
      options.orderBy = orderBy as 'orderIndex' | 'pageNumber' | 'createdAt';
    }

    if (orderDir && ['asc', 'desc'].includes(orderDir)) {
      options.orderDirection = orderDir as 'asc' | 'desc';
    }

    // Query blocks
    const blocks = await queryBlocks(userId, collectionId, options);

    // Log request
    await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'GET', startTime }, 200);

    const response = NextResponse.json({
      success: true,
      blocks,
      count: blocks.length,
      hasMore: blocks.length === options.limit,
      latency_ms: Date.now() - startTime,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Multimodal blocks query error:', err);
    return ServerErrors.internal('blocks-query');
  }
}

/**
 * DELETE /api/multimodal/blocks
 *
 * Delete blocks by document ID.
 *
 * Query Parameters:
 * - document_id: Required - Document ID to delete blocks for
 *
 * Response:
 * {
 *   "success": true,
 *   "deletedCount": 45
 * }
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('document_id');

    if (!documentId) {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'DELETE', startTime }, 400);
      return ValidationErrors.missingField('document_id');
    }

    // Delete blocks
    const deletedCount = await deleteBlocksByDocument(userId, documentId);

    // Log request
    await logRequest({ userId, keyId, endpoint: '/api/multimodal/blocks', method: 'DELETE', startTime }, 200);

    const response = NextResponse.json({
      success: true,
      deletedCount,
      latency_ms: Date.now() - startTime,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Multimodal blocks delete error:', err);
    return ServerErrors.internal('blocks-delete');
  }
}
