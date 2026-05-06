import OpenAI from 'openai';
import {
  calculateAuthorBillableUsageTokens,
  enforceAuthorTokenBudget,
  estimateAuthorRequestTotalTokens,
  meterAuthorTokenOverage,
} from '@/lib/author/billing/token-budget';
import {
  recordAuthorByokUsage,
  resolveAuthorOpenAiKey,
} from './byok-resolver';
import {
  getOpenAiReasoningEffort,
  resolveAuthorLlmEffort,
} from './effort-mapping';
import { recordAuthorModelUsage } from './usage-store';
import {
  AuthorLlmError,
  type AuthorJsonSchema,
  type AuthorLlmRequest,
  type AuthorLlmResponse,
  type ResolvedAuthorAnthropicKey,
} from './types';

const DEFAULT_OPENAI_MODEL =
  process.env.AUTHOR_LLM_DEFAULT_MODEL_OPENAI?.trim() || 'gpt-5.5';
const DEFAULT_MAX_COMPLETION_TOKENS = 4_096;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const;

type OpenAiClientLike = {
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => Promise<OpenAiChatCompletionLike>;
    };
  };
};

interface OpenAiChatCompletionLike {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  } | null;
}

interface AuthorOpenAiClientDeps {
  resolveKey?: typeof resolveAuthorOpenAiKey;
  createClient?: (apiKey: string) => OpenAiClientLike;
  recordUsage?: typeof recordAuthorModelUsage;
  recordByokUsage?: typeof recordAuthorByokUsage;
  enforceBudget?: typeof enforceAuthorTokenBudget;
  meterOverage?: typeof meterAuthorTokenOverage;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  backoffMs?: readonly number[];
}

export class AuthorOpenAiClient {
  private readonly resolveKey: typeof resolveAuthorOpenAiKey;
  private readonly createClient: (apiKey: string) => OpenAiClientLike;
  private readonly recordUsage: typeof recordAuthorModelUsage;
  private readonly recordByokUsage: typeof recordAuthorByokUsage;
  private readonly enforceBudget: typeof enforceAuthorTokenBudget;
  private readonly meterOverage: typeof meterAuthorTokenOverage;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly backoffMs: readonly number[];

  constructor(deps: AuthorOpenAiClientDeps = {}) {
    this.resolveKey = deps.resolveKey ?? resolveAuthorOpenAiKey;
    this.createClient = deps.createClient ?? createDefaultOpenAiClient;
    this.recordUsage = deps.recordUsage ?? recordAuthorModelUsage;
    this.recordByokUsage = deps.recordByokUsage ?? recordAuthorByokUsage;
    this.enforceBudget = deps.enforceBudget ?? enforceAuthorTokenBudget;
    this.meterOverage = deps.meterOverage ?? meterAuthorTokenOverage;
    this.sleep = deps.sleep ?? sleep;
    this.maxRetries = deps.maxRetries ?? 3;
    this.backoffMs = deps.backoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }

  async generate<TJson = unknown>(request: AuthorLlmRequest): Promise<AuthorLlmResponse<TJson>> {
    const model = request.model ?? DEFAULT_OPENAI_MODEL;
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
        maxTokens: request.maxTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
        responseFormat: request.responseFormat,
      }),
    });
    const client = this.createClient(resolved.apiKey);
    const response = await this.createWithRetry(client, request, model);
    const text = extractText(response);
    const usage = calculateAuthorBillableUsageTokens({
      input_tokens: response.usage?.prompt_tokens ?? null,
      output_tokens: response.usage?.completion_tokens ?? null,
    });
    const requestId = response.id ?? request.requestId ?? `author-openai-${Date.now()}`;
    const json = request.responseFormat === 'json'
      ? parseAndValidateJson<TJson>(text, request.jsonSchema)
      : undefined;

    await this.recordUsage({
      userId: request.userId,
      projectId: request.projectId,
      provider: 'openai',
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
      provider: 'openai',
      model: response.model ?? model,
      text,
      ...(request.responseFormat === 'json' ? { json } : {}),
      requestId,
      byok: resolved.byok,
      usage,
      stopReason: response.choices?.[0]?.finish_reason ?? null,
    };
  }

  private async createWithRetry(
    client: OpenAiClientLike,
    request: AuthorLlmRequest,
    model: string,
  ): Promise<OpenAiChatCompletionLike> {
    const params = buildOpenAiChatParams(request, model);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await client.chat.completions.create(params);
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
        'OpenAI rate limit exceeded for Author Memory v3',
        429,
      );
    }

    const cause = lastError instanceof Error ? lastError.message : String(lastError ?? '');
    throw new AuthorLlmError(
      'OPENAI_REQUEST_FAILED',
      cause
        ? `OpenAI request failed for Author Memory v3: ${cause}`
        : 'OpenAI request failed for Author Memory v3',
      readErrorStatus(lastError),
    );
  }
}

export async function generateAuthorOpenAi<TJson = unknown>(
  request: AuthorLlmRequest,
  deps?: AuthorOpenAiClientDeps,
): Promise<AuthorLlmResponse<TJson>> {
  return new AuthorOpenAiClient(deps).generate<TJson>(request);
}

function createDefaultOpenAiClient(apiKey: string): OpenAiClientLike {
  return new OpenAI({ apiKey }) as unknown as OpenAiClientLike;
}

export function buildOpenAiChatParams(request: AuthorLlmRequest, model: string): Record<string, unknown> {
  const system = buildSystemPrompt(request.system, request.responseFormat);
  const effort = request.effort ?? resolveAuthorLlmEffort();
  const reasoningEffort = getOpenAiReasoningEffort(effort);
  const messages: Array<Record<string, unknown>> = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: request.prompt });

  // Reasoning models like gpt-5.5 use max_completion_tokens, not max_tokens.
  // They also reject `temperature`; pass it only on non-reasoning models.
  const isReasoningModel = modelIsReasoningModel(model);
  const maxCompletionTokens = request.maxTokens ?? DEFAULT_MAX_COMPLETION_TOKENS;

  return {
    model,
    messages,
    ...(isReasoningModel
      ? {
          max_completion_tokens: maxCompletionTokens,
          reasoning_effort: reasoningEffort,
        }
      : {
          max_tokens: maxCompletionTokens,
          ...(typeof request.temperature === 'number' ? { temperature: request.temperature } : {}),
        }),
    ...(request.responseFormat === 'json'
      ? { response_format: { type: 'json_object' } }
      : {}),
  };
}

export function modelIsReasoningModel(model: string): boolean {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
}

function buildSystemPrompt(system: string | undefined, responseFormat: string | undefined): string | undefined {
  if (responseFormat !== 'json') {
    return system;
  }
  const jsonInstruction = 'Return valid JSON only. Do not wrap the JSON in Markdown.';
  return system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;
}

function extractText(response: OpenAiChatCompletionLike): string {
  return response.choices?.[0]?.message?.content?.trim() ?? '';
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = trimmed.search(/[\[{]/);
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (firstBrace > 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function parseAndValidateJson<TJson>(text: string, schema?: AuthorJsonSchema): TJson {
  let parsed: unknown;
  const candidate = stripJsonFence(text);
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new AuthorLlmError(
      'INVALID_JSON_RESPONSE',
      `OpenAI response was not valid JSON: ${preview}`,
    );
  }
  if (schema) {
    const errors = validateJsonSchema(parsed, schema);
    if (errors.length > 0) {
      throw new AuthorLlmError(
        'JSON_SCHEMA_VALIDATION_FAILED',
        `OpenAI JSON response failed schema validation: ${errors[0]}`,
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
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function isRateLimitError(error: unknown): boolean {
  const status = readErrorStatus(error);
  return status === 429;
}

function readErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof candidate.status === 'number') return candidate.status;
  if (candidate.response && typeof candidate.response.status === 'number') {
    return candidate.response.status;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
