/**
 * Tenant Policy Enforcement API
 *
 * POST /api/tenant-policy/enforce - Check if request should be allowed
 *
 * This endpoint is called before processing Summer/Ingest/Fall requests
 * to check rate limits, cost caps, and apply degrade ladder.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  getTenantPolicy,
  getTenantBudgetState,
  enforceCaps,
  clampSummerParams,
  toHttpResponse,
  estimateSummerCost,
  type RequestMeta,
  type SummerRequestParams,
} from "@/lib/tenant-policy";
import { logServerError } from "@/lib/server/logger";

export function verifyInternalKey(request: NextRequest): boolean {
  const configured = process.env.INTERNAL_API_KEY;
  if (!configured) {
    // Fail-closed in all environments; this endpoint is internal-only.
    logServerError("[TenantPolicy Enforce] INTERNAL_API_KEY not configured");
    return false;
  }

  const provided = request.headers.get("x-internal-key");
  if (!provided) return false;

  try {
    const encoder = new TextEncoder();
    const a = encoder.encode(provided);
    const b = encoder.encode(configured);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * POST /api/tenant-policy/enforce
 * Check policy enforcement for a request
 *
 * Request body:
 * {
 *   tenant_id: string,
 *   request_type: "summer" | "ingest" | "fall" | "winter",
 *   summer_params?: SummerRequestParams,  // For summer requests
 *   estimated_cost_cents?: number,        // Optional cost override
 *   request_bytes?: number,               // For ingest
 *   chunk_count?: number,                 // For ingest
 *   day_chunk_upserts?: number,           // Current daily chunk upserts (optional override)
 * }
 *
 * Response:
 * {
 *   allowed: boolean,
 *   action: "allow" | "deny" | "degrade",
 *   effective_policy: TenantPolicy,
 *   clamped_params?: ClampedParams,       // For summer requests
 *   headers: Record<string, string>,      // Headers to add to response
 *   error?: { status, code, message },    // If denied
 * }
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyInternalKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      tenant_id,
      request_type,
      summer_params,
      estimated_cost_cents,
      request_bytes,
      chunk_count,
      day_chunk_upserts,
    } = body;

    if (!tenant_id) {
      return NextResponse.json(
        { error: "tenant_id is required" },
        { status: 400 }
      );
    }

    if (!request_type) {
      return NextResponse.json(
        { error: "request_type is required" },
        { status: 400 }
      );
    }

    // Load policy
    const policy = await getTenantPolicy(tenant_id);

    // Get budget state
    const budgetState = await getTenantBudgetState(policy, tenant_id);
    const effectiveBudgetState =
      typeof day_chunk_upserts === "number" && Number.isFinite(day_chunk_upserts)
        ? {
            ...budgetState,
            dayChunkUpserts: Math.max(0, Math.floor(day_chunk_upserts)),
          }
        : budgetState;

    // Estimate cost for summer requests if not provided
    let costEstimate = estimated_cost_cents;
    if (request_type === "summer" && !costEstimate && summer_params) {
      costEstimate = estimateSummerCost(policy, {
        topK: summer_params.top_k,
        rerank: summer_params.rerank,
        rerankTopN: summer_params.rerank_top_n,
        answerContract: summer_params.answer_contract,
        federated: summer_params.federated?.enabled,
        federatedSources: summer_params.federated?.sources?.length,
      });
    }

    // Build request meta
    const requestMeta: RequestMeta = {
      type: request_type,
      estimatedCostCents: costEstimate,
      requestBytes: request_bytes,
      chunkCount: chunk_count,
    };

    // Enforce policy
    const result = enforceCaps(policy, effectiveBudgetState, requestMeta);

    // Convert to HTTP response format
    const httpResponse = toHttpResponse(result);

    // Build response
    const response: Record<string, unknown> = {
      allowed: result.action !== "deny",
      action: result.action,
      effective_policy: result.effectivePolicy,
      budget_state: result.budgetState,
      degrade_level: result.degradeLevel,
      headers: httpResponse.headers,
    };

    // Clamp summer params if allowed
    if (result.action !== "deny" && request_type === "summer" && summer_params) {
      const clampedParams = clampSummerParams(
        result.effectivePolicy,
        summer_params as SummerRequestParams
      );
      response.clamped_params = clampedParams;

      // Add clamped headers
      if (clampedParams._clamped) {
        response.headers = {
          ...response.headers as Record<string, string>,
          "X-Seizn-Params-Clamped": "true",
          "X-Seizn-Clamped-Fields": clampedParams._clamped_fields.join(","),
        };
      }
    }

    // Add error info if denied
    if (result.action === "deny") {
      response.error = {
        status: httpResponse.status,
        code: result.reason,
        message: httpResponse.body.error,
        retry_after: result.retryAfter,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    logServerError("[TenantPolicy Enforce] POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tenant-policy/enforce
 * Quick rate limit check (lightweight)
 */
export async function GET(request: NextRequest) {
  try {
    if (!verifyInternalKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenant_id");
    const minuteRequests = parseInt(searchParams.get("minute_requests") || "0");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id is required" },
        { status: 400 }
      );
    }

    // Load policy
    const policy = await getTenantPolicy(tenantId);

    // Quick check
    const allowed = minuteRequests < policy.caps.rpm;

    return NextResponse.json({
      allowed,
      rpm_limit: policy.caps.rpm,
      current_rpm: minuteRequests,
      remaining: Math.max(0, policy.caps.rpm - minuteRequests),
    });
  } catch (error) {
    logServerError("[TenantPolicy Enforce] GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
