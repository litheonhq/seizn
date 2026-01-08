// Memory-Augmented Query API - RAG-style responses using stored memories
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { hashApiKey } from '@/lib/api-key';
import { createQueryEmbedding, generateWithMemories } from '@/lib/ai';

// POST /api/query - Query with memory-augmented context
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const keyHash = hashApiKey(apiKey);

    // Find the API key and get user
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash);

    // Parse request body
    const body = await request.json();
    const {
      query,
      model = 'haiku',
      top_k = 5,
      namespace,
      include_memories = true,
    } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'query (string) is required' },
        { status: 400 }
      );
    }

    // Generate query embedding
    const queryEmbedding = await createQueryEmbedding(query);

    // Search for relevant memories using vector similarity
    const { data: memories, error: searchError } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_user_id: keyData.user_id,
      match_count: top_k,
      match_threshold: 0.5,
    });

    if (searchError) {
      console.error('Memory search error:', searchError);
      // Fall back to basic query without memories
    }

    // Filter by namespace if provided
    let relevantMemories = memories || [];
    if (namespace && relevantMemories.length > 0) {
      relevantMemories = relevantMemories.filter(
        (m: { namespace?: string }) => m.namespace === namespace
      );
    }

    // Extract memory contents for context
    const memoryContents = relevantMemories.map(
      (m: { content: string }) => m.content
    );

    // Generate response with memory context
    const response = await generateWithMemories(
      query,
      memoryContents,
      model as 'haiku' | 'sonnet'
    );

    return NextResponse.json({
      response,
      memories_used: include_memories
        ? relevantMemories.map((m: { id: string; content: string; similarity: number }) => ({
            id: m.id,
            content: m.content,
            similarity: m.similarity,
          }))
        : undefined,
      model_used: model,
    });

  } catch (error) {
    console.error('Query API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
