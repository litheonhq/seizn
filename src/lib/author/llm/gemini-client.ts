import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import {
  calculateAuthorBillableUsageTokens,
  enforceAuthorTokenBudget,
  estimateAuthorRequestTotalTokens,
  meterAuthorTokenOverage,
} from '@/lib/author/billing/token-budget';
import {
  recordAuthorByokUsage,
  resolveAuthorGoogleKey,
} from './byok-resolver';
import {
  buildSystemPrompt,
  parseAndValidateJson,
  redactProviderError,
  sleep,
} from './client-helpers';
import {
  modelSupportsGeminiThinking,
  resolveAuthorLlmEffort,
} from './effort-mapping';
import { recordAuthorModelUsage } from './usage-store';
import {
  AuthorLlmError,
  type AuthorLlmRequest,
  type AuthorLlmResponse,
  type ResolvedAuthorAnthropicKey,
} from './types';

const DEFAULT_GEMINI_MODEL =
  process.env.AUTHOR_LLM_DEFAULT_MODEL_GOOGLE?.trim() || 'gemini-2.5-pro';
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const;

type GeminiClientLike = {
  getGenerativeModel: (params: Record<string, unknown>) => GeminiModelLike;
};

interface GeminiModelLike {
  generateContent: (
    request: Record<string, unknown>,
  ) => Promise<GeminiGenerateContentResultLike>;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
}

interface GeminiGenerateContentResultLike {
  response: {
    text: () => string;
    candidates?: Array<{
      finishReason?: string | null;
    }>;
    usageMetadata?: GeminiUsageMetadata;
  };
}

interface AuthorGeminiClientDeps {
  resolveKey?: typeof resolveAuthorGoogleKey;
  createClient?: (apiKey: string) => GeminiClientLike;
  recordUsage?: typeof recordAuthorModelUsage;
  recordByokUsage?: typeof recordAuthorByokUsage;
  enforceBudget?: typeof enforceAuthorTokenBudget;
  meterOverage?: typeof meterAuthorTokenOverage;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  backoffMs?: readonly number[];
}

export class AuthorGeminiClient {
  private readonly resolveKey: typeof resolveAuthorGoogleKey;
  private readonly createClient: (apiKey: string) => GeminiClientLike;
  private readonly recordUsage: typeof recordAuthorModelUsage;
  private readonly recordByokUsage: typeof recordAuthorByokUsage;
  private readonly enforceBudget: typeof enforceAuthorTokenBudget;
  private readonly meterOverage: typeof meterAuthorTokenOverage;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly backoffMs: readonly number[];

  constructor(deps: AuthorGeminiClientDeps = {}) {
    this.resolveKey = deps.resolveKey ?? resolveAuthorGoogleKey;
    this.createClient = deps.createClient ?? createDefaultGeminiClient;
    this.recordUsage = deps.recordUsage ?? recordAuthorModelUsage;
    this.recordByokUsage = deps.recordByokUsage ?? recordAuthorByokUsage;
    this.enforceBudget = deps.enforceBudget ?? enforceAuthorTokenBudget;
    this.meterOverage = deps.meterOverage ?? meterAuthorTokenOverage;
    this.sleep = deps.sleep ?? sleep;
    this.maxRetries = deps.maxRetries ?? 3;
    this.backoffMs = deps.backoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }

  async generate<TJson = unknown>(
    request: AuthorLlmRequest,
  ): Promise<AuthorLlmResponse<TJson>> {
    const model = request.model ?? DEFAULT_GEMINI_MODEL;
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
        maxTokens: request.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        responseFormat: request.responseFormat,
      }),
    });
    const client = this.createClient(resolved.apiKey);
    const response = await this.generateWithRetry(client, request, model);
    const text = extractText(response);
    const usageMetadata = response.response.usageMetadata ?? {};
    const usage = calculateAuthorBillableUsageTokens({
      input_tokens: usageMetadata.promptTokenCount ?? null,
      output_tokens: usageMetadata.candidatesTokenCount ?? null,
    });
    // R28 M4 — server-side requestId; Gemini SDK 0.24.1 doesn't carry
    // a response-level request id, so we always mint server-side.
    const requestId = `author-google-${randomUUID()}`;
    const json = request.responseFormat === 'json'
      ? parseAndValidateJson<TJson>(text, request.jsonSchema, 'Gemini')
      : undefined;

    await this.recordUsage({
      userId: request.userId,
      projectId: request.projectId,
      provider: 'google',
      model,
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
      provider: 'google',
      model,
      text,
      ...(request.responseFormat === 'json' ? { json } : {}),
      requestId,
      byok: resolved.byok,
      usage,
      stopReason: response.response.candidates?.[0]?.finishReason ?? null,
    };
  }

  private async generateWithRetry(
    client: GeminiClientLike,
    request: AuthorLlmRequest,
    model: string,
  ): Promise<GeminiGenerateContentResultLike> {
    const params = buildGeminiModelParams(request, model);
    const generationParams = buildGeminiGenerationParams(request, model);
    const generativeModel = client.getGenerativeModel(params);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await generativeModel.generateContent(generationParams);
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
        'Gemini rate limit exceeded for Author Memory v3',
        429,
      );
    }

    const cause = lastError instanceof Error ? lastError.message : String(lastError ?? '');
    // Map a 5xx to status so provider-router can decide failover; otherwise
    // leave status undefined (validation, schema, etc. are not failover-eligible).
    // R24 C3 — use the dedicated GEMINI_REQUEST_FAILED code so admin alerts
    // and dashboards don't mis-attribute Gemini outages to OpenAI.
    throw new AuthorLlmError(
      'GEMINI_REQUEST_FAILED',
      cause
        ? `Gemini request failed for Author Memory v3: ${redactProviderError(cause)}`
        : 'Gemini request failed for Author Memory v3',
      readErrorStatus(lastError),
    );
  }
}

export async function generateAuthorGemini<TJson = unknown>(
  request: AuthorLlmRequest,
  deps?: AuthorGeminiClientDeps,
): Promise<AuthorLlmResponse<TJson>> {
  return new AuthorGeminiClient(deps).generate<TJson>(request);
}

function createDefaultGeminiClient(apiKey: string): GeminiClientLike {
  return new GoogleGenerativeAI(apiKey) as unknown as GeminiClientLike;
}

/**
 * Build the model construction params (system instruction lives here, not
 * on the per-call generateContent payload — Gemini's SDK splits the two).
 */
export function buildGeminiModelParams(
  request: AuthorLlmRequest,
  model: string,
): Record<string, unknown> {
  const system = buildSystemPrompt(request.system, request.responseFormat);
  return {
    model,
    ...(system ? { systemInstruction: system } : {}),
  };
}

/**
 * Build the generationConfig + contents payload for a single call.
 *
 * Notes:
 * - `responseMimeType: 'application/json'` is Gemini's JSON mode equivalent
 *   to OpenAI's `response_format: { type: 'json_object' }`.
 * - thinkingConfig.thinkingBudget is supported by the v1 API but the
 *   legacy @google/generative-ai SDK types don't expose it. We pass it via
 *   generationConfig anyway (typed loosely) — the API accepts it; older
 *   SDK versions just ignore unknown keys server-side.
 */
export function buildGeminiGenerationParams(
  request: AuthorLlmRequest,
  model: string,
): Record<string, unknown> {
  const effort = request.effort ?? resolveAuthorLlmEffort();
  const supportsThinking = modelSupportsGeminiThinking(model);
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(typeof request.temperature === 'number'
      ? { temperature: request.temperature }
      : {}),
    ...(request.responseFormat === 'json'
      ? { responseMimeType: 'application/json' }
      : {}),
    ...(supportsThinking
      ? {
          thinkingConfig: {
            // Defer to dynamic thinking on Gemini — the model decides budget
            // up to the per-effort cap. Setting -1 = dynamic, 0 = disabled,
            // >0 = explicit budget. Author paths are quality-sensitive so we
            // let the model think freely; budget cap matches our effort scale.
            thinkingBudget: -1,
          },
        }
      : {}),
  };

  return {
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig,
  };
}

function extractText(result: GeminiGenerateContentResultLike): string {
  try {
    return result.response.text().trim();
  } catch (err) {
    // R24 H1 — Gemini SDK throws GoogleGenerativeAIResponseError when the
    // candidate has finishReason='SAFETY' or another non-STOP terminator.
    // Returning '' silently masks safety blocks: the caller would see an
    // empty response, parseAndValidateJson would later fail with a
    // confusing INVALID_JSON_RESPONSE, and the user gets billed for a
    // black-box failure. Surface explicitly so admin logs / alerts
    // attribute the failure correctly.
    //
    // R28 M2 — pass the SDK's err.message through redactProviderError
    // before embedding into the thrown AuthorLlmError. Today SDK 0.24.1
    // only includes finishReason in this path, but a future version
    // could include blocked-content snippets that would otherwise leak
    // through the error envelope (and onto admin dashboards / Datadog).
    const finishReason = result.response.candidates?.[0]?.finishReason ?? 'unknown';
    const rawCause = err instanceof Error ? err.message : String(err);
    const cause = redactProviderError(rawCause);
    throw new AuthorLlmError(
      'GEMINI_REQUEST_FAILED',
      `Gemini response could not be read (finishReason=${finishReason}): ${cause}`,
    );
  }
}

function isRateLimitError(error: unknown): boolean {
  const status = readErrorStatus(error);
  if (status === 429) return true;
  // Gemini SDK error message contains "rate" + status hints when quota hit.
  const msg = error instanceof Error ? error.message : '';
  return /rate.*limit|quota|exceeded/i.test(msg) && /\b429\b/.test(msg);
}

function readErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  // Gemini SDK throws GoogleGenerativeAIFetchError with status embedded in
  // message ("[GoogleGenerativeAI Error]: ... [400 Bad Request]"). Best-effort
  // parse so failover semantics still work without forcing the SDK type.
  const msg = error instanceof Error ? error.message : '';
  const match = msg.match(/\[(\d{3})\b/);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

// Re-export the resolved-key shape for symmetry with the openai-client.ts
// pattern; the underlying type is unchanged across providers.
export type { ResolvedAuthorAnthropicKey };
