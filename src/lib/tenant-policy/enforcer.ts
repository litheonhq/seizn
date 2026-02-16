/**
 * Policy Enforcement
 *
 * 테넌트 정책 집행 로직
 * - Rate limit (RPM, daily, monthly)
 * - Cost cap 체크
 * - Degrade ladder 적용
 * - 거부/디그레이드 결정
 */

import type {
  TenantPolicy,
  TenantBudgetState,
  EnforcementResult,
  EnforcementAction,
  DenyReason,
} from "./types";
import { applyDegradeLadder } from "./degrade";

// ============================================================================
// Types
// ============================================================================

export interface RequestMeta {
  /** 요청 타입 */
  type: "summer" | "ingest" | "fall" | "winter";
  /** 예상 비용 (cents) */
  estimatedCostCents?: number;
  /** 요청 바이트 크기 (ingest용) */
  requestBytes?: number;
  /** 청크 수 (ingest용) */
  chunkCount?: number;
}

export interface EnforceOptions {
  /** 모니터링 전용 모드 (거부하지 않고 로그만) */
  monitorOnly?: boolean;
  /** strict 모드 (100% 도달 시 즉시 거부) */
  strict?: boolean;
}

// ============================================================================
// Core Enforcement
// ============================================================================

/**
 * 정책 집행
 *
 * 체크 순서:
 * 1. 정책 모드 확인 (disabled면 무조건 allow)
 * 2. Rate limit 체크 (RPM → daily requests → monthly requests)
 * 3. Cost cap 체크 (daily → monthly)
 * 4. Ingest 특별 체크 (enabled, chunk limits)
 * 5. Degrade ladder 적용
 */
export function enforceCaps(
  policy: TenantPolicy,
  budgetState: TenantBudgetState,
  requestMeta: RequestMeta,
  options: EnforceOptions = {}
): EnforcementResult {
  // 정책 비활성화 시 무조건 허용
  if (policy.mode === "disabled") {
    return createAllowResult(policy, budgetState, 0);
  }

  // 1. Rate limit 체크
  const rateLimitResult = checkRateLimits(policy, budgetState);
  if (rateLimitResult) {
    if (options.monitorOnly || policy.mode === "monitor") {
      console.warn(`[TenantPolicy] Rate limit would deny: ${rateLimitResult.reason}`);
    } else {
      return rateLimitResult;
    }
  }

  // 2. Cost cap 체크
  const costCapResult = checkCostCaps(
    policy,
    budgetState,
    requestMeta.estimatedCostCents || 0,
    options.strict
  );
  if (costCapResult) {
    if (options.monitorOnly || policy.mode === "monitor") {
      console.warn(`[TenantPolicy] Cost cap would deny: ${costCapResult.reason}`);
    } else {
      return costCapResult;
    }
  }

  // 3. Ingest 특별 체크
  if (requestMeta.type === "ingest") {
    const ingestResult = checkIngestLimits(policy, budgetState, requestMeta);
    if (ingestResult) {
      if (options.monitorOnly || policy.mode === "monitor") {
        console.warn(`[TenantPolicy] Ingest limit would deny: ${ingestResult.reason}`);
      } else {
        return ingestResult;
      }
    }
  }

  // 4. Degrade ladder 적용
  const degradeResult = applyDegradeLadder(policy, budgetState);

  // ingest가 degrade로 disabled 되었는지 체크
  if (
    requestMeta.type === "ingest" &&
    !degradeResult.effectivePolicy.ingest.enabled
  ) {
    if (options.monitorOnly || policy.mode === "monitor") {
      console.warn("[TenantPolicy] Ingest disabled by degrade ladder");
    } else {
      return createDenyResult(
        "ingest_disabled",
        degradeResult.effectivePolicy,
        budgetState,
        degradeResult.degradeLevel
      );
    }
  }

  // 디그레이드가 적용되었는지 확인
  const action: EnforcementAction =
    degradeResult.degradeLevel > 0 ? "degrade" : "allow";

  return {
    action,
    effectivePolicy: degradeResult.effectivePolicy,
    budgetState,
    degradeLevel: degradeResult.degradeLevel,
  };
}

// ============================================================================
// Rate Limit Checks
// ============================================================================

function checkRateLimits(
  policy: TenantPolicy,
  budgetState: TenantBudgetState
): EnforcementResult | null {
  // RPM 체크
  if (budgetState.minuteRequests >= policy.caps.rpm) {
    return createDenyResult(
      "rpm_exceeded",
      policy,
      budgetState,
      0,
      60 // 1분 후 재시도
    );
  }

  // Daily requests 체크
  if (budgetState.dayRequests >= policy.caps.daily_requests) {
    // 다음 날 00:00까지 초 계산
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const retryAfter = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);

    return createDenyResult(
      "daily_requests_exceeded",
      policy,
      budgetState,
      0,
      retryAfter
    );
  }

  // Monthly requests 체크
  if (budgetState.monthRequests >= policy.caps.monthly_requests) {
    // 다음 달 1일까지 초 계산
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const retryAfter = Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);

    return createDenyResult(
      "monthly_requests_exceeded",
      policy,
      budgetState,
      0,
      retryAfter
    );
  }

  return null;
}

// ============================================================================
// Cost Cap Checks
// ============================================================================

function checkCostCaps(
  policy: TenantPolicy,
  budgetState: TenantBudgetState,
  estimatedCostCents: number,
  strict?: boolean
): EnforcementResult | null {
  const projectedDaySpend = budgetState.daySpendCents + estimatedCostCents;
  const projectedMonthSpend = budgetState.monthSpendCents + estimatedCostCents;

  // Daily cost cap
  if (projectedDaySpend > policy.caps.daily_cost_cents) {
    // strict 모드면 즉시 거부, 아니면 약간의 여유 허용 (5%)
    const threshold = strict
      ? policy.caps.daily_cost_cents
      : policy.caps.daily_cost_cents * 1.05;

    if (projectedDaySpend > threshold) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const retryAfter = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);

      return createDenyResult(
        "daily_cost_exceeded",
        policy,
        budgetState,
        0,
        retryAfter
      );
    }
  }

  // Monthly cost cap
  if (projectedMonthSpend > policy.caps.monthly_cost_cents) {
    const threshold = strict
      ? policy.caps.monthly_cost_cents
      : policy.caps.monthly_cost_cents * 1.05;

    if (projectedMonthSpend > threshold) {
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const retryAfter = Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);

      return createDenyResult(
        "monthly_cost_exceeded",
        policy,
        budgetState,
        0,
        retryAfter
      );
    }
  }

  return null;
}

// ============================================================================
// Ingest Checks
// ============================================================================

function checkIngestLimits(
  policy: TenantPolicy,
  budgetState: TenantBudgetState,
  requestMeta: RequestMeta
): EnforcementResult | null {
  // Ingest 비활성화 확인
  if (!policy.ingest.enabled) {
    return createDenyResult("ingest_disabled", policy, budgetState, 0);
  }

  // 요청 바이트 크기 체크
  if (
    requestMeta.requestBytes &&
    requestMeta.requestBytes > policy.ingest.per_request_bytes_max
  ) {
    return createDenyResult("quota_exceeded", policy, budgetState, 0);
  }

  // 청크 수 체크
  if (
    requestMeta.chunkCount &&
    requestMeta.chunkCount > policy.ingest.per_doc_chunk_max
  ) {
    return createDenyResult("quota_exceeded", policy, budgetState, 0);
  }

  // 일일 chunk upsert 상한 체크
  if (requestMeta.chunkCount && requestMeta.chunkCount > 0) {
    const currentChunkUpserts = Number.isFinite(budgetState.dayChunkUpserts)
      ? budgetState.dayChunkUpserts
      : 0;
    const projectedChunkUpserts = currentChunkUpserts + requestMeta.chunkCount;
    if (projectedChunkUpserts > policy.ingest.daily_chunk_upserts_max) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const retryAfter = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);

      return createDenyResult(
        "quota_exceeded",
        policy,
        budgetState,
        0,
        retryAfter
      );
    }
  }

  return null;
}

// ============================================================================
// Result Builders
// ============================================================================

function createAllowResult(
  policy: TenantPolicy,
  budgetState: TenantBudgetState,
  degradeLevel: number
): EnforcementResult {
  return {
    action: "allow",
    effectivePolicy: policy,
    budgetState,
    degradeLevel,
  };
}

function createDenyResult(
  reason: DenyReason,
  policy: TenantPolicy,
  budgetState: TenantBudgetState,
  degradeLevel: number,
  retryAfter?: number
): EnforcementResult {
  return {
    action: "deny",
    reason,
    effectivePolicy: policy,
    budgetState,
    degradeLevel,
    retryAfter,
  };
}

// ============================================================================
// HTTP Response Helpers
// ============================================================================

/**
 * EnforcementResult를 HTTP 응답으로 변환
 */
export function toHttpResponse(result: EnforcementResult): {
  status: number;
  headers: Record<string, string>;
  body: {
    error?: string;
    code?: string;
    retry_after?: number;
    degrade_level?: number;
    message?: string;
  };
} {
  const headers: Record<string, string> = {};

  // 디그레이드 경고 헤더 추가
  if (result.degradeLevel > 0) {
    headers["X-Seizn-Degrade-Level"] = String(result.degradeLevel);
    headers["X-Seizn-Budget-Warning"] = "true";
  }

  if (result.action === "allow" || result.action === "degrade") {
    return {
      status: 200,
      headers,
      body:
        result.action === "degrade"
          ? {
              degrade_level: result.degradeLevel,
              message: "Service quality reduced due to budget constraints",
            }
          : {},
    };
  }

  // Deny 응답
  if (result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  const statusMap: Record<DenyReason, number> = {
    rpm_exceeded: 429,
    daily_requests_exceeded: 429,
    monthly_requests_exceeded: 429,
    daily_cost_exceeded: 402,
    monthly_cost_exceeded: 402,
    ingest_disabled: 503,
    quota_exceeded: 413,
  };

  const messageMap: Record<DenyReason, string> = {
    rpm_exceeded: "Rate limit exceeded. Please slow down.",
    daily_requests_exceeded: "Daily request limit reached.",
    monthly_requests_exceeded: "Monthly request limit reached.",
    daily_cost_exceeded: "Daily budget exhausted.",
    monthly_cost_exceeded: "Monthly budget exhausted.",
    ingest_disabled: "Ingest temporarily disabled due to budget constraints.",
    quota_exceeded: "Request exceeds quota limits.",
  };

  return {
    status: statusMap[result.reason!] || 429,
    headers,
    body: {
      error: messageMap[result.reason!],
      code: result.reason,
      retry_after: result.retryAfter,
    },
  };
}

/**
 * 빠른 rate limit 체크 (full enforcement 전에 사용)
 */
export function quickRateLimitCheck(
  policy: TenantPolicy,
  minuteRequests: number
): boolean {
  return minuteRequests < policy.caps.rpm;
}

/**
 * 예상 비용 계산 (Summer 요청용)
 */
export function estimateSummerCost(
  policy: TenantPolicy,
  params: {
    topK?: number;
    rerank?: boolean;
    rerankTopN?: number;
    answerContract?: boolean;
    federated?: boolean;
    federatedSources?: number;
  }
): number {
  // 기본 비용 (cents)
  let baseCost = 0.5; // $0.005 per request

  // topK 비용
  const topK = Math.min(params.topK || policy.summer.topK_default, policy.summer.topK_max);
  baseCost += topK * 0.02; // $0.0002 per result

  // rerank 비용
  if (params.rerank ?? policy.summer.rerank_default) {
    const rerankTopN = Math.min(
      params.rerankTopN || policy.summer.rerank_topN_default,
      policy.summer.rerank_topN_max
    );
    baseCost += rerankTopN * 0.05; // $0.0005 per reranked doc
  }

  // answer contract 비용
  if (params.answerContract) {
    baseCost += 2.0; // $0.02 per contract check
  }

  // federated 비용
  if (params.federated && policy.summer.federated_enabled) {
    const sources = Math.min(
      params.federatedSources || 1,
      policy.summer.federated_max_sources
    );
    baseCost *= sources;
  }

  return Math.ceil(baseCost);
}
