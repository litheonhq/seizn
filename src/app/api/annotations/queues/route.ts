/**
 * Annotation Queues API
 *
 * GET /api/annotations/queues - List annotation queues
 * POST /api/annotations/queues - Create annotation queue
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

interface CreateQueueRequest {
  name: string;
  description?: string;
  queue_type?: "general" | "safety" | "quality" | "accuracy" | "feedback" | "custom";
  assignment_strategy?: "round_robin" | "load_balanced" | "skill_based" | "manual";
  max_items_per_annotator?: number;
  require_consensus?: boolean;
  min_reviewers?: number;
  consensus_threshold?: number;
  sla_hours?: number;
  auto_assign_rules?: Record<string, unknown>;
  tags?: string[];
}

/**
 * GET /api/annotations/queues
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
      return successResponse({ queues: [], total: 0 }, context);
    }

    const orgIds = memberships.map((m) => m.org_id);

    // Build query
    let query = supabase
      .from("annotation_queues")
      .select("*", { count: "exact" })
      .in("org_id", orgIds)
      .order("created_at", { ascending: false });

    // Filter by org if specified
    const orgId = searchParams.get("org_id");
    if (orgId && orgIds.includes(orgId)) {
      query = query.eq("org_id", orgId);
    }

    // Filter by type
    const queueType = searchParams.get("type");
    if (queueType) {
      query = query.eq("queue_type", queueType);
    }

    // Filter by active status
    const isActive = searchParams.get("is_active");
    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    }

    // Pagination
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    query = query.range(offset, offset + limit - 1);

    const { data: queues, error, count } = await query;

    if (error) {
      console.error("Failed to fetch queues:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to fetch queues", status: 500 },
        context
      );
    }

    // Get stats for each queue
    const queuesWithStats = await Promise.all(
      (queues || []).map(async (queue) => {
        const { count: pendingCount } = await supabase
          .from("annotation_items")
          .select("*", { count: "exact", head: true })
          .eq("queue_id", queue.id)
          .eq("status", "pending");

        const { count: completedCount } = await supabase
          .from("annotation_items")
          .select("*", { count: "exact", head: true })
          .eq("queue_id", queue.id)
          .eq("status", "completed");

        return {
          ...queue,
          stats: {
            pending_items: pendingCount || 0,
            completed_items: completedCount || 0,
          },
        };
      })
    );

    return successResponse(
      {
        queues: queuesWithStats,
        total: count || 0,
        limit,
        offset,
      },
      context
    );
  } catch (error) {
    console.error("Annotation queues API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * POST /api/annotations/queues
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

    const body: CreateQueueRequest & { org_id: string } = await request.json();

    // Validate required fields
    if (!body.name || !body.org_id) {
      return errorResponse(
        { code: "SEIZN_200", message: "name and org_id are required", status: 400 },
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

    // Create queue
    const { data: queue, error } = await supabase
      .from("annotation_queues")
      .insert({
        org_id: body.org_id,
        name: body.name,
        description: body.description,
        queue_type: body.queue_type || "general",
        assignment_strategy: body.assignment_strategy || "round_robin",
        max_items_per_annotator: body.max_items_per_annotator,
        require_consensus: body.require_consensus || false,
        min_reviewers: body.min_reviewers || 1,
        consensus_threshold: body.consensus_threshold,
        sla_hours: body.sla_hours,
        auto_assign_rules: body.auto_assign_rules || {},
        tags: body.tags || [],
        is_active: true,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create queue:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to create queue", status: 500 },
        context
      );
    }

    return successResponse({ queue }, context, 201);
  } catch (error) {
    console.error("Annotation queues API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
