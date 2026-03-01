import crypto from 'crypto';

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

export function resolveSemanticCacheDecision(
  params: ResolveSemanticCacheDecisionParams
): SemanticCacheDecision {
  const enabled = parseBoolEnv(process.env.MEMORY_SEMANTIC_CACHE_AB_ENABLED);
  const scope = parseScope(process.env.MEMORY_SEMANTIC_CACHE_AB_SCOPE);
  const ratio = parseRatio(process.env.MEMORY_SEMANTIC_CACHE_AB_RATIO);

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
