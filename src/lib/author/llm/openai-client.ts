import OpenAI from 'openai';
import { randomUUID } from 'crypto';
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
  buildSystemPrompt,
  parseAndValidateJson,
  redactProviderError,
  sleep,
} from './client-helpers';
import {
  getOpenAiReasoningEffort,
  resolveAuthorLlmEffort,
} from './effort-mapping';
import { recordAuthorModelUsage } from './usage-store';
import {
  AuthorLlmError,
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
    // R28 M4 — server-side requestId; never honor caller-supplied value
    // (it lands in audit log / billing record / webhook delivery).
    const requestId = response.id ?? `author-openai-${randomUUID()}`;
    const json = request.responseFormat === 'json'
      ? parseAndValidateJson<TJson>(text, request.jsonSchema, 'OpenAI')
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
        ? `OpenAI request failed for Author Memory v3: ${redactProviderError(cause)}`
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

function extractText(response: OpenAiChatCompletionLike): string {
  return response.choices?.[0]?.message?.content?.trim() ?? '';
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
