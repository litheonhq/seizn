/**
 * Annotation Items API
 *
 * GET /api/annotations/items - List annotation items (for annotators)
 * POST /api/annotations/items - Create annotation item
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

interface CreateItemRequest {
  queue_id: string;
  source_type: "trace" | "message" | "completion" | "tool_call" | "search" | "document";
  source_id: string;
  content: Record<string, unknown>;
  context?: Record<string, unknown>;
  priority?: number;
  tags?: string[];
}

/**
 * GET /api/annotations/items
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

    // Required: queue_id
    const queueId = searchParams.get("queue_id");
    if (!queueId) {
      return errorResponse(
        { code: "SEIZN_200", message: "queue_id is required", status: 400 },
        context
      );
    }

    // Verify access to queue
    const { data: queue } = await supabase
      .from("annotation_queues")
      .select("org_id")
      .eq("id", queueId)
      .single();

    if (!queue) {
      return errorResponse(
        { code: "SEIZN_404", message: "Queue not found", status: 404 },
        context
      );
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", queue.org_id)
      .single();

    if (!membership) {
      return errorResponse(
        { code: "SEIZN_105", message: "Access denied", status: 403 },
        context
      );
    }

    // Build query
    let query = supabase
      .from("annotation_items")
      .select("*", { count: "exact" })
      .eq("queue_id", queueId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    // Filter by status
    const status = searchParams.get("status");
    if (status) {
      query = query.eq("status", status);
    }

    // Filter by assigned_to
    const assignedTo = searchParams.get("assigned_to");
    if (assignedTo === "me") {
      query = query.eq("assigned_to", session.user.id);
    } else if (assignedTo === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    // Pagination
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    query = query.range(offset, offset + limit - 1);

    const { data: items, error, count } = await query;

    if (error) {
      console.error("Failed to fetch items:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to fetch items", status: 500 },
        context
      );
    }

    return successResponse(
      {
        items: items || [],
        total: count || 0,
        limit,
        offset,
      },
      context
    );
  } catch (error) {
    console.error("Annotation items API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * POST /api/annotations/items
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

    const body: CreateItemRequest = await request.json();

    // Validate required fields
    if (!body.queue_id || !body.source_type || !body.source_id || !body.content) {
      return errorResponse(
        {
          code: "SEIZN_200",
          message: "queue_id, source_type, source_id, and content are required",
          status: 400,
        },
        context
      );
    }

    const supabase = createServerClient();

    // Get queue and verify access
    const { data: queue } = await supabase
      .from("annotation_queues")
      .select("org_id, sla_hours")
      .eq("id", body.queue_id)
      .single();

    if (!queue) {
      return errorResponse(
        { code: "SEIZN_404", message: "Queue not found", status: 404 },
        context
      );
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", queue.org_id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return errorResponse(
        { code: "SEIZN_105", message: "Admin access required", status: 403 },
        context
      );
    }

    // Calculate due_at based on SLA
    let dueAt: string | null = null;
    if (queue.sla_hours) {
      const due = new Date();
      due.setHours(due.getHours() + queue.sla_hours);
      dueAt = due.toISOString();
    }

    // Create item
    const { data: item, error } = await supabase
      .from("annotation_items")
      .insert({
        queue_id: body.queue_id,
        org_id: queue.org_id,
        source_type: body.source_type,
        source_id: body.source_id,
        content: body.content,
        context: body.context || {},
        priority: body.priority || 100,
        tags: body.tags || [],
        status: "pending",
        due_at: dueAt,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create item:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to create item", status: 500 },
        context
      );
    }

    return successResponse({ item }, context, 201);
  } catch (error) {
    console.error("Annotation items API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
