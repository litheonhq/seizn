import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { logMemoryAccess } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Merge extra headers into a NextResponse */
function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

// GET /api/memories/[id] - Get a specific memory
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    // Get memory
    const { data: memory, error: fetchError } = await supabase
      .from('memories')
      .select('id, content, memory_type, tags, scope, source, confidence, importance, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    // Audit log: single memory read
    logMemoryAccess(request, userId, keyId, 'read', {
      memoryId: id,
    }).catch(console.error);

    return withHeaders(
      NextResponse.json({
        success: true,
        memory: memory,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('Get memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/memories/[id] - Update a memory
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    // Validate fields before building update object
    const VALID_MEMORY_TYPES = ['fact', 'preference', 'experience', 'relationship', 'instruction'];
    if (body.memory_type && !VALID_MEMORY_TYPES.includes(body.memory_type)) {
      return NextResponse.json(
        { error: `memory_type must be one of: ${VALID_MEMORY_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    if (body.tags) {
      if (!Array.isArray(body.tags) || body.tags.length > 50 ||
          body.tags.some((t: unknown) => typeof t !== 'string' || (t as string).length > 100)) {
        return NextResponse.json(
          { error: 'tags must be an array of max 50 strings, each max 100 characters' },
          { status: 400 }
        );
      }
      // Deduplicate tags
      body.tags = [...new Set(body.tags)];
    }
    if (body.importance !== undefined) {
      const imp = Number(body.importance);
      if (!Number.isFinite(imp) || imp < 1 || imp > 10) {
        return NextResponse.json(
          { error: 'importance must be a number between 1 and 10' },
          { status: 400 }
        );
      }
    }

    // Build update object (only allowed fields — namespace is not updatable)
    const updateData: Record<string, unknown> = {};
    if (body.memory_type) updateData.memory_type = body.memory_type;
    if (body.tags) updateData.tags = body.tags;
    if (body.importance !== undefined) updateData.importance = body.importance;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update memory
    const { data: memory, error: updateError } = await supabase
      .from('memories')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id, content, memory_type, tags, importance, updated_at')
      .single();

    if (updateError || !memory) {
      return NextResponse.json(
        { error: 'Memory not found or update failed' },
        { status: 404 }
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        memory: memory,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('Update memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/memories/[id] - Soft delete a memory
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    // Soft delete (set is_deleted = true)
    const { data: memory, error: deleteError } = await supabase
      .from('memories')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id')
      .single();

    if (deleteError || !memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        message: 'Memory deleted',
        id: memory.id,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('Delete memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
