/**
 * /api/doc-to-db/structures
 *
 * CRUD operations for document structures.
 *
 * GET - List structures (with optional filters)
 * DELETE - Delete structures by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';

// ============================================================
// GET - List Structures
// ============================================================

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('document_id');
    const collectionId = searchParams.get('collection_id');
    const structureType = searchParams.get('structure_type');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    // Build query
    const supabase = createServerClient();
    let query = supabase
      .from('document_structures')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (documentId) {
      query = query.eq('document_id', documentId);
    }
    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }
    if (structureType) {
      if (!['table', 'list', 'key_value', 'hierarchy', 'schema'].includes(structureType)) {
        return ValidationErrors.invalidField(
          'structure_type',
          'must be table, list, key_value, hierarchy, or schema'
        );
      }
      query = query.eq('structure_type', structureType);
    }

    // Apply pagination
    const offset = (page - 1) * perPage;
    query = query.range(offset, offset + perPage - 1);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      console.error('Structures list error:', error);
      return ServerErrors.database('list structures');
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/doc-to-db/structures', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json({
      success: true,
      plan,
      data: data || [],
      pagination: {
        page,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage),
      },
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (err) {
    console.error('Structures list error:', err);

    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/structures', method: 'GET', startTime },
        500
      ).catch(console.error);
    }

    return ServerErrors.internal('list structures');
  }
}

// ============================================================
// DELETE - Delete Structure(s)
// ============================================================

export async function DELETE(request: NextRequest) {
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
    let body: { ids?: string[]; document_id?: string };
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate: must have either ids or document_id
    if (!body.ids && !body.document_id) {
      return ValidationErrors.missingField('ids or document_id');
    }

    const supabase = createServerClient();
    let deletedCount = 0;

    if (body.ids && Array.isArray(body.ids)) {
      // Delete by IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      for (const id of body.ids) {
        if (!uuidRegex.test(id)) {
          return ValidationErrors.invalidFormat(`ids[${body.ids.indexOf(id)}]`, 'UUID');
        }
      }

      // Delete structures (cells cascade automatically)
      const { error, count } = await supabase
        .from('document_structures')
        .delete()
        .in('id', body.ids)
        .eq('user_id', userId);

      if (error) {
        console.error('Delete structures error:', error);
        return ServerErrors.database('delete structures');
      }

      deletedCount = count || 0;
    } else if (body.document_id) {
      // Delete all structures for a document
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(body.document_id)) {
        return ValidationErrors.invalidFormat('document_id', 'UUID');
      }

      const { error, count } = await supabase
        .from('document_structures')
        .delete()
        .eq('document_id', body.document_id)
        .eq('user_id', userId);

      if (error) {
        console.error('Delete structures error:', error);
        return ServerErrors.database('delete structures');
      }

      deletedCount = count || 0;
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/doc-to-db/structures', method: 'DELETE', startTime },
      200
    );

    // Build response
    const response = NextResponse.json({
      success: true,
      plan,
      deleted_count: deletedCount,
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (err) {
    console.error('Delete structures error:', err);

    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/structures', method: 'DELETE', startTime },
        500
      ).catch(console.error);
    }

    return ServerErrors.internal('delete structures');
  }
}
