import type { AuthorLlmEffort } from './effort-mapping';

export type AuthorLlmProvider = 'anthropic' | 'openai';
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

/**
 * Provider-agnostic resolved-key shape returned by `resolveAuthorProviderKey`.
 * Identical structure regardless of which provider (anthropic/openai) was
 * resolved — the calling client picks the right SDK by other means.
 */
export interface ResolvedAuthorProviderKey {
  apiKey: string;
  source: AuthorLlmKeySource;
  byok: boolean;
  providerKeyId?: string;
}

/**
 * @deprecated Use `ResolvedAuthorProviderKey` — the type was provider-agnostic
 * from day one but historically named after Anthropic. Kept as an alias so the
 * `byokResolver` re-export in `@/lib/byok` and any external consumers do not
 * break. Will be removed once all internal callers migrate.
 */
export type ResolvedAuthorAnthropicKey = ResolvedAuthorProviderKey;

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
