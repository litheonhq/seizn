// Seizn Spring - Chat API Route
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { streamChat, calculateCost } from '@/lib/spring/ai-providers';
import {
  createConversation,
  getConversation,
  createMessage,
  getMessages,
  recordUsage,

  
} from '@/lib/spring/db';
import { AIModel, ChatRequest } from '@/lib/spring/types';
import { autoSelectModel } from '@/lib/spring/model-fallback';



export const runtime = 'nodejs';
export const maxDuration = 60;

// ===========================================
// POST /api/spring/chat
// ===========================================
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse request
    const body: ChatRequest = await request.json();
    const {
      conversation_id,
      message,
      model = 'gpt-4o-mini',
      attachments,
      system_prompt,
      memory_enabled = true,
      stream = true,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 3. Auto-select model with fallback
    const modelSelection = await autoSelectModel(userId, {
      preferredModel: model as AIModel,
      chain: 'default',
    });

    // Check if all quotas exhausted
    if (modelSelection.reason === 'quota_exceeded') {
      return NextResponse.json(
        { error: modelSelection.message, quota_exceeded: true },
        { status: 429 }
      );
    }

    const selectedModel = modelSelection.model;
    const fallbackOccurred = modelSelection.reason === 'fallback';
    const fallbackMessage = modelSelection.message;

    // 5. Get or create conversation
    let conversationId = conversation_id;
    let conversation;

    if (conversationId) {
      conversation = await getConversation(conversationId, userId);
      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    } else {
      conversation = await createConversation(userId, {
        defaultModel: selectedModel,
        systemPrompt: system_prompt,
        memoryEnabled: memory_enabled,
      });
      conversationId = conversation.id;
    }

    // 6. Get conversation history
    const previousMessages = await getMessages(conversationId, userId, { limit: 50 });

    // 7. Inject memories (if enabled)
    let injectedMemories: Array<{ id: string; content: string; similarity: number }> = [];

    if (memory_enabled && conversation.memory_enabled) {
      injectedMemories = await fetchRelevantMemories(userId, message, conversation.memory_namespace);
    }

    // 8. Build messages array
    const systemPrompt = buildSystemPrompt(
      system_prompt || conversation.system_prompt,
      injectedMemories
    );

    const messages = [
      ...previousMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // 9. Save user message
    const userMessage = await createMessage(conversationId, userId, {
      role: 'user',
      content: message,
      attachments,
      injectedMemories: injectedMemories.map((m) => m.id),
    });

    // 10. Stream response
    if (stream) {
      return streamResponse(
        userId,
        conversationId,
        selectedModel,
        messages,
        systemPrompt,
        injectedMemories,
        userMessage.id,
        fallbackOccurred ? { occurred: true, message: fallbackMessage, originalModel: model } : undefined
      );
    }

    // Non-streaming response (simplified)
    const { chat } = await import('@/lib/spring/ai-providers');
    const startTime = Date.now();

    const result = await chat({
      model: selectedModel,
      messages,
      systemPrompt,
    });

    const latencyMs = Date.now() - startTime;
    const costCents = calculateCost(selectedModel, result.inputTokens, result.outputTokens);

    // Save assistant message
    const assistantMessage = await createMessage(conversationId, userId, {
      role: 'assistant',
      content: result.content,
      model: selectedModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs,
      finishReason: result.finishReason,
    });

    // Record usage
    await recordUsage(userId, {
      model: selectedModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costCents,
    });

    return NextResponse.json({
      id: assistantMessage.id,
      conversation_id: conversationId,
      message: assistantMessage,
      usage: {
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        total_tokens: result.inputTokens + result.outputTokens,
      },
      injected_memories: injectedMemories,
      fallback: fallbackOccurred ? { occurred: true, message: fallbackMessage, originalModel: model, actualModel: selectedModel } : undefined,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===========================================
// Streaming Response Helper
// ===========================================
async function streamResponse(
  userId: string,
  conversationId: string,
  model: AIModel,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  systemPrompt: string | undefined,
  injectedMemories: Array<{ id: string; content: string; similarity: number }>,
  _userMessageId: string,
  fallback?: { occurred: boolean; message?: string; originalModel?: string }
) {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial event with conversation info
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'start',
              fallback,
              conversation_id: conversationId,
              injected_memories: injectedMemories,
            })}\n\n`
          )
        );

        // Stream from AI provider
        for await (const chunk of streamChat({
          model,
          messages,
          systemPrompt,
          stream: true,
        })) {
          if (chunk.content) {
            fullContent += chunk.content;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'content',
                  content: chunk.content,
                })}\n\n`
              )
            );
          }

          if (chunk.done && chunk.usage) {
            inputTokens = chunk.usage.inputTokens;
            outputTokens = chunk.usage.outputTokens;
          }
        }

        const latencyMs = Date.now() - startTime;
        const costCents = calculateCost(model, inputTokens, outputTokens);

        // Save assistant message
        const assistantMessage = await createMessage(conversationId, userId, {
          role: 'assistant',
          content: fullContent,
          model,
          inputTokens,
          outputTokens,
          latencyMs,
          finishReason: 'stop',
        });

        // Record usage
        await recordUsage(userId, {
          model,
          inputTokens,
          outputTokens,
          costCents,
        });

        // Send completion event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'done',
              message_id: assistantMessage.id,
              usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens,
              },
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: 'Stream failed',
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ===========================================
// Memory Integration
// ===========================================
async function fetchRelevantMemories(
  userId: string,
  query: string,
  namespace?: string | null
): Promise<Array<{ id: string; content: string; similarity: number }>> {
  try {

    // Use Summer's memory search
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        query,
        top_k: 5,
        threshold: 0.7,
        namespace,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.memories_used || data.memories || []).map((m: { id: string; content: string; similarity: number }) => ({
      id: m.id,
      content: m.content,
      similarity: m.similarity,
    }));
  } catch (error) {
    console.error('Memory fetch error:', error);
    return [];
  }
}

// ===========================================
// System Prompt Builder
// ===========================================
function buildSystemPrompt(
  basePrompt: string | undefined | null,
  memories: Array<{ content: string; similarity: number }>
): string | undefined {
  const parts: string[] = [];

  if (basePrompt) {
    parts.push(basePrompt);
  }

  if (memories.length > 0) {
    parts.push('\n\n## Relevant Context from User Memory:');
    memories.forEach((m, i) => {
      parts.push(`${i + 1}. ${m.content}`);
    });
    parts.push('\nUse this context to provide personalized responses when relevant.');
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}
