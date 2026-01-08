import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding, createQueryEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { trackMemoryAccess } from '@/lib/memory-optimizer';
import type { AddMemoryRequest } from '@/types/database';

// POST /api/memories - Add a new memory
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: AddMemoryRequest = await request.json();

    if (!body.content || body.content.trim().length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Create embedding for the memory content
    const embedding = await createEmbedding(body.content);

    // Insert memory
    const { data: memory, error: insertError } = await supabase
      .from('memories')
      .insert({
        user_id: userId,
        content: body.content,
        embedding: embedding,
        memory_type: body.memory_type || 'fact',
        tags: body.tags || [],
        namespace: body.namespace || 'default',
        scope: body.scope || 'user',
        session_id: body.session_id || null,
        agent_id: body.agent_id || null,
        source: body.source || 'api',
        confidence: 1.0,
        importance: 5,
      })
      .select('id, content, memory_type, tags, namespace, created_at')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
        500
      );
      return NextResponse.json(
        { error: 'Failed to add memory' },
        { status: 500 }
      );
    }

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      200,
      { embedding: body.content.length } // Approximate token count
    );

    return NextResponse.json({
      success: true,
      memory: memory,
    });
  } catch (error) {
    console.error('Add memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/memories - Search memories
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query');
    if (!query) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        400
      );
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Parse search parameters
    const limit = parseInt(searchParams.get('limit') || '10');
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    const namespace = searchParams.get('namespace') || null;

    const supabase = createServerClient();

    // Create query embedding
    const queryEmbedding = await createQueryEmbedding(query);

    // Search using the database function
    const { data: results, error: searchError } = await supabase.rpc(
      'search_memories',
      {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: threshold,
        match_namespace: namespace,
      }
    );

    if (searchError) {
      console.error('Search error:', searchError);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        500
      );
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
      200,
      { embedding: query.length }
    );

    // Track access for returned memories (background, non-blocking)
    if (results && results.length > 0) {
      Promise.all(
        results.map((m: { id: string }) => trackMemoryAccess(m.id))
      ).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      results: results || [],
      count: results?.length || 0,
    });
  } catch (error) {
    console.error('Search memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/memories - Delete memories by IDs
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const ids = searchParams.get('ids')?.split(',').filter(Boolean);
    if (!ids || ids.length === 0) {
      return NextResponse.json(
        { error: 'Memory IDs required (comma-separated)' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Soft delete memories (only user's own)
    const { error } = await supabase
      .from('memories')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', userId);

    if (error) {
      console.error('Delete error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
        500
      );
      return NextResponse.json(
        { error: 'Failed to delete memories' },
        { status: 500 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: ids.length,
    });
  } catch (error) {
    console.error('Delete memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
