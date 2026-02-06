/**
 * Review Workflows API
 *
 * GET /api/reviews/workflows - List review workflows
 * POST /api/reviews/workflows - Create review workflow
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";
import { parsePagination } from "@/lib/parse-params";

interface CreateWorkflowRequest {
  name: string;
  description?: string;
  trigger_type: "tool_call" | "completion" | "action" | "threshold" | "custom";
  trigger_conditions: Record<string, unknown>;
  workflow_type?: "approval" | "review" | "audit" | "notification";
  require_approval?: boolean;
  auto_approve_after_seconds?: number;
  escalation_chain?: Array<{
    level: number;
    users?: string[];
    roles?: string[];
    timeout_seconds?: number;
  }>;
  notification_channels?: Array<{
    type: "email" | "slack" | "webhook";
    recipients?: string[];
    webhook?: string;
  }>;
  priority?: number;
  tags?: string[];
}

/**
 * GET /api/reviews/workflows
 */
export async function GET(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;

    // Get user's orgs
    const { data: memberships } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", session.user.id);

    if (!memberships || memberships.length === 0) {
      return successResponse({ workflows: [], total: 0 }, context);
    }

    const orgIds = memberships.map((m) => m.org_id);

    // Build query
    let query = supabase
      .from("review_workflows")
      .select("*", { count: "exact" })
      .in("org_id", orgIds)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    // Filter by org
    const orgId = searchParams.get("org_id");
    if (orgId && orgIds.includes(orgId)) {
      query = query.eq("org_id", orgId);
    }

    // Filter by trigger type
    const triggerType = searchParams.get("trigger_type");
    if (triggerType) {
      query = query.eq("trigger_type", triggerType);
    }

    // Filter by active status
    const isActive = searchParams.get("is_active");
    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    }

    // Pagination
    const { limit, offset } = parsePagination(searchParams);
    query = query.range(offset, offset + limit - 1);

    const { data: workflows, error, count } = await query;

    if (error) {
      console.error("Failed to fetch workflows:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to fetch workflows", status: 500 },
        context
      );
    }

    return successResponse(
      {
        workflows: workflows || [],
        total: count || 0,
        limit,
        offset,
      },
      context
    );
  } catch (error) {
    console.error("Review workflows API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * POST /api/reviews/workflows
 */
export async function POST(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const body: CreateWorkflowRequest & { org_id: string } = await request.json();

    // Validate required fields
    if (!body.name || !body.org_id || !body.trigger_type || !body.trigger_conditions) {
      return errorResponse(
        {
          code: "SEIZN_200",
          message: "name, org_id, trigger_type, and trigger_conditions are required",
          status: 400,
        },
        context
      );
    }

    const supabase = createServerClient();

    // Verify user is admin of the org
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", body.org_id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return errorResponse(
        { code: "SEIZN_105", message: "Admin access required", status: 403 },
        context
      );
    }

    // Create workflow
    const { data: workflow, error } = await supabase
      .from("review_workflows")
      .insert({
        org_id: body.org_id,
        name: body.name,
        description: body.description,
        trigger_type: body.trigger_type,
        trigger_conditions: body.trigger_conditions,
        workflow_type: body.workflow_type || "approval",
        require_approval: body.require_approval ?? true,
        auto_approve_after_seconds: body.auto_approve_after_seconds,
        escalation_chain: body.escalation_chain || [],
        notification_channels: body.notification_channels || [],
        priority: body.priority || 100,
        tags: body.tags || [],
        is_active: true,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create workflow:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to create workflow", status: 500 },
        context
      );
    }

    return successResponse({ workflow }, context, 201);
  } catch (error) {
    console.error("Review workflows API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
