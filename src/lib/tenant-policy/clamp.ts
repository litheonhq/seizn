/**
 * Summer Parameter Clamping
 *
 * 요청 파라미터가 정책의 max 값을 넘지 못하게 클램핑
 * - 사용자가 어떤 override를 가져와도 policy의 max를 넘지 못함
 * - 기본값 적용 (요청에 값이 없을 때)
 */

import type {
  TenantPolicy,
  SummerRequestParams,
  ClampedParams,
} from "./types";

// ============================================================================
// Core Clamping
// ============================================================================

/**
 * Summer 요청 파라미터 클램핑
 *
 * 정책의 max 값을 넘지 못하게 제한하고,
 * 값이 없는 필드는 기본값으로 채움
 */
export function clampSummerParams(
  policy: TenantPolicy,
  requestBody: SummerRequestParams
): ClampedParams {
  const clamped: string[] = [];
  const summer = policy.summer;

  // topK 클램핑
  let topK = requestBody.top_k ?? summer.topK_default;
  if (topK > summer.topK_max) {
    topK = summer.topK_max;
    clamped.push("top_k");
  }

  // autopilot budget_ms 클램핑
  let budgetMs =
    requestBody.autopilot?.budget_ms ?? summer.autopilot_default_budget_ms;
  if (budgetMs > summer.autopilot_budget_ms_max) {
    budgetMs = summer.autopilot_budget_ms_max;
    clamped.push("autopilot.budget_ms");
  }

  // rerank 처리
  let rerank = requestBody.rerank ?? summer.rerank_default;
  // mode_force가 keyword면 rerank 강제 비활성화
  if (summer.mode_force === "keyword") {
    rerank = false;
    if (requestBody.rerank === true) {
      clamped.push("rerank");
    }
  }

  // rerank_top_n 클램핑
  let rerankTopN = requestBody.rerank_top_n ?? summer.rerank_topN_default;
  if (rerankTopN > summer.rerank_topN_max) {
    rerankTopN = summer.rerank_topN_max;
    clamped.push("rerank_top_n");
  }

  // hybrid 처리
  let hybrid = requestBody.hybrid ?? summer.hybrid_default;
  // mode_force가 keyword면 hybrid 강제 비활성화
  if (summer.mode_force === "keyword") {
    hybrid = false;
    if (requestBody.hybrid === true) {
      clamped.push("hybrid");
    }
  }
  // mode_force가 hybrid면 hybrid 강제 활성화
  if (summer.mode_force === "hybrid") {
    hybrid = true;
  }

  // answer_contract 처리
  let answerContract = requestBody.answer_contract ?? summer.answer_contract_default;
  // 샘플링 비율이 0이면 강제 비활성화
  if (summer.answer_contract_max_sampling_rate <= 0) {
    answerContract = false;
    if (requestBody.answer_contract === true) {
      clamped.push("answer_contract");
    }
  }

  // federated 처리
  let federated = requestBody.federated;
  if (federated?.enabled && !summer.federated_enabled) {
    federated = { ...federated, enabled: false };
    clamped.push("federated.enabled");
  }

  if (federated?.enabled) {
    // sources 수 제한
    if (
      federated.sources &&
      federated.sources.length > summer.federated_max_sources
    ) {
      federated = {
        ...federated,
        sources: federated.sources.slice(0, summer.federated_max_sources),
      };
      clamped.push("federated.sources");
    }

    // top_k_per_source 제한
    if (
      federated.top_k_per_source &&
      federated.top_k_per_source > summer.federated_topK_per_source_max
    ) {
      federated = {
        ...federated,
        top_k_per_source: summer.federated_topK_per_source_max,
      };
      clamped.push("federated.top_k_per_source");
    }
  }

  return {
    collection_id: requestBody.collection_id,
    query: requestBody.query,
    top_k: topK,
    autopilot: {
      enabled: requestBody.autopilot?.enabled ?? true,
      budget_ms: budgetMs,
    },
    hybrid,
    rerank,
    rerank_top_n: rerankTopN,
    answer_contract: answerContract,
    federated,
    _clamped: clamped.length > 0,
    _clamped_fields: clamped,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 단일 숫자 값 클램핑
 */
export function clampValue(
  value: number,
  min: number,
  max: number
): { value: number; clamped: boolean } {
  if (value < min) return { value: min, clamped: true };
  if (value > max) return { value: max, clamped: true };
  return { value, clamped: false };
}

/**
 * 클램핑 결과를 HTTP 헤더로 변환
 */
export function getClampedHeaders(result: ClampedParams): Record<string, string> {
  const headers: Record<string, string> = {};

  if (result._clamped) {
    headers["X-Seizn-Params-Clamped"] = "true";
    headers["X-Seizn-Clamped-Fields"] = result._clamped_fields.join(",");
  }

  return headers;
}

/**
 * 클램핑 경고 메시지 생성
 */
export function getClampedWarning(result: ClampedParams): string | null {
  if (!result._clamped) return null;

  const fields = result._clamped_fields;
  if (fields.length === 1) {
    return `Parameter '${fields[0]}' was clamped to policy limits.`;
  }
  return `Parameters ${fields.map((f) => `'${f}'`).join(", ")} were clamped to policy limits.`;
}

// ============================================================================
// Ingest Parameter Clamping
// ============================================================================

export interface IngestRequestParams {
  chunks: unknown[];
  requestBytes: number;
}

export interface ClampedIngestParams extends IngestRequestParams {
  _clamped: boolean;
  _clamped_fields: string[];
  _rejected_chunks: number;
}

/**
 * Ingest 요청 파라미터 클램핑
 */
export function clampIngestParams(
  policy: TenantPolicy,
  requestBody: IngestRequestParams
): ClampedIngestParams {
  const clamped: string[] = [];
  const ingest = policy.ingest;

  // 청크 수 제한
  let chunks = requestBody.chunks;
  let rejectedChunks = 0;

  if (chunks.length > ingest.per_doc_chunk_max) {
    rejectedChunks = chunks.length - ingest.per_doc_chunk_max;
    chunks = chunks.slice(0, ingest.per_doc_chunk_max);
    clamped.push("chunks");
  }

  // 바이트 크기 체크 (클램핑은 불가, 거부만)
  if (requestBody.requestBytes > ingest.per_request_bytes_max) {
    clamped.push("requestBytes");
  }

  return {
    chunks,
    requestBytes: requestBody.requestBytes,
    _clamped: clamped.length > 0,
    _clamped_fields: clamped,
    _rejected_chunks: rejectedChunks,
  };
}

// ============================================================================
// Fall Parameter Clamping
// ============================================================================

export interface FallRequestParams {
  traceSamplingRate?: number;
  evalSamplingRate?: number;
  storeRawText?: boolean;
}

export interface ClampedFallParams extends FallRequestParams {
  _clamped: boolean;
  _clamped_fields: string[];
}

/**
 * Fall (Trace/Eval) 요청 파라미터 클램핑
 */
export function clampFallParams(
  policy: TenantPolicy,
  requestBody: FallRequestParams
): ClampedFallParams {
  const clamped: string[] = [];
  const fall = policy.fall;

  // trace sampling rate
  let traceSamplingRate = requestBody.traceSamplingRate ?? fall.trace_sampling_rate;
  if (traceSamplingRate > fall.trace_sampling_rate) {
    traceSamplingRate = fall.trace_sampling_rate;
    clamped.push("traceSamplingRate");
  }

  // eval sampling rate
  let evalSamplingRate = requestBody.evalSamplingRate ?? fall.eval_sampling_rate;
  if (evalSamplingRate > fall.eval_sampling_rate) {
    evalSamplingRate = fall.eval_sampling_rate;
    clamped.push("evalSamplingRate");
  }

  // raw text storage
  let storeRawText = requestBody.storeRawText ?? fall.trace_store_raw_text;
  if (storeRawText && !fall.trace_store_raw_text) {
    storeRawText = false;
    clamped.push("storeRawText");
  }

  return {
    traceSamplingRate,
    evalSamplingRate,
    storeRawText,
    _clamped: clamped.length > 0,
    _clamped_fields: clamped,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * 요청이 정책 범위 내인지 검증 (클램핑 없이)
 */
export function validateSummerParams(
  policy: TenantPolicy,
  requestBody: SummerRequestParams
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const summer = policy.summer;

  if (requestBody.top_k && requestBody.top_k > summer.topK_max) {
    violations.push(`top_k exceeds max (${summer.topK_max})`);
  }

  if (
    requestBody.autopilot?.budget_ms &&
    requestBody.autopilot.budget_ms > summer.autopilot_budget_ms_max
  ) {
    violations.push(`budget_ms exceeds max (${summer.autopilot_budget_ms_max})`);
  }

  if (
    requestBody.rerank_top_n &&
    requestBody.rerank_top_n > summer.rerank_topN_max
  ) {
    violations.push(`rerank_top_n exceeds max (${summer.rerank_topN_max})`);
  }

  if (requestBody.rerank && summer.mode_force === "keyword") {
    violations.push("rerank not allowed in keyword-only mode");
  }

  if (requestBody.answer_contract && summer.answer_contract_max_sampling_rate <= 0) {
    violations.push("answer_contract not available");
  }

  if (requestBody.federated?.enabled && !summer.federated_enabled) {
    violations.push("federated search not enabled");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
