/**
 * Gateway Tool API Endpoint
 *
 * POST /api/gateway/tool
 *
 * Routes tool/function calling requests through the AI Gateway with:
 * - Multi-provider tool calling support
 * - High-risk tool review workflows
 * - Cost tracking and audit logging
 * - Tool gating based on policies
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getGateway } from "@/lib/ai-gateway";
import type { GatewayRequest, ChatMessage } from "@/lib/ai-gateway/types";

// Tool definition schema
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  risk_level?: "low" | "medium" | "high" | "critical";
}

interface ToolRequest {
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  metadata?: Record<string, unknown>;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// High-risk tools that require review
const HIGH_RISK_TOOLS = [
  "execute_code",
  "delete_file",
  "delete_data",
  "send_email",
  "transfer_money",
  "modify_database",
  "deploy_application",
  "revoke_access",
];

/**
 * POST /api/gateway/tool
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Authenticate
    const session = await auth();
    const userId = session?.user?.id;

    // Parse request
    const body: ToolRequest = await request.json();
    const { model, messages, tools, tool_choice, temperature, max_tokens, metadata } = body;

    // Validate required fields
    if (!model || !messages || !tools || !Array.isArray(tools)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "model, messages, and tools are required",
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    // Get org context
    const apiKey = request.headers.get("x-api-key");
    let orgId: string | null = null;

    if (apiKey) {
      const supabase = createServerClient();
      const { data: keyData } = await supabase
        .from("api_keys")
        .select("org_id, scopes")
        .eq("key_hash", hashApiKey(apiKey))
        .eq("is_active", true)
        .single();

      if (!keyData) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
          { status: 401 }
        );
      }

      if (!keyData.scopes?.includes("gateway:tool") && !keyData.scopes?.includes("gateway:*")) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "API key lacks gateway:tool scope" } },
          { status: 403 }
        );
      }

      orgId = keyData.org_id;
    } else if (userId) {
      const supabase = createServerClient();
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      orgId = membership?.org_id || null;
    }

    // Check tool gating policies
    if (orgId) {
      const gatingResult = await checkToolGating(orgId, tools);
      if (!gatingResult.allowed) {
        return NextResponse.json(
          {
            error: {
              code: "TOOL_BLOCKED",
              message: gatingResult.reason || "Tool not allowed by policy",
              blocked_tools: gatingResult.blockedTools,
            },
            request_id: requestId,
          },
          { status: 403 }
        );
      }
    }

    // Build gateway request with tools
    const gatewayRequest: GatewayRequest = {
      id: requestId,
      model,
      messages,
      temperature: temperature ?? 0.7,
      maxTokens: max_tokens ?? 4096,
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      toolChoice: tool_choice,
      metadata: {
        ...metadata,
        org_id: orgId,
        user_id: userId,
        source: "gateway_api",
      },
    };

    // Execute through gateway
    const gateway = getGateway();
    const response = await gateway.chat(gatewayRequest);

    // Extract tool calls from response
    const toolCalls = extractToolCalls(response.content);

    // Check if any high-risk tools need review
    if (orgId && toolCalls.length > 0) {
      const highRiskCalls = toolCalls.filter((tc) =>
        HIGH_RISK_TOOLS.includes(tc.function.name) ||
        tools.find((t) => t.name === tc.function.name)?.risk_level === "high" ||
        tools.find((t) => t.name === tc.function.name)?.risk_level === "critical"
      );

      if (highRiskCalls.length > 0) {
        // Check if review is required
        const reviewResult = await checkReviewWorkflow(orgId, highRiskCalls);

        if (reviewResult.requiresReview) {
          // Create review request
          const reviewRequestId = await createReviewRequest(
            orgId,
            requestId,
            highRiskCalls,
            messages,
            reviewResult.workflowId
          );

          return NextResponse.json(
            {
              id: response.id,
              request_id: requestId,
              status: "pending_review",
              review_request_id: reviewRequestId,
              message: "High-risk tool calls require approval",
              tool_calls: highRiskCalls.map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                risk_level: tools.find((t) => t.name === tc.function.name)?.risk_level || "high",
              })),
              latency_ms: Date.now() - startTime,
            },
            {
              status: 202,
              headers: {
                "X-Request-Id": requestId,
                "X-Review-Required": "true",
                "X-Review-Request-Id": reviewRequestId,
              },
            }
          );
        }
      }
    }

    // Record cost
    if (orgId) {
      await recordToolCost(
        orgId,
        userId || null,
        requestId,
        response.provider,
        response.model,
        response.usage.promptTokens,
        response.usage.completionTokens,
        response.latencyMs,
        toolCalls.length
      );
    }

    // Audit log tool calls
    if (orgId && toolCalls.length > 0) {
      await auditToolCalls(orgId, userId || null, requestId, toolCalls);
    }

    // Return response
    return NextResponse.json(
      {
        id: response.id,
        request_id: requestId,
        model: response.model,
        provider: response.provider,
        content: response.content,
        tool_calls: toolCalls,
        finish_reason: response.finishReason,
        usage: {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
        },
        latency_ms: response.latencyMs,
        cost_usd: response.cost,
      },
      {
        headers: {
          "X-Request-Id": requestId,
          "X-Provider": response.provider,
          "X-Latency-Ms": String(response.latencyMs),
          "X-Tool-Calls": String(toolCalls.length),
        },
      }
    );
  } catch (error) {
    console.error("[Gateway Tool Error]", { requestId, error });

    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        error: {
          code: "GATEWAY_ERROR",
          message: errorMessage,
        },
        request_id: requestId,
        latency_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

/**
 * Check tool gating policies
 */
async function checkToolGating(
  orgId: string,
  tools: ToolDefinition[]
): Promise<{ allowed: boolean; reason?: string; blockedTools?: string[] }> {
  try {
    const supabase = createServerClient();

    // Get tool gating config for org
    const { data: config } = await supabase
      .from("tool_gating_configs")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .single();

    if (!config) {
      return { allowed: true }; // No gating config = allow all
    }

    const blockedTools: string[] = [];
    const toolNames = tools.map((t) => t.name);

    // Check allowlist (if exists, only these tools are allowed)
    if (config.allowlist && Array.isArray(config.allowlist) && config.allowlist.length > 0) {
      for (const toolName of toolNames) {
        if (!config.allowlist.includes(toolName)) {
          blockedTools.push(toolName);
        }
      }
    }

    // Check blocklist
    if (config.blocklist && Array.isArray(config.blocklist)) {
      for (const toolName of toolNames) {
        if (config.blocklist.includes(toolName) && !blockedTools.includes(toolName)) {
          blockedTools.push(toolName);
        }
      }
    }

    if (blockedTools.length > 0) {
      return {
        allowed: false,
        reason: `Tools blocked by policy: ${blockedTools.join(", ")}`,
        blockedTools,
      };
    }

    return { allowed: true };
  } catch {
    return { allowed: true }; // Fail open
  }
}

/**
 * Check if review workflow applies
 */
async function checkReviewWorkflow(
  orgId: string,
  toolCalls: ToolCall[]
): Promise<{ requiresReview: boolean; workflowId?: string }> {
  try {
    const supabase = createServerClient();

    const toolNames = toolCalls.map((tc) => tc.function.name);

    // Find matching review workflow
    const { data: workflows } = await supabase
      .from("review_workflows")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("trigger_type", "tool_call")
      .order("priority", { ascending: false });

    if (!workflows || workflows.length === 0) {
      return { requiresReview: false };
    }

    for (const workflow of workflows) {
      const conditions = workflow.trigger_conditions as Record<string, unknown>;

      // Check if any tool matches the workflow
      if (conditions.tool_names && Array.isArray(conditions.tool_names)) {
        const matchingTools = toolNames.filter((name) =>
          (conditions.tool_names as string[]).includes(name)
        );
        if (matchingTools.length > 0) {
          return { requiresReview: true, workflowId: workflow.id };
        }
      }

      // Check risk level trigger
      if (conditions.risk_level && Array.isArray(conditions.risk_level)) {
        const hasHighRisk = toolNames.some((name) => HIGH_RISK_TOOLS.includes(name));
        if (hasHighRisk && conditions.risk_level.includes("high")) {
          return { requiresReview: true, workflowId: workflow.id };
        }
      }
    }

    return { requiresReview: false };
  } catch {
    return { requiresReview: false };
  }
}

/**
 * Create review request for high-risk tool calls
 */
async function createReviewRequest(
  orgId: string,
  requestId: string,
  toolCalls: ToolCall[],
  messages: ChatMessage[],
  workflowId?: string
): Promise<string> {
  const supabase = createServerClient();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

  const { data, error } = await supabase
    .from("review_requests")
    .insert({
      workflow_id: workflowId,
      org_id: orgId,
      request_type: "tool_call",
      source_type: "tool_call",
      source_id: requestId,
      content: {
        tool_calls: toolCalls,
        messages: messages.slice(-5), // Last 5 messages for context
      },
      context: {
        request_id: requestId,
        total_tools: toolCalls.length,
      },
      risk_level: "high",
      risk_factors: toolCalls.map((tc) => ({
        tool: tc.function.name,
        is_high_risk: HIGH_RISK_TOOLS.includes(tc.function.name),
      })),
      status: "pending",
      expires_at: expiresAt.toISOString(),
      auto_action: "reject", // Auto-reject if not reviewed
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create review request: ${error.message}`);
  }

  return data.id;
}

/**
 * Extract tool calls from response content
 */
function extractToolCalls(content: string): ToolCall[] {
  // Try to parse as JSON first (for structured responses)
  try {
    const parsed = JSON.parse(content);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls;
    }
  } catch {
    // Not JSON, try to extract from text
  }

  // Look for tool call patterns in text
  const toolCalls: ToolCall[] = [];
  const toolCallPattern = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

  let match;
  while ((match = toolCallPattern.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      toolCalls.push({
        id: parsed.id || crypto.randomUUID(),
        type: "function",
        function: {
          name: parsed.name || parsed.function?.name,
          arguments: JSON.stringify(parsed.arguments || parsed.function?.arguments || {}),
        },
      });
    } catch {
      // Invalid JSON in tool call
    }
  }

  return toolCalls;
}

/**
 * Record tool usage cost
 */
async function recordToolCost(
  orgId: string,
  userId: string | null,
  requestId: string,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  toolCallCount: number
): Promise<void> {
  try {
    const supabase = createServerClient();

    await supabase.rpc("record_gateway_cost", {
      p_org_id: orgId,
      p_user_id: userId,
      p_route_id: null,
      p_request_id: requestId,
      p_provider: provider,
      p_model: model,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
      p_prompt_cost_microcents: 0, // Will be calculated based on model
      p_completion_cost_microcents: 0,
      p_latency_ms: latencyMs,
      p_endpoint: "/tool",
      p_status_code: 200,
      p_is_cached: false,
      p_is_streaming: false,
      p_error_type: null,
      p_error_message: null,
      p_metadata: { tool_call_count: toolCallCount },
    });
  } catch (error) {
    console.error("Failed to record tool cost:", error);
  }
}

/**
 * Audit log tool calls
 */
async function auditToolCalls(
  orgId: string,
  userId: string | null,
  requestId: string,
  toolCalls: ToolCall[]
): Promise<void> {
  try {
    const supabase = createServerClient();

    const auditEntries = toolCalls.map((tc) => ({
      org_id: orgId,
      user_id: userId,
      action: "tool_call",
      resource_type: "gateway",
      resource_id: requestId,
      details: {
        tool_name: tc.function.name,
        tool_call_id: tc.id,
        arguments_hash: hashApiKey(tc.function.arguments), // Don't store raw arguments
        is_high_risk: HIGH_RISK_TOOLS.includes(tc.function.name),
      },
    }));

    await supabase.from("audit_logs").insert(auditEntries);
  } catch (error) {
    console.error("Failed to audit tool calls:", error);
  }
}

/**
 * Hash API key
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * GET /api/gateway/tool - Get tool endpoint info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/gateway/tool",
    method: "POST",
    description: "AI Gateway Tool/Function Calling API",
    features: [
      "multi_provider_tools",
      "tool_gating",
      "high_risk_review",
      "cost_tracking",
      "audit_logging",
    ],
    high_risk_tools: HIGH_RISK_TOOLS,
    documentation: "https://docs.seizn.com/gateway/tool",
  });
}
