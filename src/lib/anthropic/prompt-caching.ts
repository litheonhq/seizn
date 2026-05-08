export const ANTHROPIC_API_VERSION = '2023-06-01';
export const ANTHROPIC_PROMPT_CACHING_BETA = 'prompt-caching-2024-07-31';

type CacheControlEphemeral = { type: 'ephemeral' };

export type AnthropicTextBlockWithCache = {
  type: 'text';
  text: string;
  cache_control?: CacheControlEphemeral;
};

export interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface AnthropicCacheUsage {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'off');
}

export function isAnthropicPromptCachingEnabled(): boolean {
  return parseBooleanFlag(process.env.ANTHROPIC_PROMPT_CACHING);
}

function mergeAnthropicBetaHeader(existing: string | undefined): string {
  if (!existing) return ANTHROPIC_PROMPT_CACHING_BETA;

  const values = existing
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!values.includes(ANTHROPIC_PROMPT_CACHING_BETA)) {
    values.push(ANTHROPIC_PROMPT_CACHING_BETA);
  }

  return values.join(',');
}

export function buildAnthropicHeaders(
  apiKey: string,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_API_VERSION,
    ...extraHeaders,
  };

  if (isAnthropicPromptCachingEnabled()) {
    headers['anthropic-beta'] = mergeAnthropicBetaHeader(headers['anthropic-beta']);
  }

  return headers;
}

export function buildAnthropicSdkDefaultHeaders(): Record<string, string> | undefined {
  if (!isAnthropicPromptCachingEnabled()) return undefined;
  return {
    'anthropic-beta': ANTHROPIC_PROMPT_CACHING_BETA,
  };
}

export type PromptCachePolicy = 'auto' | 'cold' | 'warm';

/**
 * R13 A9 — caller-side hygiene reminder. Ephemeral cache keys are derived
 * from the exact text of the cached block. Inserting per-request tokens —
 * userId/projectId UUIDs, request_id, timestamp — into the system prompt
 * defeats the cache (every call gets a unique key, paying write surcharge
 * on every call without ever reading). Keep system prompts identifier-
 * free; pass tenant-scoped data in the user message or via SDK metadata
 * instead. Today no Author Memory v3 path violates this; this comment
 * exists so future system-prompt changes are aware of the constraint.
 */
export function buildCachedSystemPrompt(
  systemPrompt: string | undefined,
  policy: PromptCachePolicy = 'auto',
): string | AnthropicTextBlockWithCache[] | undefined {
  if (!systemPrompt) return undefined;

  // R13 C7 — policy-aware gate. 'cold' bypasses caching even when env
  // enabled (Free BYOK one-off paths shouldn't pay the write surcharge);
  // 'warm' forces caching even when env disabled (local dev / migration
  // testing only); 'auto' respects the env flag.
  if (policy === 'cold') return systemPrompt;
  if (policy === 'auto' && !isAnthropicPromptCachingEnabled()) {
    return systemPrompt;
  }

  return [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function extractAnthropicCacheUsage(usage: AnthropicUsageLike | undefined): AnthropicCacheUsage {
  return {
    cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
  };
}

