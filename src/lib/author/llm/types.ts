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
  /** Author stack only stores anthropic | openai today. Pre-audit this union
   * also included 'google', forcing every consumer to defensively narrow.
   * If/when Google joins the supported list, widen this field AND update the
   * AuthorLlmProvider union together. */
  provider: AuthorLlmProvider | null;
  key_last_4?: string;
  verified_at?: string | null;
  status: 'active' | 'invalid' | 'missing';
}
