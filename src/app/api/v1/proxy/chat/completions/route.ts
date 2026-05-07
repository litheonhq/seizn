import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Seizn Proxy -> OpenAI-Compatible Chat Completions
 *
 * Drop-in replacement for OpenAI's /v1/chat/completions.
 * Developers change ONE line: baseURL -> https://www.seizn.com/api/v1/proxy
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
 * # Python -> ONE line change
 * client = OpenAI(
 *   base_url="https://www.seizn.com/api/v1/proxy",   # -> only change
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
import { createServerClient } from '@/lib/supabase';
import { computeEmbedding } from '@/lib/embeddings';
import { createDetector } from '@/lib/prompt-firewall/scanner';
import { compareThreatLevel } from '@/lib/prompt-firewall/patterns';
import { validateOutboundUrl } from '@/lib/security/outbound-url';
import { recordUsageEvent } from '@/lib/stripe-metered';

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

interface FirewallSanitizeResult {
  blocked: boolean;
  detected: boolean;
  threatLevel: string;
  content: string;
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

function allowUnsafeProviderTargets(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSAFE_PROVIDER_TARGETS === 'true';
}

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

  // Audit follow-up: removed the NextAuth session fallback. Pre-fix any
  // logged-in browser session could drive memory extraction LLM calls
  // against the server-side ANTHROPIC_API_KEY (no Track 2 quota, no
  // scope check). Proxy now requires a valid Track 2 API key only.
  return { error: authErrorResponse(authResult.authError) };
}

/**
 * Audit follow-up: enforce Track 2 per-key quota on the proxy. Without
 * this, a Free user (50/day) could spam this LLM-consuming endpoint
 * unbounded because authenticateRequest only checks Track 1 monthly
 * quota.
 */
async function enforceProxyTrack2Quota(
  keyId: string,
  userId: string,
): Promise<{ ok: true } | { error: NextResponse }> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('api_keys')
    .select('monthly_quota, monthly_quota_period, scopes')
    .eq('id', keyId)
    .single<{
      monthly_quota: number | null;
      monthly_quota_period: 'day' | 'month' | null;
      scopes: string[] | null;
    }>();
  if (!data || data.monthly_quota == null || !data.monthly_quota_period) {
    return { ok: true };
  }
  // Require explicit 'managed_llm' scope. Free keys never have it; only
  // Studio Managed (Track 2) and Enterprise grant it. BYOK Track 2 paid
  // tiers also lack it — those users should call providers directly with
  // their BYOK key, not through our proxy.
  const scopes = data.scopes ?? [];
  const hasManagedLlm = scopes.includes('*') || scopes.includes('managed_llm');
  if (!hasManagedLlm) {
    return {
      error: NextResponse.json(
        {
          error: {
            code: 'SCOPE_DENIED',
            message: 'Proxy requires the managed_llm scope (Studio Managed or Enterprise tier).',
          },
        },
        { status: 403 },
      ),
    };
  }
  try {
    const { enforceQuota } = await import('@/lib/api-keys');
    await enforceQuota(keyId, data.monthly_quota, data.monthly_quota_period, { userId });
  } catch (err) {
    const { QuotaExceededError } = await import('@/lib/api-keys/errors');
    if (err instanceof QuotaExceededError) {
      return {
        error: NextResponse.json(
          {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Track 2 ${data.monthly_quota_period} quota exceeded (${data.monthly_quota}).`,
            },
          },
          { status: 429 },
        ),
      };
    }
    throw err;
  }
  return { ok: true };
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
      match_user_id: userId,
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

function sanitizeWithFirewall(
  input: string,
  blockThreshold: 'critical' | 'high' = 'critical'
): FirewallSanitizeResult {
  const detector = createDetector({ mode: 'sanitize' });
  const result = detector.scan(input);
  const blocked =
    result.detected &&
    compareThreatLevel(result.threatLevel, blockThreshold) >= 0;
  const content =
    result.sanitizedInput && result.sanitizedInput.trim().length > 0
      ? result.sanitizedInput
      : input;

  return {
    blocked,
    detected: result.detected,
    threatLevel: result.threatLevel,
    content,
  };
}

/**
 * Inject memories into the system message.
 */
function injectMemories(
  messages: ChatMessage[],
  memories: MemoryContext[]
): { messages: ChatMessage[]; injectedMemories: MemoryContext[] } {
  if (memories.length === 0) return { messages, injectedMemories: [] };

  const injectedMemories = memories
    .map((memory) => {
      const scan = sanitizeWithFirewall(memory.content, 'high');
      if (scan.blocked || !scan.content.trim()) {
        return null;
      }
      return {
        ...memory,
        content: scan.content,
      };
    })
    .filter((memory): memory is MemoryContext => Boolean(memory));

  if (injectedMemories.length === 0) {
    return { messages, injectedMemories: [] };
  }

  const memoryBlock = injectedMemories
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

  return { messages: result, injectedMemories };
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
      headers: buildAnthropicHeaders(apiKey),
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
      const scan = sanitizeWithFirewall(item.content, 'critical');
      if (scan.blocked || !scan.content.trim()) continue;

      const embedding = await computeEmbedding(scan.content, 'document');

      // Dedup check
      const { data: existing } = await supabase.rpc('search_memories', {
        query_embedding: embedding,
        match_threshold: 0.92,
        match_count: 1,
        match_user_id: userId,
      });

      if (existing && existing.length > 0) continue; // Already exists

      const { data: insertedMemory } = await supabase.from('memories').insert({
        user_id: userId,
        content: scan.content,
        embedding,
        memory_type: item.type || 'fact',
        source: 'proxy_extraction',
        importance: 5,
        tags: ['auto-extracted', 'proxy'],
      }).select('id').single();

      if (insertedMemory?.id) {
        recordUsageEvent({
          userId,
          dimension: 'memories',
          quantity: 1,
          idempotencyKey: `memory:${insertedMemory.id}`,
          source: '/api/v1/proxy/chat/completions',
          metadata: {
            memory_type: item.type || 'fact',
            extracted: true,
          },
        }).catch(console.error);
      }
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

  // 1b. Audit follow-up: enforce Track 2 quota + managed_llm scope. Pre-fix
  // any authenticated key (incl. Free 50/day) could call this LLM-consuming
  // endpoint without per-key quota gating.
  if (keyId) {
    const quotaResult = await enforceProxyTrack2Quota(keyId, userId);
    if ('error' in quotaResult) return quotaResult.error;
  }

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

  const providerUrlValidation = await validateOutboundUrl(providerConfig.targetUrl, {
    allowHttp: allowUnsafeProviderTargets(),
    allowPrivateNetwork: allowUnsafeProviderTargets(),
  });
  if (!providerUrlValidation.valid || !providerUrlValidation.normalizedUrl) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: providerUrlValidation.reason || 'Unsafe upstream provider URL',
          type: 'invalid_request_error',
          code: 'unsafe_provider_url',
        },
      },
      { status: 400 }
    );
  }
  providerConfig.targetUrl = providerUrlValidation.normalizedUrl;

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
  const queryScan = query ? sanitizeWithFirewall(query, 'critical') : null;
  if (queryScan?.blocked) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Query blocked by security policy',
          type: 'invalid_request_error',
          code: 'prompt_firewall_blocked',
          threat_level: queryScan.threatLevel,
        },
      },
      { status: 400 }
    );
  }
  const effectiveQuery = queryScan?.content?.trim() || query;
  let memories: MemoryContext[] = [];

  if (effectiveQuery) {
    // Check proxy-specific headers for memory config
    const memoryLimit = parseInt(request.headers.get('x-seizn-memory-limit') || '5', 10);
    const memoryThreshold = parseFloat(request.headers.get('x-seizn-memory-threshold') || '0.65');
    const disableMemory = request.headers.get('x-seizn-memory') === 'false';

    if (!disableMemory) {
      memories = await searchRelevantMemories(userId, effectiveQuery, memoryLimit, memoryThreshold);
    }
  }

  // 5. Inject memories into messages
  const { messages: enhancedMessages, injectedMemories } = injectMemories(messages, memories);

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
        'x-seizn-memories-injected': String(injectedMemories.length),
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
        memories_injected: injectedMemories.length,
        memory_ids: injectedMemories.map((m) => m.id),
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
    if (assistantContent && effectiveQuery.length > 20) {
      extractAndStoreMemories(userId, messages, assistantContent).catch(console.error);
    }

    return NextResponse.json(enhancedResponse, {
      status: 200,
      headers: {
        'x-seizn-memories-injected': String(injectedMemories.length),
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
