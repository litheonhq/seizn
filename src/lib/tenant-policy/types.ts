/**
 * Seizn Tenant-Level Budget/Quota Policy Types
 *
 * TheLabForge 등 테넌트 단위로 비용 상한, 자동 디그레이드, 레이트리밋을 관리하는 정책 타입
 * @see SEIZN_THELABFORGE_TENANT_BUDGET_QUOTA_POLICY_TEMPLATES.md
 */

// ============================================================================
// Core Types
// ============================================================================

export type PolicyMode = "enforce" | "monitor" | "disabled";
export type Currency = "usd" | "krw";
export type PIIAction = "mask" | "redact" | "allow";
export type SearchMode = "semantic" | "hybrid" | "keyword";

// ============================================================================
// Policy Caps
// ============================================================================

export interface PolicyCaps {
  /** 월 비용 상한 (cents) - 하드 상한, 초과 시 429/402 또는 강제 디그레이드 */
  monthly_cost_cents: number;
  /** 일 비용 상한 (cents) */
  daily_cost_cents: number;
  /** 월 요청 수 상한 */
  monthly_requests: number;
  /** 일 요청 수 상한 */
  daily_requests: number;
  /** 분당 요청 수 (Rate limit) */
  rpm: number;
}

// ============================================================================
// Service-Specific Configs
// ============================================================================

export interface SummerConfig {
  /** Autopilot 기본 latency budget (ms) */
  autopilot_default_budget_ms: number;
  /** Autopilot 최대 latency budget (ms) */
  autopilot_budget_ms_max: number;
  /** 기본 top K 결과 수 */
  topK_default: number;
  /** 최대 top K 결과 수 */
  topK_max: number;
  /** Rerank 기본 활성화 여부 */
  rerank_default: boolean;
  /** Rerank 기본 top N */
  rerank_topN_default: number;
  /** Rerank 최대 top N */
  rerank_topN_max: number;
  /** Hybrid 검색 기본 활성화 */
  hybrid_default: boolean;
  /** Answer Contract 기본 활성화 */
  answer_contract_default: boolean;
  /** Answer Contract 최대 샘플링 비율 */
  answer_contract_max_sampling_rate: number;
  /** Federated 검색 활성화 */
  federated_enabled: boolean;
  /** Federated 최대 소스 수 */
  federated_max_sources: number;
  /** Federated 소스별 최대 top K */
  federated_topK_per_source_max: number;
  /** 강제 검색 모드 (degrade ladder에서 사용) */
  mode_force?: SearchMode;
}

export interface IngestConfig {
  /** Ingest 활성화 여부 */
  enabled: boolean;
  /** 일일 청크 업서트 최대 수 */
  daily_chunk_upserts_max: number;
  /** 문서당 최대 청크 수 */
  per_doc_chunk_max: number;
  /** 요청당 최대 바이트 (bytes) */
  per_request_bytes_max: number;
  /** 최대 동시 처리 수 */
  concurrency_max: number;
}

export interface FallConfig {
  /** Trace 샘플링 비율 (0-1) */
  trace_sampling_rate: number;
  /** 원본 텍스트 저장 여부 */
  trace_store_raw_text: boolean;
  /** Eval 샘플링 비율 (0-1) */
  eval_sampling_rate: number;
  /** Eval 최대 QPS */
  eval_max_qps: number;
}

export interface WinterConfig {
  /** PII 처리 방식 */
  pii_action: PIIAction;
  /** 데이터 보존 기간 (일) */
  retention_days: number;
}

// ============================================================================
// Degrade Ladder
// ============================================================================

export interface DegradeActions {
  /** Answer Contract 샘플링 비율 override */
  answer_contract_sampling_rate?: number;
  /** Summer 설정 override */
  summer?: Partial<SummerConfig>;
  /** Ingest 설정 override */
  ingest?: Partial<IngestConfig>;
  /** Fall 설정 override */
  fall?: Partial<FallConfig>;
}

export interface DegradeLadderStep {
  /** 예산 사용률 임계값 (0-1) - 이 값 이상일 때 actions 적용 */
  at_budget_usage_gte: number;
  /** 적용할 설정 변경 */
  actions: DegradeActions;
}

// ============================================================================
// Main Policy Interface
// ============================================================================

export interface TenantPolicy {
  /** 정책 스키마 버전 */
  version: number;
  /** 테넌트 식별자 */
  tenant: string;
  /** 정책 모드 */
  mode: PolicyMode;
  /** 비용 통화 */
  currency: Currency;
  /** 비용/요청 상한 */
  caps: PolicyCaps;
  /** Summer Retrieve 설정 */
  summer: SummerConfig;
  /** Ingest 설정 */
  ingest: IngestConfig;
  /** Fall Trace/Eval 설정 */
  fall: FallConfig;
  /** Winter Memory 설정 */
  winter: WinterConfig;
  /** 예산 소진률에 따른 자동 디그레이드 규칙 (필수) */
  degrade_ladder: DegradeLadderStep[];
}

// ============================================================================
// Budget State
// ============================================================================

export interface TenantBudgetState {
  /** 테넌트 ID */
  tenantId: string;
  /** 월 사용 비용 (cents) */
  monthSpendCents: number;
  /** 일 사용 비용 (cents) */
  daySpendCents: number;
  /** 월 사용 요청 수 */
  monthRequests: number;
  /** 일 사용 요청 수 */
  dayRequests: number;
  /** 분 사용 요청 수 (rolling window) */
  minuteRequests: number;
  /** 일일 ingest chunk upserts 수 */
  dayChunkUpserts: number;
  /** 월 비용 사용률 (0-1) */
  ratioMonth: number;
  /** 일 비용 사용률 (0-1) */
  ratioDay: number;
  /** 마지막 업데이트 시각 */
  lastUpdated: Date;
}

// ============================================================================
// Enforcement Result
// ============================================================================

export type EnforcementAction = "allow" | "deny" | "degrade";
export type DenyReason =
  | "monthly_cost_exceeded"
  | "daily_cost_exceeded"
  | "monthly_requests_exceeded"
  | "daily_requests_exceeded"
  | "rpm_exceeded"
  | "ingest_disabled"
  | "quota_exceeded";

export interface EnforcementResult {
  /** 허용 여부 */
  action: EnforcementAction;
  /** 거부 사유 (action이 deny일 때) */
  reason?: DenyReason;
  /** 적용된 유효 정책 (degrade ladder 적용 후) */
  effectivePolicy: TenantPolicy;
  /** 현재 예산 상태 */
  budgetState: TenantBudgetState;
  /** 디그레이드 레벨 (0 = 없음, 1-3 = degrade ladder 단계) */
  degradeLevel: number;
  /** Retry-After 헤더 값 (초) - rpm 초과 시 */
  retryAfter?: number;
}

// ============================================================================
// Summer Request Params (for clamping)
// ============================================================================

export interface SummerRequestParams {
  collection_id: string;
  query: string;
  top_k?: number;
  autopilot?: {
    enabled?: boolean;
    budget_ms?: number;
  };
  hybrid?: boolean;
  rerank?: boolean;
  rerank_top_n?: number;
  answer_contract?: boolean;
  federated?: {
    enabled?: boolean;
    sources?: string[];
    top_k_per_source?: number;
  };
}

export interface ClampedParams extends SummerRequestParams {
  /** 원본 파라미터가 클램핑 되었는지 여부 */
  _clamped: boolean;
  /** 클램핑된 필드 목록 */
  _clamped_fields: string[];
}

// ============================================================================
// Presets
// ============================================================================

export type PresetName = "ultra_conservative" | "conservative" | "aggressive";

export interface PolicyPreset {
  name: PresetName;
  displayName: string;
  description: string;
  monthlyCostUsd: number;
  policy: TenantPolicy;
}
