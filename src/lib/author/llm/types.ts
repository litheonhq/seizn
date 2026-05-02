export type AuthorLlmProvider = 'anthropic';
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
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: AuthorLlmResponseFormat;
  jsonSchema?: AuthorJsonSchema;
  requestId?: string;
}

export interface AuthorLlmUsage {
  tokensIn: number;
  tokensOut: number;
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
