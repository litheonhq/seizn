/**
 * Author-LLM effort levels and per-provider parameter mappings.
 *
 * Effort levels are a Seizn-internal abstraction so callers can ask for
 * "xhigh reasoning" without knowing whether they're going to land on Anthropic
 * extended-thinking or OpenAI reasoning_effort. The provider clients
 * (anthropic-client.ts, openai-client.ts) translate these levels into the
 * concrete API parameters for their respective SDKs.
 *
 * `xhigh` is the current Seizn default (locked in 2026-05-07) — both the
 * Track 1 web Indie tier (managed Opus 4.7) and the Track 2 API channel ride
 * the same effort budget so prose quality stays consistent across surfaces.
 */
export type AuthorLlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const DEFAULT_AUTHOR_LLM_EFFORT: AuthorLlmEffort = 'xhigh';

const ANTHROPIC_THINKING_BUDGET_TOKENS: Record<AuthorLlmEffort, number> = {
  low: 4_000,
  medium: 8_000,
  high: 16_000,
  xhigh: 32_000,
  max: 64_000,
};

const OPENAI_REASONING_EFFORT: Record<AuthorLlmEffort, 'low' | 'medium' | 'high' | 'xhigh'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
};

export function isAuthorLlmEffort(value: unknown): value is AuthorLlmEffort {
  return (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  );
}

export function resolveAuthorLlmEffort(env: NodeJS.ProcessEnv = process.env): AuthorLlmEffort {
  const raw = env.AUTHOR_LLM_EFFORT?.trim().toLowerCase();
  return isAuthorLlmEffort(raw) ? raw : DEFAULT_AUTHOR_LLM_EFFORT;
}

export function getAnthropicThinkingBudget(effort: AuthorLlmEffort): number {
  return ANTHROPIC_THINKING_BUDGET_TOKENS[effort];
}

export function getOpenAiReasoningEffort(effort: AuthorLlmEffort): 'low' | 'medium' | 'high' | 'xhigh' {
  return OPENAI_REASONING_EFFORT[effort];
}

/**
 * Anthropic Opus 4.7 (and later extended-thinking models) accept a
 * `thinking: { type: 'enabled', budget_tokens }` block. Older Sonnet / Opus
 * models do not — calling with `thinking` on those models is a 400. The
 * deny-list pattern matches the existing temperature-handling in
 * anthropic-client.ts so callers add the block only when the model supports it.
 */
export function modelSupportsExtendedThinking(model: string): boolean {
  return /claude-opus-4-7/i.test(model) || /claude-(opus|sonnet)-(?:5|6|7|8|9)/i.test(model);
}
