/**
 * /api/doc-to-db/structures/[id]
 *
 * Operations on a specific structure.
 *
 * GET - Get structure with cells
 * PATCH - Update structure metadata
 * DELETE - Delete structure
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================
// GET - Get Structure with Cells
// ============================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Get structure ID from params
    const { id } = await params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return ValidationErrors.invalidFormat('id', 'UUID');
    }

    const supabase = createServerClient();

    // Get structure
    const { data: structure, error: structureError } = await supabase
      .from('document_structures')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (structureError || !structure) {
      return NotFoundErrors.resource('Structure', id);
    }

    // Check if cells should be included
    const { searchParams } = new URL(request.url);
    const includeCells = searchParams.get('include_cells') !== 'false';

    let cells: unknown[] = [];
    if (includeCells) {
      const { data: cellData, error: cellsError } = await supabase
        .from('structure_cells')
        .select('*')
        .eq('structure_id', id)
        .order('row_index', { ascending: true })
        .order('col_index', { ascending: true });

      if (!cellsError && cellData) {
        cells = cellData;
      }
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/doc-to-db/structures/${id}`, method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json({
      success: true,
      plan,
      data: {
        ...structure,
        cells: includeCells ? cells : undefined,
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
    console.error('Get structure error:', err);

    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/structures/[id]', method: 'GET', startTime },
        500
      ).catch(console.error);
    }

    return ServerErrors.internal('get structure');
  }
}

// ============================================================
// PATCH - Update Structure
// ============================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    // Get structure ID from params
    const { id } = await params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return ValidationErrors.invalidFormat('id', 'UUID');
    }

    // Parse request body
    let body: {
      title?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate at least one field to update
    if (!body.title && !body.description && !body.metadata) {
      return ValidationErrors.invalidBody('At least one field required: title, description, or metadata');
    }

    const supabase = createServerClient();

    // Check structure exists and belongs to user
    const { data: existing, error: checkError } = await supabase
      .from('document_structures')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existing) {
      return NotFoundErrors.resource('Structure', id);
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    // Update structure
    const { data: updated, error: updateError } = await supabase
      .from('document_structures')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Update structure error:', updateError);
      return ServerErrors.database('update structure');
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/doc-to-db/structures/${id}`, method: 'PATCH', startTime },
      200
    );

    // Build response
    const response = NextResponse.json({
      success: true,
      plan,
      data: updated,
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (err) {
    console.error('Update structure error:', err);

    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/structures/[id]', method: 'PATCH', startTime },
        500
      ).catch(console.error);
    }

    return ServerErrors.internal('update structure');
  }
}

// ============================================================
// DELETE - Delete Structure
// ============================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Get structure ID from params
    const { id } = await params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return ValidationErrors.invalidFormat('id', 'UUID');
    }

    const supabase = createServerClient();

    // Delete structure (cells cascade automatically)
    const { error, count } = await supabase
      .from('document_structures')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Delete structure error:', error);
      return ServerErrors.database('delete structure');
    }

    if (count === 0) {
      return NotFoundErrors.resource('Structure', id);
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/doc-to-db/structures/${id}`, method: 'DELETE', startTime },
      200
    );

    // Build response
    const response = NextResponse.json({
      success: true,
      plan,
      deleted: true,
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (err) {
    console.error('Delete structure error:', err);

    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/structures/[id]', method: 'DELETE', startTime },
        500
      ).catch(console.error);
    }

    return ServerErrors.internal('delete structure');
  }
}
