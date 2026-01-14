/**
 * Tenant Policy Store
 *
 * 정책 로드, 캐싱, DB 연동을 담당
 * - 환경변수(SEIZN_TENANT_POLICY_*) 또는 DB(organizations.settings)에서 로드
 * - 메모리 캐시로 빠른 조회
 */

import type { TenantPolicy, TenantBudgetState } from "./types";
import { CONSERVATIVE_POLICY, createTenantPolicy } from "./presets";

// ============================================================================
// Cache
// ============================================================================

const policyCache = new Map<string, { policy: TenantPolicy; loadedAt: Date }>();
const budgetCache = new Map<string, TenantBudgetState>();

const CACHE_TTL_MS = 60 * 1000; // 1분 캐시

// ============================================================================
// Policy Loader
// ============================================================================

/**
 * 환경변수에서 테넌트 정책 로드
 * 형식: SEIZN_TENANT_POLICY_{TENANT_ID} = JSON
 */
function loadPolicyFromEnv(tenantId: string): TenantPolicy | null {
  const envKey = `SEIZN_TENANT_POLICY_${tenantId.toUpperCase().replace(/-/g, "_")}`;
  const envValue = process.env[envKey];

  if (!envValue) return null;

  try {
    const parsed = JSON.parse(envValue);
    return validatePolicy(parsed);
  } catch (error) {
    console.error(`[TenantPolicy] Failed to parse env ${envKey}:`, error);
    return null;
  }
}

/**
 * 개별 환경변수에서 정책 합성
 * 형식: SEIZN_TLF_* 환경변수들
 */
function loadPolicyFromEnvParts(tenantId: string): TenantPolicy | null {
  const prefix = `SEIZN_${tenantId.toUpperCase().replace(/-/g, "_").slice(0, 3)}_`;

  // 핵심 변수가 하나라도 있으면 합성 시도
  const monthlyCap = process.env[`${prefix}MONTHLY_COST_CAP_CENTS`];
  if (!monthlyCap) return null;

  const base = createTenantPolicy(tenantId, "conservative");

  // caps
  base.caps.monthly_cost_cents =
    parseInt(process.env[`${prefix}MONTHLY_COST_CAP_CENTS`] || "") ||
    base.caps.monthly_cost_cents;
  base.caps.daily_cost_cents =
    parseInt(process.env[`${prefix}DAILY_COST_CAP_CENTS`] || "") ||
    base.caps.daily_cost_cents;
  base.caps.monthly_requests =
    parseInt(process.env[`${prefix}MONTHLY_REQUESTS`] || "") ||
    base.caps.monthly_requests;
  base.caps.daily_requests =
    parseInt(process.env[`${prefix}DAILY_REQUESTS`] || "") ||
    base.caps.daily_requests;
  base.caps.rpm =
    parseInt(process.env[`${prefix}RPM`] || "") || base.caps.rpm;

  // summer
  base.summer.autopilot_default_budget_ms =
    parseInt(process.env[`${prefix}AUTOPILOT_DEFAULT_BUDGET_MS`] || "") ||
    base.summer.autopilot_default_budget_ms;
  base.summer.autopilot_budget_ms_max =
    parseInt(process.env[`${prefix}AUTOPILOT_BUDGET_MS_MAX`] || "") ||
    base.summer.autopilot_budget_ms_max;
  base.summer.topK_default =
    parseInt(process.env[`${prefix}TOPK_DEFAULT`] || "") ||
    base.summer.topK_default;
  base.summer.topK_max =
    parseInt(process.env[`${prefix}TOPK_MAX`] || "") || base.summer.topK_max;
  base.summer.rerank_default =
    process.env[`${prefix}RERANK_DEFAULT`] === "true";
  base.summer.rerank_topN_default =
    parseInt(process.env[`${prefix}RERANK_TOPN_DEFAULT`] || "") ||
    base.summer.rerank_topN_default;
  base.summer.rerank_topN_max =
    parseInt(process.env[`${prefix}RERANK_TOPN_MAX`] || "") ||
    base.summer.rerank_topN_max;
  base.summer.answer_contract_max_sampling_rate =
    parseFloat(process.env[`${prefix}ANSWER_CONTRACT_SAMPLE_MAX`] || "") ||
    base.summer.answer_contract_max_sampling_rate;

  // fall
  base.fall.trace_sampling_rate =
    parseFloat(process.env[`${prefix}TRACE_SAMPLE_RATE`] || "") ||
    base.fall.trace_sampling_rate;
  base.fall.eval_sampling_rate =
    parseFloat(process.env[`${prefix}EVAL_SAMPLE_RATE`] || "") ||
    base.fall.eval_sampling_rate;

  // ingest
  base.ingest.daily_chunk_upserts_max =
    parseInt(process.env[`${prefix}INGEST_DAILY_CHUNK_UPSERTS_MAX`] || "") ||
    base.ingest.daily_chunk_upserts_max;
  base.ingest.concurrency_max =
    parseInt(process.env[`${prefix}INGEST_CONCURRENCY_MAX`] || "") ||
    base.ingest.concurrency_max;

  return base;
}

/**
 * 정책 유효성 검증
 */
function validatePolicy(policy: unknown): TenantPolicy | null {
  if (!policy || typeof policy !== "object") return null;

  const p = policy as Record<string, unknown>;

  // 필수 필드 확인
  if (typeof p.version !== "number") return null;
  if (typeof p.tenant !== "string") return null;
  if (!p.caps || typeof p.caps !== "object") return null;
  if (!p.summer || typeof p.summer !== "object") return null;
  if (!Array.isArray(p.degrade_ladder)) return null;

  // 기본값 채우기
  const validated: TenantPolicy = {
    version: p.version as number,
    tenant: p.tenant as string,
    mode: (p.mode as TenantPolicy["mode"]) || "enforce",
    currency: (p.currency as TenantPolicy["currency"]) || "usd",
    caps: {
      monthly_cost_cents: 0,
      daily_cost_cents: 0,
      monthly_requests: 0,
      daily_requests: 0,
      rpm: 0,
      ...(p.caps as object),
    },
    summer: {
      autopilot_default_budget_ms: 500,
      autopilot_budget_ms_max: 900,
      topK_default: 16,
      topK_max: 24,
      rerank_default: true,
      rerank_topN_default: 24,
      rerank_topN_max: 48,
      hybrid_default: true,
      answer_contract_default: false,
      answer_contract_max_sampling_rate: 0.05,
      federated_enabled: true,
      federated_max_sources: 2,
      federated_topK_per_source_max: 10,
      ...(p.summer as object),
    },
    ingest: {
      enabled: true,
      daily_chunk_upserts_max: 25000,
      per_doc_chunk_max: 120,
      per_request_bytes_max: 10485760,
      concurrency_max: 2,
      ...((p.ingest as object) || {}),
    },
    fall: {
      trace_sampling_rate: 0.25,
      trace_store_raw_text: false,
      eval_sampling_rate: 0.05,
      eval_max_qps: 0.5,
      ...((p.fall as object) || {}),
    },
    winter: {
      pii_action: "mask",
      retention_days: 14,
      ...((p.winter as object) || {}),
    },
    degrade_ladder: p.degrade_ladder as TenantPolicy["degrade_ladder"],
  };

  return validated;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 테넌트 정책 가져오기
 *
 * 우선순위:
 * 1. 메모리 캐시 (TTL 내)
 * 2. 환경변수 JSON (SEIZN_TENANT_POLICY_*)
 * 3. 환경변수 Parts (SEIZN_TLF_*)
 * 4. 기본 Conservative 프리셋
 */
export async function getTenantPolicy(
  tenantId: string
): Promise<TenantPolicy> {
  // 1. 캐시 확인
  const cached = policyCache.get(tenantId);
  if (cached && Date.now() - cached.loadedAt.getTime() < CACHE_TTL_MS) {
    return cached.policy;
  }

  // 2. 환경변수 JSON
  let policy = loadPolicyFromEnv(tenantId);

  // 3. 환경변수 Parts
  if (!policy) {
    policy = loadPolicyFromEnvParts(tenantId);
  }

  // 4. 기본 프리셋
  if (!policy) {
    policy = createTenantPolicy(tenantId, "conservative");
  }

  // 캐시 저장
  policyCache.set(tenantId, { policy, loadedAt: new Date() });

  return policy;
}

/**
 * DB에서 테넌트 정책 로드 (Prisma 사용 시)
 * organizations.settings.budget_quota_policy 에서 로드
 */
export async function loadPolicyFromDB(
  tenantId: string,
  prisma?: unknown
): Promise<TenantPolicy | null> {
  // 실제 구현은 prisma를 통해 organizations 테이블 조회
  // 여기서는 타입만 정의
  if (!prisma) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const org = await db.organization.findUnique({
      where: { slug: tenantId },
      select: { settings: true },
    });

    if (!org?.settings?.budget_quota_policy) return null;

    return validatePolicy(org.settings.budget_quota_policy);
  } catch (error) {
    console.error(`[TenantPolicy] Failed to load from DB for ${tenantId}:`, error);
    return null;
  }
}

/**
 * DB에 테넌트 정책 저장
 */
export async function savePolicyToDB(
  tenantId: string,
  policy: TenantPolicy,
  prisma?: unknown
): Promise<boolean> {
  if (!prisma) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    await db.organization.update({
      where: { slug: tenantId },
      data: {
        settings: {
          budget_quota_policy: policy,
        },
      },
    });

    // 캐시 갱신
    policyCache.set(tenantId, { policy, loadedAt: new Date() });

    return true;
  } catch (error) {
    console.error(`[TenantPolicy] Failed to save to DB for ${tenantId}:`, error);
    return false;
  }
}

// ============================================================================
// Budget State
// ============================================================================

/**
 * 테넌트 예산 상태 가져오기
 *
 * 실제 구현에서는 Redis 또는 DB에서 사용량 조회
 */
export async function getTenantBudgetState(
  policy: TenantPolicy,
  tenantId?: string
): Promise<TenantBudgetState> {
  const id = tenantId || policy.tenant;

  // 캐시된 상태 확인
  const cached = budgetCache.get(id);
  if (cached) {
    return cached;
  }

  // 실제 구현에서는 여기서 Redis/DB 조회
  // 지금은 기본값 반환
  const state: TenantBudgetState = {
    tenantId: id,
    monthSpendCents: 0,
    daySpendCents: 0,
    monthRequests: 0,
    dayRequests: 0,
    minuteRequests: 0,
    ratioMonth: 0,
    ratioDay: 0,
    lastUpdated: new Date(),
  };

  return state;
}

/**
 * 테넌트 예산 상태 업데이트 (요청 비용 추가)
 */
export async function updateBudgetState(
  tenantId: string,
  costCents: number,
  policy: TenantPolicy
): Promise<TenantBudgetState> {
  const current = await getTenantBudgetState(policy, tenantId);

  const updated: TenantBudgetState = {
    ...current,
    monthSpendCents: current.monthSpendCents + costCents,
    daySpendCents: current.daySpendCents + costCents,
    monthRequests: current.monthRequests + 1,
    dayRequests: current.dayRequests + 1,
    minuteRequests: current.minuteRequests + 1,
    ratioMonth:
      (current.monthSpendCents + costCents) / policy.caps.monthly_cost_cents,
    ratioDay:
      (current.daySpendCents + costCents) / policy.caps.daily_cost_cents,
    lastUpdated: new Date(),
  };

  // 캐시 업데이트
  budgetCache.set(tenantId, updated);

  return updated;
}

/**
 * 캐시 무효화
 */
export function invalidatePolicyCache(tenantId?: string): void {
  if (tenantId) {
    policyCache.delete(tenantId);
    budgetCache.delete(tenantId);
  } else {
    policyCache.clear();
    budgetCache.clear();
  }
}

/**
 * 모든 캐시된 정책 반환 (디버깅용)
 */
export function getAllCachedPolicies(): Map<
  string,
  { policy: TenantPolicy; loadedAt: Date }
> {
  return new Map(policyCache);
}
