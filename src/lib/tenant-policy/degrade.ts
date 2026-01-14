/**
 * Degrade Ladder Logic
 *
 * 예산 사용률에 따라 자동으로 품질을 내리는 규칙 적용
 * - 70%: 경미한 제한 (answer_contract off, trace/eval 감소)
 * - 85%: 중간 제한 (rerank off, topK 감소)
 * - 95%: 강한 제한 (keyword only, ingest off)
 */

import type {
  TenantPolicy,
  TenantBudgetState,
  DegradeLadderStep,
  DegradeActions,
  SummerConfig,
  IngestConfig,
  FallConfig,
} from "./types";

// ============================================================================
// Types
// ============================================================================

export interface DegradeResult {
  /** 적용된 유효 정책 */
  effectivePolicy: TenantPolicy;
  /** 현재 디그레이드 레벨 (0 = 없음, 1-N = ladder 단계) */
  degradeLevel: number;
  /** 적용된 ladder step들 */
  appliedSteps: DegradeLadderStep[];
  /** 다음 디그레이드까지 남은 예산 비율 */
  nextDegradeAt: number | null;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * 현재 예산 사용률에 따라 degrade ladder 적용
 *
 * 규칙:
 * - ladder는 at_budget_usage_gte 오름차순 정렬
 * - 현재 사용률 이하인 모든 step의 actions를 누적 적용
 * - 더 높은 step이 낮은 step의 설정을 override
 */
export function applyDegradeLadder(
  policy: TenantPolicy,
  budgetState: TenantBudgetState
): DegradeResult {
  // 최대 사용률 (월/일 중 높은 것)
  const currentUsage = Math.max(budgetState.ratioMonth, budgetState.ratioDay);

  // ladder를 threshold 오름차순 정렬
  const sortedLadder = [...policy.degrade_ladder].sort(
    (a, b) => a.at_budget_usage_gte - b.at_budget_usage_gte
  );

  // 적용해야 할 step들 필터링
  const applicableSteps = sortedLadder.filter(
    (step) => currentUsage >= step.at_budget_usage_gte
  );

  // 적용할 step이 없으면 원본 정책 반환
  if (applicableSteps.length === 0) {
    // 다음 디그레이드 threshold 찾기
    const nextStep = sortedLadder[0];
    return {
      effectivePolicy: policy,
      degradeLevel: 0,
      appliedSteps: [],
      nextDegradeAt: nextStep?.at_budget_usage_gte ?? null,
    };
  }

  // 모든 적용 가능한 step의 actions를 누적 병합
  const mergedActions = mergeActions(applicableSteps);

  // 원본 정책에 병합된 actions 적용
  const effectivePolicy = applyActions(policy, mergedActions);

  // 다음 디그레이드 threshold 찾기
  const lastAppliedStep = applicableSteps[applicableSteps.length - 1];
  const nextStepIndex = sortedLadder.findIndex(
    (s) => s.at_budget_usage_gte > lastAppliedStep.at_budget_usage_gte
  );
  const nextStep = nextStepIndex >= 0 ? sortedLadder[nextStepIndex] : null;

  return {
    effectivePolicy,
    degradeLevel: applicableSteps.length,
    appliedSteps: applicableSteps,
    nextDegradeAt: nextStep?.at_budget_usage_gte ?? null,
  };
}

/**
 * 여러 step의 actions를 누적 병합
 * 나중 step이 이전 step을 override
 */
function mergeActions(steps: DegradeLadderStep[]): DegradeActions {
  const merged: DegradeActions = {};

  for (const step of steps) {
    const { actions } = step;

    // answer_contract_sampling_rate
    if (actions.answer_contract_sampling_rate !== undefined) {
      merged.answer_contract_sampling_rate = actions.answer_contract_sampling_rate;
    }

    // summer
    if (actions.summer) {
      merged.summer = { ...merged.summer, ...actions.summer };
    }

    // ingest
    if (actions.ingest) {
      merged.ingest = { ...merged.ingest, ...actions.ingest };
    }

    // fall
    if (actions.fall) {
      merged.fall = { ...merged.fall, ...actions.fall };
    }
  }

  return merged;
}

/**
 * 정책에 actions 적용
 */
function applyActions(
  policy: TenantPolicy,
  actions: DegradeActions
): TenantPolicy {
  const result: TenantPolicy = JSON.parse(JSON.stringify(policy));

  // answer_contract_sampling_rate → summer.answer_contract_max_sampling_rate
  if (actions.answer_contract_sampling_rate !== undefined) {
    result.summer.answer_contract_max_sampling_rate =
      actions.answer_contract_sampling_rate;
  }

  // summer overrides
  if (actions.summer) {
    result.summer = {
      ...result.summer,
      ...actions.summer,
    } as SummerConfig;
  }

  // ingest overrides
  if (actions.ingest) {
    result.ingest = {
      ...result.ingest,
      ...actions.ingest,
    } as IngestConfig;
  }

  // fall overrides
  if (actions.fall) {
    result.fall = {
      ...result.fall,
      ...actions.fall,
    } as FallConfig;
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 현재 디그레이드 레벨의 요약 메시지 생성
 */
export function getDegradeSummary(result: DegradeResult): string {
  if (result.degradeLevel === 0) {
    return "정상 운영 중";
  }

  const messages: string[] = [];
  const policy = result.effectivePolicy;

  // rerank 비활성화 확인
  if (!policy.summer.rerank_default) {
    messages.push("Rerank 비활성화");
  }

  // ingest 비활성화 확인
  if (!policy.ingest.enabled) {
    messages.push("Ingest 일시 중단");
  }

  // keyword only 모드 확인
  if (policy.summer.mode_force === "keyword") {
    messages.push("키워드 검색만 허용");
  }

  // topK 제한 확인
  const lastStep = result.appliedSteps[result.appliedSteps.length - 1];
  if (lastStep?.actions.summer?.topK_max) {
    messages.push(`TopK 최대 ${lastStep.actions.summer.topK_max}개`);
  }

  return messages.length > 0
    ? `디그레이드 레벨 ${result.degradeLevel}: ${messages.join(", ")}`
    : `디그레이드 레벨 ${result.degradeLevel}`;
}

/**
 * 디그레이드 경고 메시지 생성 (API 응답용)
 */
export function getDegradeWarningHeader(
  result: DegradeResult,
  budgetState: TenantBudgetState
): string | null {
  if (result.degradeLevel === 0) return null;

  const currentUsage = Math.max(budgetState.ratioMonth, budgetState.ratioDay);
  const usagePercent = Math.round(currentUsage * 100);

  return `Budget usage at ${usagePercent}%. Service quality reduced. Level: ${result.degradeLevel}`;
}

/**
 * 예산 상태에 따른 색상 코드 반환 (UI용)
 */
export function getBudgetStatusColor(
  budgetState: TenantBudgetState
): "green" | "yellow" | "orange" | "red" {
  const usage = Math.max(budgetState.ratioMonth, budgetState.ratioDay);

  if (usage < 0.5) return "green";
  if (usage < 0.7) return "yellow";
  if (usage < 0.9) return "orange";
  return "red";
}

/**
 * 다음 디그레이드까지 남은 예산 계산
 */
export function getRemainingBudgetUntilDegrade(
  policy: TenantPolicy,
  budgetState: TenantBudgetState,
  result: DegradeResult
): number | null {
  if (result.nextDegradeAt === null) return null;

  const currentUsage = Math.max(budgetState.ratioMonth, budgetState.ratioDay);
  const remaining = result.nextDegradeAt - currentUsage;

  // 월 기준 남은 비용 (cents)
  const remainingCents = Math.round(
    remaining * policy.caps.monthly_cost_cents
  );

  return remainingCents;
}

/**
 * 예산 사용률 계산
 */
export function calculateBudgetUsage(
  budgetState: TenantBudgetState,
  policy: TenantPolicy
): {
  monthUsage: number;
  dayUsage: number;
  maxUsage: number;
  requestUsage: {
    month: number;
    day: number;
    rpm: number;
  };
} {
  return {
    monthUsage: budgetState.monthSpendCents / policy.caps.monthly_cost_cents,
    dayUsage: budgetState.daySpendCents / policy.caps.daily_cost_cents,
    maxUsage: Math.max(
      budgetState.monthSpendCents / policy.caps.monthly_cost_cents,
      budgetState.daySpendCents / policy.caps.daily_cost_cents
    ),
    requestUsage: {
      month: budgetState.monthRequests / policy.caps.monthly_requests,
      day: budgetState.dayRequests / policy.caps.daily_requests,
      rpm: budgetState.minuteRequests / policy.caps.rpm,
    },
  };
}
