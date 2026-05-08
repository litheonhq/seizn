import type { AuthorLlmEffort } from './effort-mapping';

export type AuthorLlmProvider = 'anthropic' | 'google' | 'openai';
export type AuthorLlmResponseFormat = 'text' | 'json';
export type AuthorLlmKeySource = 'byok' | 'managed';

export interface AuthorJsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  required?: string[];
  properties?: Record<string, AuthorJsonSchema>;
  items?: AuthorJsonSchema;
  enum?: unknown[];
}

export interface AuthorLlmRequest {
  userId: string;
  projectId: string;
  prompt: string;
  system?: string;
  /** Optional — provider-router resolves to env default when omitted. */
  provider?: AuthorLlmProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: AuthorLlmResponseFormat;
  jsonSchema?: AuthorJsonSchema;
  requestId?: string;
  /** Reasoning / extended-thinking effort. Defaults to AUTHOR_LLM_EFFORT env (xhigh). */
  effort?: AuthorLlmEffort;
  /**
   * Prompt-cache policy (R13 C7).
   *   - 'auto' (default): respect ANTHROPIC_PROMPT_CACHING env flag — cache
   *     when enabled, plain otherwise. Right choice for warm paths where
   *     the same system prompt repeats inside a 5-min window (Check loops,
   *     Dialog turns, Backlog generation).
   *   - 'cold': force-disable caching even when env enabled. Use for Free
   *     BYOK one-off paths (rare/ad-hoc requests) where the cache write
   *     surcharge (~25% over normal input tokens) won't pay back since
   *     the system prompt won't be re-read inside TTL. Caller is expected
   *     to know its access pattern; the LLM stack does NOT auto-detect.
   *   - 'warm': force-enable caching even when env disabled. Reserved for
   *     local dev / migration testing; not a production setting.
   */
  cachePolicy?: 'auto' | 'cold' | 'warm';
}

export interface AuthorLlmUsage {
  tokensIn: number;
  tokensOut: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface AuthorLlmResponse<TJson = unknown> {
  provider: AuthorLlmProvider;
  model: string;
  text: string;
  json?: TJson;
  requestId: string;
  byok: boolean;
  usage: AuthorLlmUsage;
  stopReason?: string | null;
}

export type AuthorLlmErrorCode =
  | 'BYOK_REQUIRED'
  | 'LLM_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'ANTHROPIC_REQUEST_FAILED'
  | 'OPENAI_REQUEST_FAILED'
  | 'GEMINI_REQUEST_FAILED'
  | 'INVALID_JSON_RESPONSE'
  | 'JSON_SCHEMA_VALIDATION_FAILED'
  | 'MODEL_USAGE_RECORD_FAILED'
  | 'TOKEN_LIMIT_EXCEEDED';

export class AuthorLlmError extends Error {
  constructor(
    public readonly code: AuthorLlmErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'AuthorLlmError';
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
    };
  }
}

export interface ResolvedAuthorAnthropicKey {
  apiKey: string;
  source: AuthorLlmKeySource;
  byok: boolean;
  providerKeyId?: string;
}

export interface AuthorModelUsageRecord {
  userId: string;
  projectId: string;
  provider: AuthorLlmProvider;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd?: number | null;
  byok: boolean;
  requestId?: string | null;
}

export interface AuthorByokStatus {
  enabled: boolean;
  provider: 'anthropic' | 'google' | 'openai' | null;
  key_last_4?: string;
  verified_at?: string | null;
  status: 'active' | 'invalid' | 'missing';
}
