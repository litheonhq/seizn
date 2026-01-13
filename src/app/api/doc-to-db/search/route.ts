/**
 * POST /api/doc-to-db/search
 *
 * Semantic search within document structures and cells.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { searchStructures, searchCells } from '@/lib/doc-to-db';

interface SearchRequestBody {
  query: string;
  search_type?: 'structures' | 'cells' | 'both';
  collection_id?: string;
  structure_id?: string;
  structure_type?: string;
  data_type?: string;
  limit?: number;
  similarity_threshold?: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;
  let keyId: string | undefined;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    userId = authResult.userId;
    keyId = authResult.keyId;
    const { plan, rateLimitHeaders } = authResult;

    // Parse request body
    let body: SearchRequestBody;
    try {
      body = await request.json();
    } catch {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/search', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate query
    if (!body.query || typeof body.query !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/search', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('query');
    }

    if (body.query.trim().length < 2) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/search', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField('query', 'must be at least 2 characters');
    }

    // Validate search_type
    const searchType = body.search_type || 'both';
    if (!['structures', 'cells', 'both'].includes(searchType)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/search', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField('search_type', 'must be structures, cells, or both');
    }

    // Validate UUIDs if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (body.collection_id && !uuidRegex.test(body.collection_id)) {
      return ValidationErrors.invalidFormat('collection_id', 'UUID');
    }

    if (body.structure_id && !uuidRegex.test(body.structure_id)) {
      return ValidationErrors.invalidFormat('structure_id', 'UUID');
    }

    // Validate structure_type if provided
    if (body.structure_type) {
      if (!['table', 'list', 'key_value', 'hierarchy', 'schema'].includes(body.structure_type)) {
        return ValidationErrors.invalidField(
          'structure_type',
          'must be table, list, key_value, hierarchy, or schema'
        );
      }
    }

    // Validate data_type if provided
    if (body.data_type) {
      const validDataTypes = [
        'text',
        'number',
        'date',
        'currency',
        'percentage',
        'boolean',
        'email',
        'url',
        'phone',
        'unknown',
      ];
      if (!validDataTypes.includes(body.data_type)) {
        return ValidationErrors.invalidField('data_type', `must be one of: ${validDataTypes.join(', ')}`);
      }
    }

    // Validate limit
    const limit = Math.min(body.limit || 20, 100);

    // Validate similarity_threshold
    const similarityThreshold = body.similarity_threshold ?? 0.5;
    if (similarityThreshold < 0 || similarityThreshold > 1) {
      return ValidationErrors.invalidField('similarity_threshold', 'must be between 0 and 1');
    }

    // Execute searches
    const results: {
      structures?: unknown[];
      cells?: unknown[];
    } = {};

    if (searchType === 'structures' || searchType === 'both') {
      try {
        const structureResults = await searchStructures(userId, body.query, {
          collectionId: body.collection_id,
          structureType: body.structure_type,
          limit,
          similarityThreshold,
        });
        results.structures = structureResults || [];
      } catch (error) {
        console.error('Structure search error:', error);
        results.structures = [];
      }
    }

    if (searchType === 'cells' || searchType === 'both') {
      try {
        const cellResults = await searchCells(userId, body.query, {
          structureId: body.structure_id,
          dataType: body.data_type,
          limit,
          similarityThreshold,
        });
        results.cells = cellResults || [];
      } catch (error) {
        console.error('Cell search error:', error);
        results.cells = [];
      }
    }

    // Log request (embedding token used for query)
    await logRequest(
      { userId, keyId, endpoint: '/api/doc-to-db/search', method: 'POST', startTime },
      200,
      { embedding: 1 } // One embedding generated for query
    );

    // Build response
    const response = NextResponse.json({
      success: true,
      plan,
      query: body.query,
      search_type: searchType,
      results: {
        structures: results.structures || [],
        cells: results.cells || [],
      },
      counts: {
        structures: results.structures?.length || 0,
        cells: results.cells?.length || 0,
      },
      duration_ms: Date.now() - startTime,
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (err) {
    console.error('Doc-to-DB search error:', err);

    // Log error
    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/search', method: 'POST', startTime },
        500
      ).catch(console.error);
    }

    // Return appropriate error response
    if (err instanceof Error) {
      if (err.message.includes('VOYAGE_API_KEY')) {
        return ServerErrors.embedding();
      }
    }

    return ServerErrors.internal('structure search');
  }
}
