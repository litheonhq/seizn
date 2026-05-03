import Anthropic from '@anthropic-ai/sdk';
import { buildAnthropicSdkDefaultHeaders } from '@/lib/anthropic/prompt-caching';
import {
  calculateAuthorBillableUsageTokens,
  enforceAuthorTokenBudget,
  estimateAuthorRequestTotalTokens,
  meterAuthorTokenOverage,
} from '@/lib/author/billing/token-budget';
import {
  recordAuthorByokUsage,
  resolveAuthorAnthropicKey,
} from './byok-resolver';
import { recordAuthorModelUsage } from './usage-store';
import {
  AuthorLlmError,
  type AuthorJsonSchema,
  type AuthorLlmRequest,
  type AuthorLlmResponse,
  type ResolvedAuthorAnthropicKey,
} from './types';

const DEFAULT_AUTHOR_MODEL = process.env.AUTHOR_LLM_DEFAULT_MODEL ?? 'claude-opus-4-7';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = [1000, 2000, 4000, 8000] as const;

type AnthropicClientLike = {
  messages: {
    create: (params: Record<string, unknown>) => Promise<AnthropicMessageLike>;
  };
};

interface AnthropicMessageLike {
  id?: string;
  _request_id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  } | null;
  stop_reason?: string | null;
}

interface AuthorAnthropicClientDeps {
  resolveKey?: typeof resolveAuthorAnthropicKey;
  createClient?: (apiKey: string) => AnthropicClientLike;
  recordUsage?: typeof recordAuthorModelUsage;
  recordByokUsage?: typeof recordAuthorByokUsage;
  enforceBudget?: typeof enforceAuthorTokenBudget;
  meterOverage?: typeof meterAuthorTokenOverage;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  backoffMs?: readonly number[];
}

export class AuthorAnthropicClient {
  private readonly resolveKey: typeof resolveAuthorAnthropicKey;
  private readonly createClient: (apiKey: string) => AnthropicClientLike;
  private readonly recordUsage: typeof recordAuthorModelUsage;
  private readonly recordByokUsage: typeof recordAuthorByokUsage;
  private readonly enforceBudget: typeof enforceAuthorTokenBudget;
  private readonly meterOverage: typeof meterAuthorTokenOverage;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly backoffMs: readonly number[];

  constructor(deps: AuthorAnthropicClientDeps = {}) {
    this.resolveKey = deps.resolveKey ?? resolveAuthorAnthropicKey;
    this.createClient = deps.createClient ?? createDefaultAnthropicClient;
    this.recordUsage = deps.recordUsage ?? recordAuthorModelUsage;
    this.recordByokUsage = deps.recordByokUsage ?? recordAuthorByokUsage;
    this.enforceBudget = deps.enforceBudget ?? enforceAuthorTokenBudget;
    this.meterOverage = deps.meterOverage ?? meterAuthorTokenOverage;
    this.sleep = deps.sleep ?? sleep;
    this.maxRetries = deps.maxRetries ?? 3;
    this.backoffMs = deps.backoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }

  async generate<TJson = unknown>(request: AuthorLlmRequest): Promise<AuthorLlmResponse<TJson>> {
    const model = request.model ?? DEFAULT_AUTHOR_MODEL;
    const resolved = await this.resolveKey({
      userId: request.userId,
      projectId: request.projectId,
    });
    const budget = await this.enforceBudget({
      userId: request.userId,
      byokActive: resolved.byok,
      requestedTokens: estimateAuthorRequestTotalTokens({
        prompt: request.prompt,
        system: request.system,
        maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        responseFormat: request.responseFormat,
      }),
    });
    const client = this.createClient(resolved.apiKey);
    const response = await this.createWithRetry(client, request, model);
    const text = extractText(response);
    const usage = calculateAuthorBillableUsageTokens(response.usage);
    const requestId = response._request_id ?? response.id ?? request.requestId ?? `author-${Date.now()}`;
    const json = request.responseFormat === 'json'
      ? parseAndValidateJson<TJson>(text, request.jsonSchema)
      : undefined;

    await this.recordUsage({
      userId: request.userId,
      projectId: request.projectId,
      provider: 'anthropic',
      model: response.model ?? model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      byok: resolved.byok,
      requestId,
    });
    await this.recordByokUsage(resolved, 0);
    await this.meterOverage({
      userId: request.userId,
      byokActive: resolved.byok,
      actualTotalTokens: usage.totalTokens,
      budget,
    });

    return {
      provider: 'anthropic',
      model: response.model ?? model,
      text,
      ...(request.responseFormat === 'json' ? { json } : {}),
      requestId,
      byok: resolved.byok,
      usage,
      stopReason: response.stop_reason ?? null,
    };
  }

  private async createWithRetry(
    client: AnthropicClientLike,
    request: AuthorLlmRequest,
    model: string
  ): Promise<AnthropicMessageLike> {
    const params = buildAnthropicMessageParams(request, model);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await client.messages.create(params);
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error) || attempt >= this.maxRetries) {
          break;
        }
        const delay = this.backoffMs[Math.min(attempt, this.backoffMs.length - 1)];
        await this.sleep(delay);
      }
    }

    if (isRateLimitError(lastError)) {
      throw new AuthorLlmError(
        'RATE_LIMITED',
        'Anthropic rate limit exceeded for Author Memory v3',
        429
      );
    }

    const cause = lastError instanceof Error ? lastError.message : String(lastError ?? '');
    throw new AuthorLlmError(
      'ANTHROPIC_REQUEST_FAILED',
      cause
        ? `Anthropic request failed for Author Memory v3: ${cause}`
        : 'Anthropic request failed for Author Memory v3',
      readErrorStatus(lastError)
    );
  }
}

export async function generateAuthorAnthropic<TJson = unknown>(
  request: AuthorLlmRequest,
  deps?: AuthorAnthropicClientDeps
): Promise<AuthorLlmResponse<TJson>> {
  return new AuthorAnthropicClient(deps).generate<TJson>(request);
}

function createDefaultAnthropicClient(apiKey: string): AnthropicClientLike {
  return new Anthropic({
    apiKey,
    defaultHeaders: buildAnthropicSdkDefaultHeaders(),
  }) as unknown as AnthropicClientLike;
}

function buildAnthropicMessageParams(request: AuthorLlmRequest, model: string): Record<string, unknown> {
  const system = buildSystemPrompt(request.system, request.responseFormat);
  return {
    model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(typeof request.temperature === 'number' ? { temperature: request.temperature } : {}),
    ...(system ? { system } : {}),
    messages: [{
      role: 'user',
      content: request.prompt,
    }],
  };
}

function buildSystemPrompt(system: string | undefined, responseFormat: string | undefined): string | undefined {
  if (responseFormat !== 'json') {
    return system;
  }
  const jsonInstruction = 'Return valid JSON only. Do not wrap the JSON in Markdown.';
  return system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;
}

function extractText(response: AnthropicMessageLike): string {
  return response.content
    ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim() ?? '';
}

function parseAndValidateJson<TJson>(text: string, schema?: AuthorJsonSchema): TJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AuthorLlmError('INVALID_JSON_RESPONSE', 'Anthropic response was not valid JSON');
  }

  if (schema) {
    const errors = validateJsonSchema(parsed, schema);
    if (errors.length > 0) {
      throw new AuthorLlmError(
        'JSON_SCHEMA_VALIDATION_FAILED',
        `Anthropic JSON response failed schema validation: ${errors[0]}`
      );
    }
  }

  return parsed as TJson;
}

function validateJsonSchema(value: unknown, schema: AuthorJsonSchema, path = '$'): string[] {
  const errors: string[] = [];
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(`${path} must be one of schema enum values`);
  }

  if (schema.type && !matchesSchemaType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return errors;
  }

  if (schema.type === 'object' && schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) {
        errors.push(`${path}.${required} is required`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in record) {
        errors.push(...validateJsonSchema(record[key], childSchema, `${path}.${key}`));
      }
    }
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateJsonSchema(item, schema.items as AuthorJsonSchema, `${path}[${index}]`));
    });
  }

  return errors;
}

function matchesSchemaType(value: unknown, type: NonNullable<AuthorJsonSchema['type']>): boolean {
  switch (type) {
    case 'object':
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'null':
      return value === null;
    default:
      return typeof value === type;
  }
}

function isRateLimitError(error: unknown): boolean {
  const maybe = error as { status?: number; code?: string; message?: string };
  return (
    maybe?.status === 429 ||
    maybe?.code === 'rate_limit_error' ||
    /(^|\D)429(\D|$)|rate limit/i.test(maybe?.message ?? '')
  );
}

function readErrorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { ResolvedAuthorAnthropicKey };
