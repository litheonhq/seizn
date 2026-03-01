import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SemanticCacheVariant = 'control' | 'treatment';

export interface SemanticCacheDecision {
  enabled: boolean;
  variant: SemanticCacheVariant | null;
  bucket: number | null;
  allowRead: boolean;
  allowWrite: boolean;
  scope: 'dashboard' | 'all';
  reason:
    | 'experiment_disabled'
    | 'invalid_ratio'
    | 'not_eligible_scope'
    | 'assigned_control'
    | 'assigned_treatment';
}

interface ResolveSemanticCacheDecisionParams {
  userId: string;
  keyId: string | null;
}

interface SemanticCacheExperimentConfig {
  enabled: boolean;
  scope: 'dashboard' | 'all';
  ratio: number | null;
}

export interface SemanticCacheExperimentEventInput {
  userId: string;
  namespace: string;
  source: 'v0' | 'v1';
  requestedMode: string;
  resolvedMode: string;
  variant: SemanticCacheVariant;
  cacheHit: boolean;
  latencyMs: number;
  resultCount: number;
  fallbackReason?: string | null;
  errorCode?: string | null;
}

let cachedConfigKey: string | null = null;
let cachedConfig: SemanticCacheExperimentConfig | null = null;

function parseBoolEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseScope(value: string | undefined): 'dashboard' | 'all' {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'all' ? 'all' : 'dashboard';
}

function parseRatio(value: string | undefined): number | null {
  if (!value || value.trim().length === 0) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

function computeUserBucket(userId: string): number {
  const digest = crypto.createHash('sha256').update(userId).digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
}

function getSemanticCacheExperimentConfig(
  env: NodeJS.ProcessEnv = process.env
): SemanticCacheExperimentConfig {
  const cacheKey = [
    env.MEMORY_SEMANTIC_CACHE_AB_ENABLED || '',
    env.MEMORY_SEMANTIC_CACHE_AB_SCOPE || '',
    env.MEMORY_SEMANTIC_CACHE_AB_RATIO || '',
  ].join('|');

  if (cacheKey === cachedConfigKey && cachedConfig) {
    return cachedConfig;
  }

  const nextConfig: SemanticCacheExperimentConfig = {
    enabled: parseBoolEnv(env.MEMORY_SEMANTIC_CACHE_AB_ENABLED),
    scope: parseScope(env.MEMORY_SEMANTIC_CACHE_AB_SCOPE),
    ratio: parseRatio(env.MEMORY_SEMANTIC_CACHE_AB_RATIO),
  };

  cachedConfigKey = cacheKey;
  cachedConfig = nextConfig;
  return nextConfig;
}

function isMissingSemanticCacheEventsTableError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();
  return code === '42P01' || message.includes('memory_semantic_cache_experiment_events');
}

export function resolveSemanticCacheDecision(
  params: ResolveSemanticCacheDecisionParams
): SemanticCacheDecision {
  const { enabled, scope, ratio } = getSemanticCacheExperimentConfig();

  if (!enabled) {
    return {
      enabled: false,
      variant: null,
      bucket: null,
      allowRead: true,
      allowWrite: true,
      scope,
      reason: 'experiment_disabled',
    };
  }

  if (ratio == null) {
    return {
      enabled: false,
      variant: null,
      bucket: null,
      allowRead: true,
      allowWrite: true,
      scope,
      reason: 'invalid_ratio',
    };
  }

  const isDashboardEligible = scope === 'all' || params.keyId === null;
  if (!isDashboardEligible) {
    return {
      enabled: true,
      variant: null,
      bucket: null,
      allowRead: true,
      allowWrite: true,
      scope,
      reason: 'not_eligible_scope',
    };
  }

  const bucket = computeUserBucket(params.userId);
  const isTreatment = ratio >= 100 ? true : ratio <= 0 ? false : bucket < ratio;

  return {
    enabled: true,
    variant: isTreatment ? 'treatment' : 'control',
    bucket,
    allowRead: isTreatment,
    allowWrite: isTreatment,
    scope,
    reason: isTreatment ? 'assigned_treatment' : 'assigned_control',
  };
}

export async function recordSemanticCacheExperimentEvent(
  supabase: SupabaseClient,
  input: SemanticCacheExperimentEventInput
): Promise<void> {
  const { error } = await supabase.from('memory_semantic_cache_experiment_events').insert({
    user_id: input.userId,
    namespace: input.namespace,
    source: input.source,
    requested_mode: input.requestedMode,
    resolved_mode: input.resolvedMode,
    variant: input.variant,
    cache_hit: input.cacheHit,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    result_count: Math.max(0, Math.round(input.resultCount)),
    fallback_reason: input.fallbackReason || null,
    error_code: input.errorCode || null,
  });

  if (error && !isMissingSemanticCacheEventsTableError(error)) {
    throw error;
  }
}
