/**
 * Gateway Chat API Endpoint
 *
 * POST /api/gateway/chat
 *
 * Routes chat completions through the AI Gateway with:
 * - Multi-provider support (OpenAI, Anthropic, Google, Azure, Bedrock)
 * - Load balancing and circuit breaker
 * - Cost tracking and rate limiting
 * - Policy enforcement
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from "@/lib/api-auth";
import { getGateway } from "@/lib/ai-gateway";
import { getPolicyRouter } from "@/lib/ai-gateway/policy-router";
import type { GatewayRequest, ChatMessage } from "@/lib/ai-gateway/types";

// Model pricing (per 1M tokens, in microcents - 1 USD = 100000 microcents)
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  // OpenAI
  "gpt-4o": { prompt: 250, completion: 1000 },
  "gpt-4o-mini": { prompt: 15, completion: 60 },
  "gpt-4-turbo": { prompt: 1000, completion: 3000 },
  "gpt-3.5-turbo": { prompt: 50, completion: 150 },
  "o1": { prompt: 1500, completion: 6000 },
  "o1-mini": { prompt: 300, completion: 1200 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { prompt: 300, completion: 1500 },
  "claude-3-5-haiku-20241022": { prompt: 25, completion: 125 },
  "claude-3-opus-20240229": { prompt: 1500, completion: 7500 },
  // Google
  "gemini-1.5-pro": { prompt: 125, completion: 500 },
  "gemini-1.5-flash": { prompt: 7.5, completion: 30 },
};

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/gateway/chat
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Authenticate (session or API key required)
    const session = await auth();
    const sessionUserId = session?.user?.id ?? null;
    const hasApiKeyHeader = Boolean(
      request.headers.get("x-api-key") || request.headers.get("authorization")
    );

    if (!sessionUserId && !hasApiKeyHeader) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    // Parse request
    const body: ChatRequest = await request.json();
    const { model, messages, temperature, max_tokens, stream: _stream, metadata } = body;

    // Validate required fields
    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "model and messages are required",
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    // Get org context from API key or session
    let resolvedUserId = sessionUserId;
    let orgId: string | null = null;

    if (hasApiKeyHeader) {
      const apiAuth = await authenticateRequest(request, { skipUsageCheck: false });
      if (isAuthError(apiAuth)) {
        return authErrorResponse(apiAuth.authError);
      }

      resolvedUserId = apiAuth.userId;
      const supabase = createServerClient();
      const { data: keyData } = await supabase
        .from("api_keys")
        .select("org_id, scopes")
        .eq("id", apiAuth.keyId)
        .eq("is_active", true)
        .single();

      if (!keyData) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
          { status: 401 }
        );
      }

      // Check scope
      if (!keyData.scopes?.includes("gateway:chat") && !keyData.scopes?.includes("gateway:*")) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "API key lacks gateway:chat scope" } },
          { status: 403 }
        );
      }

      orgId = keyData.org_id;
    } else if (sessionUserId) {
      const supabase = createServerClient();
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", sessionUserId)
        .limit(1)
        .single();

      orgId = membership?.org_id || null;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: { code: "TENANT_REQUIRED", message: "Organization context required" } },
        { status: 403 }
      );
    }

    // Check rate limits
    if (orgId) {
      const rateLimitResult = await checkRateLimit(orgId, resolvedUserId || "anonymous", model);
      if (!rateLimitResult.allowed) {
        const retryAfterSeconds = rateLimitResult.retryAfter
          ? Math.max(1, Math.ceil((rateLimitResult.retryAfter.getTime() - Date.now()) / 1000))
          : 60;
        return NextResponse.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Rate limit exceeded",
              retry_after: rateLimitResult.retryAfter,
            },
            request_id: requestId,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSeconds),
              "X-RateLimit-Remaining": String(rateLimitResult.remaining || 0),
            },
          }
        );
      }
    }

    // Check legacy gateway policies (model allowlist/blocklist)
    if (orgId) {
      const policyResult = await checkPolicies(orgId, model, messages);
      if (!policyResult.allowed) {
        return NextResponse.json(
          {
            error: {
              code: "POLICY_VIOLATION",
              message: policyResult.reason || "Request blocked by policy",
            },
            request_id: requestId,
          },
          { status: 403 }
        );
      }
    }

    // Evaluate OPA policies via PolicyRouter (budget, content, cost optimization)
    // Fallback mode is configurable; sensitive tool calls can fail closed.
    const policyRouter = getPolicyRouter();
    let gatewayRequest: GatewayRequest = {
      id: requestId,
      model,
      messages,
      temperature: temperature ?? 0.7,
      maxTokens: max_tokens ?? 4096,
      metadata: {
        ...metadata,
        org_id: orgId,
        user_id: resolvedUserId,
        source: "gateway_api",
      },
    };

    const policyDecision = await policyRouter.evaluateRequest(
      gatewayRequest,
      resolvedUserId || "anonymous",
      orgId || undefined
    );

    if (!policyDecision.allowed) {
      const statusCode = policyDecision.policyId === "budget_enforcement" ? 429 : 403;
      return NextResponse.json(
        {
          error: {
            code: policyDecision.policyId === "budget_enforcement"
              ? "BUDGET_EXCEEDED"
              : "POLICY_VIOLATION",
            message: policyDecision.reason || "Request blocked by policy",
            budget_remaining: policyDecision.budgetRemaining,
            policy_id: policyDecision.policyId,
          },
          request_id: requestId,
        },
        { status: statusCode }
      );
    }

    // Apply any policy modifications (token caps, provider overrides, etc.)
    if (policyDecision.modifications) {
      gatewayRequest = policyRouter.applyModifications(gatewayRequest, policyDecision);
      gatewayRequest.metadata = {
        ...gatewayRequest.metadata,
        policy_modified: true,
        budget_remaining: policyDecision.budgetRemaining,
      };
    }

    // Execute through gateway
    const gateway = getGateway();
    const response = await gateway.chat(gatewayRequest);

    // Record cost
    if (orgId) {
      await recordCost(
        orgId,
        resolvedUserId || null,
        requestId,
        response.provider,
        response.model,
        response.usage.promptTokens,
        response.usage.completionTokens,
        response.latencyMs,
        "/chat",
        200,
        response.cached
      );
    }

    // Return response
    return NextResponse.json(
      {
        id: response.id,
        request_id: requestId,
        model: response.model,
        provider: response.provider,
        content: response.content,
        finish_reason: response.finishReason,
        usage: {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
        },
        latency_ms: response.latencyMs,
        cost_usd: response.cost,
        cached: response.cached,
      },
      {
        headers: {
          "X-Request-Id": requestId,
          "X-Provider": response.provider,
          "X-Latency-Ms": String(response.latencyMs),
        },
      }
    );
  } catch (error) {
    console.error("[Gateway Chat Error]", { requestId, error });

    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const isRetryable =
      error instanceof Error && "retryable" in error ? (error as { retryable: boolean }).retryable : true;

    return NextResponse.json(
      {
        error: {
          code: "GATEWAY_ERROR",
          message: errorMessage,
          retryable: isRetryable,
        },
        request_id: requestId,
        latency_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

/**
 * Check rate limits
 */
async function checkRateLimit(
  orgId: string,
  userId: string,
  _model: string
): Promise<{ allowed: boolean; remaining?: number; retryAfter?: Date }> {
  try {
    const supabase = createServerClient();

    // Call the rate limit function
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: `${orgId}:${userId}:chat`,
      p_window_seconds: 60,
      p_max_requests: 100,
      p_max_tokens: null,
      p_token_increment: 0,
    });

    if (error) {
      console.error("Rate limit check error:", error);
      return { allowed: false }; // Fail closed
    }

    return {
      allowed: data?.allowed ?? true,
      remaining: data?.max_requests - data?.current_requests,
      retryAfter: data?.retry_after ? new Date(data.retry_after) : undefined,
    };
  } catch {
    return { allowed: false }; // Fail closed
  }
}

/**
 * Check gateway policies
 */
async function checkPolicies(
  orgId: string,
  model: string,
  _messages: ChatMessage[]
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const supabase = createServerClient();

    // Get active policies for the org
    const { data: policies } = await supabase
      .from("gateway_policies")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (!policies || policies.length === 0) {
      return { allowed: true };
    }

    // Evaluate policies
    for (const policy of policies) {
      const conditions = policy.conditions as Record<string, unknown>;
      const actions = policy.actions as Record<string, unknown>;

      // Check model allowlist
      if (conditions.model_allowlist && Array.isArray(conditions.model_allowlist)) {
        if (!conditions.model_allowlist.includes(model)) {
          if (policy.policy_type === "deny") {
            return { allowed: false, reason: `Model ${model} not in allowlist` };
          }
        }
      }

      // Check model blocklist
      if (conditions.model_blocklist && Array.isArray(conditions.model_blocklist)) {
        if (conditions.model_blocklist.includes(model)) {
          return { allowed: false, reason: `Model ${model} is blocked` };
        }
      }

      // If deny policy matches, block
      if (policy.policy_type === "deny" && actions.allow === false) {
        return { allowed: false, reason: policy.description || "Blocked by policy" };
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: false }; // Fail closed
  }
}

/**
 * Record cost to ledger
 */
async function recordCost(
  orgId: string,
  userId: string | null,
  requestId: string,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  endpoint: string,
  statusCode: number,
  isCached: boolean
): Promise<void> {
  try {
    const supabase = createServerClient();

    // Get pricing
    const pricing = MODEL_PRICING[model] || { prompt: 100, completion: 300 };

    const billablePromptTokens = isCached ? 0 : promptTokens;
    const billableCompletionTokens = isCached ? 0 : completionTokens;

    // Calculate costs in microcents (per 1M tokens)
    const promptCost = Math.round((billablePromptTokens / 1000000) * pricing.prompt * 100000);
    const completionCost = Math.round((billableCompletionTokens / 1000000) * pricing.completion * 100000);

    await supabase.rpc("record_gateway_cost", {
      p_org_id: orgId,
      p_user_id: userId,
      p_route_id: null,
      p_request_id: requestId,
      p_provider: provider,
      p_model: model,
      p_prompt_tokens: billablePromptTokens,
      p_completion_tokens: billableCompletionTokens,
      p_prompt_cost_microcents: promptCost,
      p_completion_cost_microcents: completionCost,
      p_latency_ms: latencyMs,
      p_endpoint: endpoint,
      p_status_code: statusCode,
      p_is_cached: isCached,
      p_is_streaming: false,
      p_error_type: null,
      p_error_message: null,
      p_metadata: {
        original_prompt_tokens: promptTokens,
        original_completion_tokens: completionTokens,
      },
    });
  } catch (error) {
    console.error("Failed to record cost:", error);
    // Don't fail the request if cost recording fails
  }
}

/**
 * GET /api/gateway/chat - Get chat endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/gateway/chat",
    method: "POST",
    description: "AI Gateway Chat Completions API",
    supported_models: Object.keys(MODEL_PRICING),
    features: ["load_balancing", "circuit_breaker", "cost_tracking", "rate_limiting", "policy_enforcement"],
    documentation: "https://docs.seizn.com/gateway/chat",
  });
}
