/**
 * LLM pre-flight cost cap (plan W5.7).
 *
 * Wraps every Anthropic / OpenAI call with a single check before the request
 * leaves Vercel: estimate cost from prompt-token-count + max_tokens, compare
 * against the user's monthly budget remaining, and reject if it would exceed.
 *
 * Why pre-flight: the model returns cost AFTER the request. By that point we
 * already paid for the inference. This guard stops runaway costs from a single
 * abusive request (e.g., 200K-token prompt, 32K max_tokens, $5 single call).
 *
 * Per-tier monthly budgets (USD soft-cap above the 100% token threshold):
 *   - Free            : $0  → reject any non-BYOK Managed call
 *   - Indie Managed   : $40 (covers 1M tokens at headroom)
 *   - Pro Managed     : $200
 *   - Studio Managed  : $800
 *   - Enterprise      : null (no cap, contract-managed)
 *   - Studio Managed (Track 2 v8): $300 with $0.20/Opus override
 *
 * The cap is enforced in addition to the existing token cap. If the user's
 * BYOK toggle is on, they pay providers directly so we still gate on token
 * cap but skip USD cap.
 */

export interface PreflightInputs {
  userTier: 'free' | 'indie' | 'pro' | 'studio' | 'studio_managed' | 'enterprise';
  byok: boolean;
  estimatedPromptTokens: number;
  maxResponseTokens: number;
  model: 'claude-opus' | 'claude-sonnet' | 'claude-haiku' | 'gpt-4o' | 'gpt-4o-mini' | 'gemini-pro';
  /** USD spent so far this month (managed tier only, populated by control-tower). */
  monthSpentUsd: number;
}

export interface PreflightResult {
  allowed: boolean;
  reason?: 'usd_cap_exceeded' | 'free_tier_managed_blocked' | 'unknown_pricing';
  estimatedCostUsd: number;
  remainingUsd: number | null;
}

const USD_CAPS: Record<PreflightInputs['userTier'], number | null> = {
  free: 0,
  indie: 40,
  pro: 200,
  studio: 800,
  studio_managed: 300,
  enterprise: null,
};

// USD per 1M tokens, conservative provider pricing as of 2026-05.
// Numbers are model-input + model-output averaged at 1:1 ratio for safety;
// callers should pass realistic max_response_tokens to keep the estimate tight.
const PRICING_USD_PER_1M: Record<PreflightInputs['model'], { input: number; output: number } | null> = {
  'claude-opus': { input: 15, output: 75 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.80, output: 4 },
  'gpt-4o': { input: 2.50, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gemini-pro': { input: 1.25, output: 5 },
};

export function preflightCap(input: PreflightInputs): PreflightResult {
  const cap = USD_CAPS[input.userTier];
  const pricing = PRICING_USD_PER_1M[input.model];

  if (!pricing) {
    return {
      allowed: false,
      reason: 'unknown_pricing',
      estimatedCostUsd: 0,
      remainingUsd: cap == null ? null : Math.max(cap - input.monthSpentUsd, 0),
    };
  }

  // Estimate cost — assume worst case where response uses all of max_tokens.
  const estimatedCostUsd =
    (input.estimatedPromptTokens / 1_000_000) * pricing.input +
    (input.maxResponseTokens / 1_000_000) * pricing.output;

  // BYOK: user pays provider directly, our cap doesn't apply.
  if (input.byok) {
    return {
      allowed: true,
      estimatedCostUsd,
      remainingUsd: null,
    };
  }

  // Free tier with non-BYOK Managed call → blocked (charter rule).
  if (input.userTier === 'free') {
    return {
      allowed: false,
      reason: 'free_tier_managed_blocked',
      estimatedCostUsd,
      remainingUsd: 0,
    };
  }

  // Enterprise — contract managed, no cap.
  if (cap == null) {
    return {
      allowed: true,
      estimatedCostUsd,
      remainingUsd: null,
    };
  }

  const remaining = cap - input.monthSpentUsd;
  if (estimatedCostUsd > remaining) {
    return {
      allowed: false,
      reason: 'usd_cap_exceeded',
      estimatedCostUsd,
      remainingUsd: Math.max(remaining, 0),
    };
  }

  return {
    allowed: true,
    estimatedCostUsd,
    remainingUsd: remaining,
  };
}

/**
 * Anthropic prompt caching helper (plan W5.7).
 *
 * Anthropic prompt caching: 1.25x write cost on first call, 0.1x read cost on
 * subsequent calls within 5 min TTL. For our canon prompt (~10K tokens of
 * stable system instructions + character bibles), this saves ~80% of input
 * cost on hot paths.
 *
 * Apply by wrapping system prompts with `cache_control: { type: 'ephemeral' }`
 * blocks. Returns the messages.create payload shape that opts into caching.
 *
 * Reference: docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export interface CacheableSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export function withPromptCache(systemBlocks: Array<{ type: 'text'; text: string }>): CacheableSystemBlock[] {
  if (systemBlocks.length === 0) return [];
  // Anthropic allows up to 4 cache_control breakpoints. Mark only the LAST
  // block as cacheable so Anthropic caches the entire prefix up to that point.
  return systemBlocks.map((block, idx) =>
    idx === systemBlocks.length - 1
      ? { ...block, cache_control: { type: 'ephemeral' as const } }
      : block
  );
}
