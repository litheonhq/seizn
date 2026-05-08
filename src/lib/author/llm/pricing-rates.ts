/**
 * LLM provider pricing rates (USD per million tokens).
 *
 * Single source of truth for all LLM cost estimates across the app:
 * - Trial cost projections
 * - Managed-tier margin calculations
 * - BYOK cost previews shown to users
 * - Admin metrics dashboard
 * - Studio Managed Opus overage metering
 *
 * Locked 2026-05-07. Update this file (and only this file) when provider
 * pricing changes. Source URLs in comments — verify before editing.
 *
 * Notes:
 * - Cache write 5min multiplier = 1.25x base input (Anthropic standard).
 * - Cache write 1h multiplier = 2x base input.
 * - Cache read multiplier = 0.1x base input (both providers, similar mechanics).
 * - Opus 4.7 uses a new tokenizer — the same input text can produce up to
 *   ~35% more tokens vs Opus 4.1. Factor this when comparing historical costs.
 * - Reasoning/thinking tokens are billed as output tokens on both providers.
 *   xhigh effort on Opus 4.7 = 32k thinking tokens; on GPT-5.5 ≈ 20k reasoning.
 */

export type LlmProvider = 'anthropic' | 'google' | 'openai';

export interface LlmModelRates {
  /** Provider identifier — used to route cost calculations. */
  provider: LlmProvider;
  /** Human-readable display name (for admin dashboards). */
  displayName: string;
  /** Base input price per million tokens, USD. */
  inputPerMTokUsd: number;
  /** Output price per million tokens, USD. (Includes reasoning/thinking on both providers.) */
  outputPerMTokUsd: number;
  /** Cache read price per million tokens, USD. */
  cacheReadPerMTokUsd: number;
  /** Anthropic 5-minute cache write price (omit for OpenAI — uses cached-input field instead). */
  cacheWrite5MinPerMTokUsd?: number;
  /** Anthropic 1-hour cache write price. */
  cacheWrite1HourPerMTokUsd?: number;
  /** OpenAI cached-input price (per Apidog/OpenRouter as of 2026-04-23). */
  cachedInputPerMTokUsd?: number;
  /** Whether this model bills extended-thinking / reasoning tokens as output. */
  thinkingBilledAsOutput: boolean;
}

/**
 * Verified rates as of 2026-05-08.
 *
 * Anthropic source: https://platform.claude.com/docs/en/about-claude/pricing
 * OpenAI source:    https://developers.openai.com/api/docs/pricing (2026-04-23 GPT-5.5 release)
 * Google source:    https://ai.google.dev/gemini-api/docs/pricing
 *
 * Note for Gemini 2.5 Pro: tiered pricing kicks in at >200K input tokens per
 * call — input doubles to $2.50/M, output rises to $15-20/M. The rates below
 * are the standard tier (≤200K). Author Memory v3 paths typically stay under
 * 200K (system + most prompts ~50-100K), so the standard tier covers ~95% of
 * billable calls; long-context whole-novel pass (Premier R&D) crosses the
 * threshold and needs separate cost projection.
 */
export const LLM_RATES: Record<string, LlmModelRates> = {
  'claude-opus-4-7': {
    provider: 'anthropic',
    displayName: 'Claude Opus 4.7',
    inputPerMTokUsd: 5.00,
    outputPerMTokUsd: 25.00,
    cacheReadPerMTokUsd: 0.50,
    cacheWrite5MinPerMTokUsd: 6.25,
    cacheWrite1HourPerMTokUsd: 10.00,
    thinkingBilledAsOutput: true,
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    inputPerMTokUsd: 3.00,
    outputPerMTokUsd: 15.00,
    cacheReadPerMTokUsd: 0.30,
    cacheWrite5MinPerMTokUsd: 3.75,
    cacheWrite1HourPerMTokUsd: 6.00,
    thinkingBilledAsOutput: true,
  },
  'claude-haiku-4-5': {
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    inputPerMTokUsd: 1.00,
    outputPerMTokUsd: 5.00,
    cacheReadPerMTokUsd: 0.10,
    cacheWrite5MinPerMTokUsd: 1.25,
    cacheWrite1HourPerMTokUsd: 2.00,
    thinkingBilledAsOutput: true,
  },
  'gpt-5.5': {
    provider: 'openai',
    displayName: 'GPT-5.5',
    inputPerMTokUsd: 5.00,
    outputPerMTokUsd: 30.00,
    cacheReadPerMTokUsd: 1.25,
    cachedInputPerMTokUsd: 1.25,
    thinkingBilledAsOutput: true,
  },
  'gemini-2.5-pro': {
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    // Standard tier (≤200K input). Beyond 200K input the rates double per
    // Google's tiered model — see header comment. cacheReadPerMTokUsd uses
    // Google's "context caching" read rate ($0.315/M).
    inputPerMTokUsd: 1.25,
    outputPerMTokUsd: 10.00,
    cacheReadPerMTokUsd: 0.315,
    cachedInputPerMTokUsd: 0.315,
    thinkingBilledAsOutput: true,
  },
  'gemini-2.5-flash': {
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    // Flash tier — designed for cost-sensitive Free / Indie BYOK fallback.
    inputPerMTokUsd: 0.30,
    outputPerMTokUsd: 2.50,
    cacheReadPerMTokUsd: 0.075,
    cachedInputPerMTokUsd: 0.075,
    thinkingBilledAsOutput: true,
  },
};

export interface CallTokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationInputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  cachedInputTokens?: number | null;
}

/**
 * Estimate the USD cost of a single LLM call given its token usage and model.
 *
 * Returns 0 (instead of throwing) for unknown models so cost tracking never
 * blocks user-facing requests. Admin alerts surface unknown-model usage.
 */
export function estimateLlmCallCostUsd(
  modelId: string,
  usage: CallTokenUsage,
  cacheWriteTtl: '5min' | '1h' = '5min',
): number {
  const rates = LLM_RATES[modelId];
  if (!rates) return 0;

  const input = readNonNeg(usage.inputTokens);
  const output = readNonNeg(usage.outputTokens);
  const cacheCreation = readNonNeg(usage.cacheCreationInputTokens);
  const cacheRead = readNonNeg(usage.cacheReadInputTokens);
  const cachedInput = readNonNeg(usage.cachedInputTokens);

  const cacheWriteRate =
    cacheWriteTtl === '1h'
      ? (rates.cacheWrite1HourPerMTokUsd ?? rates.inputPerMTokUsd * 2)
      : (rates.cacheWrite5MinPerMTokUsd ?? rates.inputPerMTokUsd * 1.25);

  const cachedInputRate = rates.cachedInputPerMTokUsd ?? rates.cacheReadPerMTokUsd;

  return (
    (input * rates.inputPerMTokUsd) / 1_000_000 +
    (output * rates.outputPerMTokUsd) / 1_000_000 +
    (cacheCreation * cacheWriteRate) / 1_000_000 +
    (cacheRead * rates.cacheReadPerMTokUsd) / 1_000_000 +
    (cachedInput * cachedInputRate) / 1_000_000
  );
}

/** Convenience: returns USD cents (rounded). For cost columns stored as int. */
export function estimateLlmCallCostCents(
  modelId: string,
  usage: CallTokenUsage,
  cacheWriteTtl: '5min' | '1h' = '5min',
): number {
  return Math.round(estimateLlmCallCostUsd(modelId, usage, cacheWriteTtl) * 100);
}

/**
 * Per-model display rate (used by pricing page + BYOK cost preview UI).
 * Returns null for unknown models so callers can fall back to "unknown".
 */
export function getModelDisplayRate(modelId: string): {
  input: number;
  output: number;
  displayName: string;
} | null {
  const rates = LLM_RATES[modelId];
  if (!rates) return null;
  return {
    input: rates.inputPerMTokUsd,
    output: rates.outputPerMTokUsd,
    displayName: rates.displayName,
  };
}

function readNonNeg(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
