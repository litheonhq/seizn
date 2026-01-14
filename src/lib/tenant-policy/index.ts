/**
 * Seizn Tenant Policy Module
 *
 * 테넌트 단위 비용 상한, 자동 디그레이드, 레이트리밋 관리
 *
 * @example
 * ```typescript
 * import {
 *   getTenantPolicy,
 *   getTenantBudgetState,
 *   enforceCaps,
 *   clampSummerParams,
 * } from '@/lib/tenant-policy';
 *
 * // 1. 정책 로드
 * const policy = await getTenantPolicy('thelabforge');
 *
 * // 2. 예산 상태 확인
 * const budgetState = await getTenantBudgetState(policy);
 *
 * // 3. 정책 집행
 * const result = enforceCaps(policy, budgetState, { type: 'summer' });
 *
 * // 4. 파라미터 클램핑
 * const clampedParams = clampSummerParams(result.effectivePolicy, requestBody);
 * ```
 */

// Types
export type {
  PolicyMode,
  Currency,
  PIIAction,
  SearchMode,
  PolicyCaps,
  SummerConfig,
  IngestConfig,
  FallConfig,
  WinterConfig,
  DegradeActions,
  DegradeLadderStep,
  TenantPolicy,
  TenantBudgetState,
  EnforcementAction,
  DenyReason,
  EnforcementResult,
  SummerRequestParams,
  ClampedParams,
  PresetName,
  PolicyPreset,
} from "./types";

// Presets
export {
  ULTRA_CONSERVATIVE_POLICY,
  CONSERVATIVE_POLICY,
  AGGRESSIVE_POLICY,
  POLICY_PRESETS,
  getPreset,
  listPresets,
  getDefaultPreset,
  createTenantPolicy,
} from "./presets";

// Store
export {
  getTenantPolicy,
  loadPolicyFromDB,
  savePolicyToDB,
  getTenantBudgetState,
  updateBudgetState,
  invalidatePolicyCache,
  getAllCachedPolicies,
} from "./store";

// Degrade Ladder
export {
  applyDegradeLadder,
  getDegradeSummary,
  getDegradeWarningHeader,
  getBudgetStatusColor,
  getRemainingBudgetUntilDegrade,
  calculateBudgetUsage,
} from "./degrade";
export type { DegradeResult } from "./degrade";

// Enforcer
export {
  enforceCaps,
  toHttpResponse,
  quickRateLimitCheck,
  estimateSummerCost,
} from "./enforcer";
export type { RequestMeta, EnforceOptions } from "./enforcer";

// Clamping
export {
  clampSummerParams,
  clampValue,
  getClampedHeaders,
  getClampedWarning,
  clampIngestParams,
  clampFallParams,
  validateSummerParams,
} from "./clamp";
export type {
  IngestRequestParams,
  ClampedIngestParams,
  FallRequestParams,
  ClampedFallParams,
} from "./clamp";
