/**
 * Single Review Request API
 *
 * GET /api/reviews/requests/[id] - Get request details
 * PATCH /api/reviews/requests/[id] - Submit decision (approve/reject/modify)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

interface DecisionRequest {
  decision: "approve" | "reject" | "modify";
  reason?: string;
  modified_content?: Record<string, unknown>;
}

/**
 * GET /api/reviews/requests/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = createRequestContext(request);
  const { id } = await params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const supabase = createServerClient();

    // Get request with workflow info
    const { data: reviewRequest, error } = await supabase
      .from("review_requests")
      .select(`
        *,
        review_workflows (
          id,
          name,
          description,
          workflow_type,
          escalation_chain
        )
      `)
      .eq("id", id)
      .single();

    if (error || !reviewRequest) {
      return errorResponse(
        { code: "SEIZN_404", message: "Request not found", status: 404 },
        context
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", reviewRequest.org_id)
      .single();

    const canAccess =
      membership?.role &&
      ["owner", "admin"].includes(membership.role) ||
      reviewRequest.assigned_to === session.user.id;

    if (!canAccess) {
      return errorResponse(
        { code: "SEIZN_105", message: "Access denied", status: 403 },
        context
      );
    }

    // Get decision history (if any previous decisions/escalations)
    const { data: history } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("resource_type", "review_request")
      .eq("resource_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    return successResponse(
      {
        request: reviewRequest,
        history: history || [],
        can_decide: reviewRequest.status === "pending",
      },
      context
    );
  } catch (error) {
    console.error("Review request API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * PATCH /api/reviews/requests/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = createRequestContext(request);
  const { id } = await params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const body: DecisionRequest = await request.json();

    // Validate decision
    if (!body.decision || !["approve", "reject", "modify"].includes(body.decision)) {
      return errorResponse(
        { code: "SEIZN_200", message: "Valid decision (approve/reject/modify) is required", status: 400 },
        context
      );
    }

    if (body.decision === "modify" && !body.modified_content) {
      return errorResponse(
        { code: "SEIZN_200", message: "modified_content is required for modify decision", status: 400 },
        context
      );
    }

    const supabase = createServerClient();

    // Get current request
    const { data: reviewRequest } = await supabase
      .from("review_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (!reviewRequest) {
      return errorResponse(
        { code: "SEIZN_404", message: "Request not found", status: 404 },
        context
      );
    }

    // Check if already decided
    if (reviewRequest.status !== "pending") {
      return errorResponse(
        {
          code: "SEIZN_209",
          message: `Request already ${reviewRequest.status}`,
          status: 409,
        },
        context
      );
    }

    // Verify user can make decision
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", reviewRequest.org_id)
      .single();

    const canDecide =
      (membership?.role && ["owner", "admin"].includes(membership.role)) ||
      reviewRequest.assigned_to === session.user.id;

    if (!canDecide) {
      return errorResponse(
        { code: "SEIZN_105", message: "Not authorized to decide", status: 403 },
        context
      );
    }

    // Determine new status
    const newStatus =
      body.decision === "approve"
        ? "approved"
        : body.decision === "reject"
          ? "rejected"
          : "approved"; // 'modify' = approved with changes

    // Update request
    const { data: updated, error } = await supabase
      .from("review_requests")
      .update({
        status: newStatus,
        decision: body.decision,
        decision_by: session.user.id,
        decision_at: new Date().toISOString(),
        decision_reason: body.reason,
        modified_content: body.modified_content,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update request:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to update request", status: 500 },
        context
      );
    }

    // Audit log the decision
    await supabase.from("audit_logs").insert({
      org_id: reviewRequest.org_id,
      user_id: session.user.id,
      action: `review_${body.decision}`,
      resource_type: "review_request",
      resource_id: id,
      details: {
        decision: body.decision,
        reason: body.reason,
        source_type: reviewRequest.source_type,
        source_id: reviewRequest.source_id,
        risk_level: reviewRequest.risk_level,
      },
    });

    // If approved with original tool call, we could trigger execution here
    // For now, just return the decision

    return successResponse(
      {
        request: updated,
        message: `Request ${body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "approved with modifications"}`,
      },
      context
    );
  } catch (error) {
    console.error("Review request API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
