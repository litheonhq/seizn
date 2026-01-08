// Memory-Augmented Query API - RAG-style responses using stored memories
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding, generateWithMemories } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

// POST /api/query - Query with memory-augmented context
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

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
      await logRequest(
        { userId, keyId, endpoint: '/api/query', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'query (string) is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Generate query embedding
    const queryEmbedding = await createQueryEmbedding(query);

    // Search for relevant memories using vector similarity
    const { data: memories, error: searchError } = await supabase.rpc(
      'search_memories',
      {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: top_k,
        match_threshold: 0.5,
        match_namespace: namespace || null,
      }
    );

    if (searchError) {
      console.error('Memory search error:', searchError);
      // Fall back to basic query without memories
    }

    const relevantMemories = memories || [];

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

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/query', method: 'POST', startTime },
      200,
      {
        input: Math.ceil((query.length + memoryContents.join(' ').length) / 4),
        output: Math.ceil(response.length / 4),
        embedding: Math.ceil(query.length / 4),
      }
    );

    return NextResponse.json({
      response,
      memories_used: include_memories
        ? relevantMemories.map(
            (m: { id: string; content: string; similarity: number }) => ({
              id: m.id,
              content: m.content,
              similarity: m.similarity,
            })
          )
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
