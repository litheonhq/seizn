/**
 * Review Requests API
 *
 * GET /api/reviews/requests - List pending review requests
 * POST /api/reviews/requests - Create review request manually
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

interface CreateRequestBody {
  workflow_id?: string;
  org_id: string;
  request_type: string;
  source_type: string;
  source_id: string;
  content: Record<string, unknown>;
  context?: Record<string, unknown>;
  risk_level?: "low" | "medium" | "high" | "critical";
  risk_factors?: Array<Record<string, unknown>>;
  expires_at?: string;
  auto_action?: "approve" | "reject" | "escalate";
}

/**
 * GET /api/reviews/requests
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

    // Get user's orgs with admin roles
    const { data: memberships } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", session.user.id);

    if (!memberships || memberships.length === 0) {
      return successResponse({ requests: [], total: 0 }, context);
    }

    const adminOrgIds = memberships
      .filter((m) => ["owner", "admin"].includes(m.role))
      .map((m) => m.org_id);

    // Build query
    let query = supabase
      .from("review_requests")
      .select(
        `
        *,
        review_workflows (
          id,
          name,
          workflow_type
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    // Filter: assigned to me OR in my admin orgs
    query = query.or(`assigned_to.eq.${session.user.id},org_id.in.(${adminOrgIds.join(",")})`);

    // Filter by org
    const orgId = searchParams.get("org_id");
    if (orgId && adminOrgIds.includes(orgId)) {
      query = query.eq("org_id", orgId);
    }

    // Filter by status
    const status = searchParams.get("status");
    if (status) {
      query = query.eq("status", status);
    } else {
      // Default to pending
      query = query.eq("status", "pending");
    }

    // Filter by risk level
    const riskLevel = searchParams.get("risk_level");
    if (riskLevel) {
      query = query.eq("risk_level", riskLevel);
    }

    // Pagination
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    query = query.range(offset, offset + limit - 1);

    const { data: requests, error, count } = await query;

    if (error) {
      console.error("Failed to fetch requests:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to fetch requests", status: 500 },
        context
      );
    }

    return successResponse(
      {
        requests: requests || [],
        total: count || 0,
        limit,
        offset,
      },
      context
    );
  } catch (error) {
    console.error("Review requests API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * POST /api/reviews/requests
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

    const body: CreateRequestBody = await request.json();

    // Validate required fields
    if (
      !body.org_id ||
      !body.request_type ||
      !body.source_type ||
      !body.source_id ||
      !body.content
    ) {
      return errorResponse(
        {
          code: "SEIZN_200",
          message: "org_id, request_type, source_type, source_id, and content are required",
          status: 400,
        },
        context
      );
    }

    const supabase = createServerClient();

    // Verify user has access to the org
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", body.org_id)
      .single();

    if (!membership) {
      return errorResponse(
        { code: "SEIZN_105", message: "Access denied", status: 403 },
        context
      );
    }

    // Calculate expires_at
    let expiresAt = body.expires_at;
    if (!expiresAt) {
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);
      expiresAt = expires.toISOString();
    }

    // Create request
    const { data: reviewRequest, error } = await supabase
      .from("review_requests")
      .insert({
        workflow_id: body.workflow_id,
        org_id: body.org_id,
        request_type: body.request_type,
        source_type: body.source_type,
        source_id: body.source_id,
        content: body.content,
        context: body.context || {},
        risk_level: body.risk_level || "medium",
        risk_factors: body.risk_factors || [],
        status: "pending",
        expires_at: expiresAt,
        auto_action: body.auto_action || "reject",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create review request:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to create review request", status: 500 },
        context
      );
    }

    return successResponse({ request: reviewRequest }, context, 201);
  } catch (error) {
    console.error("Review requests API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
