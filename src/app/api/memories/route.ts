import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding, createQueryEmbedding } from '@/lib/ai';
import type { AddMemoryRequest, SearchMemoryRequest } from '@/types/database';

// POST /api/memories - Add a new memory
export async function POST(request: NextRequest) {
  try {
    const body: AddMemoryRequest = await request.json();

    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    // TODO: Get user_id from auth session
    // For now, use a header-based approach for API key auth
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Verify API key and get user_id
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key_prefix', apiKey.substring(0, 8))
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const userId = keyData.user_id;

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
        scope: body.scope || 'user',
        session_id: body.session_id || null,
        agent_id: body.agent_id || null,
        source: body.source || 'api',
        confidence: 1.0,
        importance: 5,
      })
      .select('id, content, memory_type, tags, created_at')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to add memory' },
        { status: 500 }
      );
    }

    // Update API key last used
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_prefix', apiKey.substring(0, 8));

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
  try {
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query');
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key_prefix', apiKey.substring(0, 8))
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const userId = keyData.user_id;

    // Parse search parameters
    const limit = parseInt(searchParams.get('limit') || '10');
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');

    // Create query embedding
    const queryEmbedding = await createQueryEmbedding(query);

    // Search using the database function
    const { data: results, error: searchError } = await supabase
      .rpc('search_memories', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: threshold,
      });

    if (searchError) {
      console.error('Search error:', searchError);
      return NextResponse.json(
        { error: 'Search failed' },
        { status: 500 }
      );
    }

    // Update API key last used
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_prefix', apiKey.substring(0, 8));

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
