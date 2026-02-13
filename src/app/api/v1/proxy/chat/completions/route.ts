/**
 * Seizn Proxy — OpenAI-Compatible Chat Completions
 *
 * Drop-in replacement for OpenAI's /v1/chat/completions.
 * Developers change ONE line: baseURL → https://www.seizn.com/api/v1/proxy
 *
 * What happens transparently:
 * 1. Authenticate via Seizn API key
 * 2. Extract user's latest message
 * 3. Search Seizn memory for relevant context
 * 4. Inject memories into system prompt
 * 5. Forward to target LLM provider (OpenAI, Anthropic, etc.)
 * 6. Return response in OpenAI-compatible format
 * 7. (Async) Extract and store new memories from conversation
 *
 * @example
 * ```python
 * # Python — ONE line change
 * client = OpenAI(
 *   base_url="https://www.seizn.com/api/v1/proxy",   # ← only change
 *   api_key="szn_your_key",                            # Seizn key
 *   default_headers={"x-provider-key": "sk-..."}       # Provider key
 * )
 * # Everything else works exactly the same
 * response = client.chat.completions.create(
 *   model="gpt-4o",
 *   messages=[{"role": "user", "content": "Hello!"}]
 * )
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { computeEmbedding } from '@/lib/embeddings';

// ============================================
// Types
// ============================================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

interface ProxyConfig {
  /** Target provider (openai, anthropic, google, custom) */
  provider: string;
  /** Base URL for the target provider */
  targetUrl: string;
  /** API key for the target provider */
  providerKey: string;
}

interface MemoryContext {
  id: string;
  content: string;
  type: string;
  relevance: number;
}

// Provider URL mapping
const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};

// ============================================
// Helpers
// ============================================

async function resolveAuth(
  request: NextRequest
): Promise<{ userId: string; keyId: string | null } | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }

  // Fallback: session auth
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

function resolveProvider(request: NextRequest): ProxyConfig | null {
  // Check for provider key in various headers
  const providerKey =
    request.headers.get('x-provider-key') ||
    request.headers.get('x-openai-key') ||
    request.headers.get('x-api-key-provider');

  if (!providerKey) return null;

  // Detect provider from key prefix or explicit header
  const explicitProvider = request.headers.get('x-provider')?.toLowerCase();

  let provider = 'openai'; // default
  if (explicitProvider && PROVIDER_URLS[explicitProvider]) {
    provider = explicitProvider;
  } else if (providerKey.startsWith('sk-ant-')) {
    provider = 'anthropic';
  } else if (providerKey.startsWith('gsk_')) {
    provider = 'groq';
  }

  // Allow custom base URL override
  const customUrl = request.headers.get('x-provider-base-url');

  return {
    provider,
    targetUrl: customUrl || PROVIDER_URLS[provider] || PROVIDER_URLS.openai,
    providerKey,
  };
}

/**
 * Search for relevant memories to inject into the conversation.
 */
async function searchRelevantMemories(
  userId: string,
  query: string,
  limit: number = 5,
  threshold: number = 0.65
): Promise<MemoryContext[]> {
  try {
    const supabase = createServerClient();

    // Generate embedding for the query
    const queryEmbedding = await computeEmbedding(query, 'query');

    // Search memories via pgvector
    const { data: memories, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: userId,
    });

    if (error || !memories) return [];

    return memories.map((m: { id: string; content: string; memory_type: string; similarity: number }) => ({
      id: m.id,
      content: m.content,
      type: m.memory_type || 'fact',
      relevance: m.similarity,
    }));
  } catch {
    // Graceful degradation: don't break the proxy if memory search fails
    return [];
  }
}

/**
 * Inject memories into the system message.
 */
function injectMemories(
  messages: ChatMessage[],
  memories: MemoryContext[]
): ChatMessage[] {
  if (memories.length === 0) return messages;

  const memoryBlock = memories
    .map((m) => `- [${m.type}] ${m.content}`)
    .join('\n');

  const injection = `\n\n<seizn:memory>\nRelevant user context from memory:\n${memoryBlock}\n</seizn:memory>`;

  const result = [...messages];
  const systemIdx = result.findIndex((m) => m.role === 'system');

  if (systemIdx >= 0) {
    result[systemIdx] = {
      ...result[systemIdx],
      content: (result[systemIdx].content || '') + injection,
    };
  } else {
    result.unshift({
      role: 'system',
      content: `You are a helpful assistant.${injection}`,
    });
  }

  return result;
}

/**
 * Extract the latest user message as the search query.
 */
function extractQuery(messages: ChatMessage[]): string {
  const userMessages = messages.filter((m) => m.role === 'user' && m.content);
  if (userMessages.length === 0) return '';
  return (userMessages[userMessages.length - 1].content || '').slice(0, 500);
}

/**
 * Async: extract and store memories from the conversation.
 * This runs after the response is sent, so it doesn't add latency.
 */
async function extractAndStoreMemories(
  userId: string,
  messages: ChatMessage[],
  assistantResponse: string
): Promise<void> {
  try {
    const supabase = createServerClient();

    // Build conversation text for extraction
    const conversationText = messages
      .filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const fullText = `${conversationText}\nassistant: ${assistantResponse}`;

    // Use Claude Haiku for lightweight extraction
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 512,
        system: `Extract memorable facts from the conversation. Return ONLY a JSON array of objects with "content" (string, third person) and "type" (one of: fact, preference, experience, instruction). Return [] if nothing worth remembering. Be selective - only extract genuinely useful information. Do not extract greetings, small talk, or generic questions.`,
        messages: [
          {
            role: 'user',
            content: fullText.slice(0, 4000),
          },
        ],
      }),
    });

    if (!extractionResponse.ok) return;

    const extractionData = await extractionResponse.json();
    const extractedText = extractionData.content?.[0]?.text?.trim() || '[]';

    let extracted: Array<{ content: string; type: string }>;
    try {
      extracted = JSON.parse(extractedText);
    } catch {
      return;
    }

    if (!Array.isArray(extracted) || extracted.length === 0) return;

    // Store each extracted memory
    for (const item of extracted.slice(0, 5)) {
      if (!item.content || item.content.length < 10) continue;

      const embedding = await computeEmbedding(item.content, 'document');

      // Dedup check
      const { data: existing } = await supabase.rpc('search_memories', {
        query_embedding: embedding,
        match_threshold: 0.92,
        match_count: 1,
        p_user_id: userId,
      });

      if (existing && existing.length > 0) continue; // Already exists

      await supabase.from('memories').insert({
        user_id: userId,
        content: item.content,
        embedding,
        memory_type: item.type || 'fact',
        source: 'proxy_extraction',
        importance: 5,
        tags: ['auto-extracted', 'proxy'],
      });
    }
  } catch {
    // Never let extraction failure affect the proxy
  }
}

// ============================================
// Route Handler
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 1. Authenticate via Seizn
  const authResult = await resolveAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId, keyId } = authResult;

  // 2. Resolve target provider
  const providerConfig = resolveProvider(request);
  if (!providerConfig) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Missing provider API key. Set x-provider-key header with your OpenAI/Anthropic/etc key.',
          type: 'invalid_request_error',
          code: 'missing_provider_key',
        },
      },
      { status: 400 }
    );
  }

  // 3. Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', type: 'invalid_request_error' } },
      { status: 400 }
    );
  }

  const messages = (body.messages as ChatMessage[]) || [];
  const stream = body.stream === true;

  // 4. Extract query and search memories
  const query = extractQuery(messages);
  let memories: MemoryContext[] = [];

  if (query) {
    // Check proxy-specific headers for memory config
    const memoryLimit = parseInt(request.headers.get('x-seizn-memory-limit') || '5', 10);
    const memoryThreshold = parseFloat(request.headers.get('x-seizn-memory-threshold') || '0.65');
    const disableMemory = request.headers.get('x-seizn-memory') === 'false';

    if (!disableMemory) {
      memories = await searchRelevantMemories(userId, query, memoryLimit, memoryThreshold);
    }
  }

  // 5. Inject memories into messages
  const enhancedMessages = injectMemories(messages, memories);

  // 6. Forward to target provider
  const forwardBody = {
    ...body,
    messages: enhancedMessages,
  };

  try {
    const providerResponse = await fetch(providerConfig.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.providerKey}`,
      },
      body: JSON.stringify(forwardBody),
    });

    // 7. Handle streaming
    if (stream && providerResponse.body) {
      // Pass through the SSE stream directly
      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'x-seizn-memories-injected': String(memories.length),
        'x-seizn-proxy-latency': String(Date.now() - startTime),
      });

      // Log the request
      if (keyId) {
        logRequest(
          { userId, keyId, endpoint: '/v1/proxy/chat/completions', method: 'POST', startTime },
          200
        ).catch(console.error);
      }

      // Fire-and-forget: extract memories later (we can't easily parse SSE here)
      return new NextResponse(providerResponse.body as ReadableStream, { headers });
    }

    // 8. Non-streaming: parse response and add metadata
    const responseData = await providerResponse.json();

    if (!providerResponse.ok) {
      return NextResponse.json(responseData, { status: providerResponse.status });
    }

    // Add Seizn metadata to response
    const enhancedResponse = {
      ...responseData,
      seizn: {
        memories_injected: memories.length,
        memory_ids: memories.map((m) => m.id),
        proxy_latency_ms: Date.now() - startTime,
      },
    };

    // Log API usage
    if (keyId) {
      const usage = responseData.usage;
      logRequest(
        { userId, keyId, endpoint: '/v1/proxy/chat/completions', method: 'POST', startTime },
        200,
        usage
          ? {
              input: usage.prompt_tokens,
              output: usage.completion_tokens,
            }
          : undefined
      ).catch(console.error);
    }

    // 9. Fire-and-forget: extract memories from the response
    const assistantContent = responseData.choices?.[0]?.message?.content;
    if (assistantContent && query.length > 20) {
      extractAndStoreMemories(userId, messages, assistantContent).catch(console.error);
    }

    return NextResponse.json(enhancedResponse, {
      status: 200,
      headers: {
        'x-seizn-memories-injected': String(memories.length),
        'x-seizn-proxy-latency': String(Date.now() - startTime),
      },
    });
  } catch (error) {
    console.error('[Proxy] Provider request failed:', error);

    if (keyId) {
      logRequest(
        { userId, keyId, endpoint: '/v1/proxy/chat/completions', method: 'POST', startTime },
        502
      ).catch(console.error);
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to reach upstream provider',
          type: 'upstream_error',
          code: 'provider_unreachable',
        },
      },
      { status: 502 }
    );
  }
}
