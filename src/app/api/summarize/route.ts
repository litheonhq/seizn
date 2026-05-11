import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding, summarizeConversation } from '@/lib/ai';
import type { ConversationMessage } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

interface SummarizeRequest {
  messages: ConversationMessage[];
  save_memories?: boolean;
  namespace?: string;
  session_id?: string;
  agent_id?: string;
  model?: 'haiku' | 'sonnet';
}

// POST /api/summarize - Summarize a conversation
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate and check usage limits
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: SummarizeRequest = await request.json();

    // Validate messages
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summarize', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'Messages array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate message format
    for (const msg of body.messages) {
      if (!msg.role || !msg.content) {
        await logRequest(
          { userId, keyId, endpoint: '/api/summarize', method: 'POST', startTime },
          400
        );
        return NextResponse.json(
          { error: 'Each message must have role and content' },
          { status: 400 }
        );
      }
    }

    const supabase = createServerClient();

    // Get existing memories to avoid duplicates
    const { data: existingMemories } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const existingContents = existingMemories?.map(m => m.content) || [];

    // Summarize conversation
    const summary = await summarizeConversation(body.messages, {
      model: body.model || 'haiku',
      existingMemories: existingContents,
    });

    // Optionally save extracted memories
    let savedMemories: { id: string; content: string }[] = [];

    if (body.save_memories && summary.extracted_memories.length > 0) {
      const memoriesToSave = await Promise.all(
        summary.extracted_memories.map(async (mem) => {
          const embedding = await createEmbedding(mem.content);
          return {
            user_id: userId,
            content: mem.content,
            embedding,
            memory_type: mem.memory_type,
            tags: mem.tags,
            namespace: body.namespace || 'default',
            scope: 'user' as const,
            session_id: body.session_id || null,
            agent_id: body.agent_id || null,
            source: 'summarization',
            confidence: mem.confidence,
            importance: mem.importance,
            is_encrypted: false,
            is_deleted: false,
            deleted_at: null,
          };
        })
      );

      const { data: inserted, error: insertError } = await supabase
        .from('memories')
        .insert(memoriesToSave)
        .select('id, content');

      if (insertError) {
        console.error('Memory insert error:', insertError);
      } else {
        savedMemories = inserted || [];
      }
    }

    // Estimate tokens used
    const inputTokens = body.messages.reduce((acc, m) => acc + m.content.length, 0) / 4;
    const outputTokens = JSON.stringify(summary).length / 4;

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summarize', method: 'POST', startTime },
      200,
      {
        input: Math.ceil(inputTokens),
        output: Math.ceil(outputTokens),
        embedding: body.save_memories ? summary.extracted_memories.length * 100 : 0,
      }
    );

    return NextResponse.json({
      success: true,
      summary: {
        text: summary.summary,
        topic: summary.topic,
        key_points: summary.key_points,
        message_count: summary.message_count,
        time_range: summary.time_range,
      },
      extracted_memories: summary.extracted_memories.length,
      saved_memories: body.save_memories ? savedMemories : undefined,
    });
  } catch (error) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
