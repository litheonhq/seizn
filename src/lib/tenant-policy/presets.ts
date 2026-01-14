/**
 * Seizn Tenant Policy Presets
 *
 * 3가지 프리셋: 초보수(Ultra Conservative), 보수(Conservative, 추천), 공격적(Aggressive)
 */

import type { TenantPolicy, PolicyPreset, PresetName } from "./types";

// ============================================================================
// Ultra Conservative Preset
// 목적: 무료 런칭/테스트에서 "비용 0순위"
// 특징: rerank 제한, trace/eval 최소, ingest 제한 강함
// 월 예산: ~$30
// ============================================================================

export const ULTRA_CONSERVATIVE_POLICY: TenantPolicy = {
  version: 1,
  tenant: "thelabforge",
  mode: "enforce",
  currency: "usd",
  caps: {
    monthly_cost_cents: 3000,
    daily_cost_cents: 120,
    monthly_requests: 30000,
    daily_requests: 1000,
    rpm: 30,
  },
  summer: {
    autopilot_default_budget_ms: 300,
    autopilot_budget_ms_max: 450,
    topK_default: 10,
    topK_max: 14,
    rerank_default: true,
    rerank_topN_default: 12,
    rerank_topN_max: 18,
    hybrid_default: true,
    answer_contract_default: false,
    answer_contract_max_sampling_rate: 0.0,
    federated_enabled: true,
    federated_max_sources: 1,
    federated_topK_per_source_max: 8,
  },
  ingest: {
    enabled: true,
    daily_chunk_upserts_max: 8000,
    per_doc_chunk_max: 80,
    per_request_bytes_max: 5242880, // 5MB
    concurrency_max: 1,
  },
  fall: {
    trace_sampling_rate: 0.1,
    trace_store_raw_text: false,
    eval_sampling_rate: 0.0,
    eval_max_qps: 0.2,
  },
  winter: {
    pii_action: "mask",
    retention_days: 7,
  },
  degrade_ladder: [
    {
      at_budget_usage_gte: 0.7,
      actions: {
        summer: { rerank_topN_max: 12 },
        fall: { trace_sampling_rate: 0.07 },
      },
    },
    {
      at_budget_usage_gte: 0.85,
      actions: {
        summer: { rerank_default: false, topK_max: 10 },
      },
    },
    {
      at_budget_usage_gte: 0.95,
      actions: {
        summer: { mode_force: "keyword", topK_max: 8 },
        ingest: { enabled: false },
        fall: { trace_sampling_rate: 0.03 },
      },
    },
  ],
};

// ============================================================================
// Conservative Preset (Recommended)
// 목적: 유입+학습 데이터 확보 + 폭주 방지
// 특징: rerank/trace/eval을 "조금은" 유지해서 핵심(디버깅 가능한 검색)을 보여줌
// 월 예산: ~$80
// ============================================================================

export const CONSERVATIVE_POLICY: TenantPolicy = {
  version: 1,
  tenant: "thelabforge",
  mode: "enforce",
  currency: "usd",
  caps: {
    monthly_cost_cents: 8000,
    daily_cost_cents: 400,
    monthly_requests: 120000,
    daily_requests: 5000,
    rpm: 120,
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
  },
  ingest: {
    enabled: true,
    daily_chunk_upserts_max: 25000,
    per_doc_chunk_max: 120,
    per_request_bytes_max: 10485760, // 10MB
    concurrency_max: 2,
  },
  fall: {
    trace_sampling_rate: 0.25,
    trace_store_raw_text: false,
    eval_sampling_rate: 0.05,
    eval_max_qps: 0.5,
  },
  winter: {
    pii_action: "mask",
    retention_days: 14,
  },
  degrade_ladder: [
    {
      at_budget_usage_gte: 0.7,
      actions: {
        answer_contract_sampling_rate: 0,
        fall: { trace_sampling_rate: 0.15, eval_sampling_rate: 0.02 },
        summer: { rerank_topN_max: 24 },
      },
    },
    {
      at_budget_usage_gte: 0.85,
      actions: {
        summer: {
          rerank_default: false,
          topK_max: 16,
          autopilot_budget_ms_max: 600,
        },
      },
    },
    {
      at_budget_usage_gte: 0.95,
      actions: {
        summer: { mode_force: "keyword", topK_max: 10 },
        ingest: { enabled: false },
        fall: { trace_sampling_rate: 0.05, eval_sampling_rate: 0 },
      },
    },
  ],
};

// ============================================================================
// Aggressive Preset
// 목적: 최대한 좋은 UX로 성장 (단, 상한은 존재)
// 특징: rerank/trace/eval 유지, ingest 제한 완화, federated 소스 3개까지
// 월 예산: ~$200
// ============================================================================

export const AGGRESSIVE_POLICY: TenantPolicy = {
  version: 1,
  tenant: "thelabforge",
  mode: "enforce",
  currency: "usd",
  caps: {
    monthly_cost_cents: 20000,
    daily_cost_cents: 900,
    monthly_requests: 300000,
    daily_requests: 15000,
    rpm: 300,
  },
  summer: {
    autopilot_default_budget_ms: 800,
    autopilot_budget_ms_max: 1500,
    topK_default: 24,
    topK_max: 40,
    rerank_default: true,
    rerank_topN_default: 50,
    rerank_topN_max: 90,
    hybrid_default: true,
    answer_contract_default: false,
    answer_contract_max_sampling_rate: 0.1,
    federated_enabled: true,
    federated_max_sources: 3,
    federated_topK_per_source_max: 12,
  },
  ingest: {
    enabled: true,
    daily_chunk_upserts_max: 100000,
    per_doc_chunk_max: 200,
    per_request_bytes_max: 26214400, // 25MB
    concurrency_max: 4,
  },
  fall: {
    trace_sampling_rate: 0.5,
    trace_store_raw_text: false,
    eval_sampling_rate: 0.1,
    eval_max_qps: 1.0,
  },
  winter: {
    pii_action: "mask",
    retention_days: 30,
  },
  degrade_ladder: [
    {
      at_budget_usage_gte: 0.8,
      actions: {
        summer: { rerank_topN_max: 50 },
        fall: { eval_sampling_rate: 0.05 },
      },
    },
    {
      at_budget_usage_gte: 0.9,
      actions: {
        summer: { rerank_default: false, topK_max: 24 },
        fall: { trace_sampling_rate: 0.25 },
      },
    },
    {
      at_budget_usage_gte: 0.97,
      actions: {
        summer: { mode_force: "hybrid", topK_max: 16 },
        ingest: { enabled: false },
      },
    },
  ],
};

// ============================================================================
// Preset Registry
// ============================================================================

export const POLICY_PRESETS: Record<PresetName, PolicyPreset> = {
  ultra_conservative: {
    name: "ultra_conservative",
    displayName: "Ultra Conservative",
    description: "무료 런칭/테스트용. 비용 최소화 우선",
    monthlyCostUsd: 30,
    policy: ULTRA_CONSERVATIVE_POLICY,
  },
  conservative: {
    name: "conservative",
    displayName: "Conservative (Recommended)",
    description: "유입+학습 데이터 확보와 폭주 방지의 균형",
    monthlyCostUsd: 80,
    policy: CONSERVATIVE_POLICY,
  },
  aggressive: {
    name: "aggressive",
    displayName: "Aggressive",
    description: "최대 UX로 성장 추구. 비용 상한만 설정",
    monthlyCostUsd: 200,
    policy: AGGRESSIVE_POLICY,
  },
};

/**
 * 프리셋 이름으로 정책 가져오기
 */
export function getPreset(name: PresetName): PolicyPreset {
  return POLICY_PRESETS[name];
}

/**
 * 프리셋 목록 가져오기
 */
export function listPresets(): PolicyPreset[] {
  return Object.values(POLICY_PRESETS);
}

/**
 * 기본 프리셋 가져오기 (Conservative 추천)
 */
export function getDefaultPreset(): PolicyPreset {
  return POLICY_PRESETS.conservative;
}

/**
 * 테넌트용 정책 생성 (프리셋 기반)
 */
export function createTenantPolicy(
  tenantId: string,
  presetName: PresetName = "conservative"
): TenantPolicy {
  const preset = getPreset(presetName);
  return {
    ...preset.policy,
    tenant: tenantId,
  };
}
