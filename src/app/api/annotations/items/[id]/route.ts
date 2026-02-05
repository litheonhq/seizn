/**
 * Single Annotation Item API
 *
 * GET /api/annotations/items/[id] - Get item details
 * PATCH /api/annotations/items/[id] - Update item (assign, complete, etc.)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

interface UpdateItemRequest {
  status?: "assigned" | "in_progress" | "completed" | "skipped" | "escalated";
  assigned_to?: string | null;
}

/**
 * GET /api/annotations/items/[id]
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

    // Get item with queue info
    const { data: item, error } = await supabase
      .from("annotation_items")
      .select(`
        *,
        annotation_queues (
          id,
          name,
          queue_type,
          require_consensus,
          min_reviewers
        )
      `)
      .eq("id", id)
      .single();

    if (error || !item) {
      return errorResponse(
        { code: "SEIZN_404", message: "Item not found", status: 404 },
        context
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", item.org_id)
      .single();

    if (!membership) {
      return errorResponse(
        { code: "SEIZN_105", message: "Access denied", status: 403 },
        context
      );
    }

    // Get existing annotations for this item
    const { data: annotations } = await supabase
      .from("annotations")
      .select("*")
      .eq("item_id", id)
      .order("created_at", { ascending: false });

    return successResponse(
      {
        item,
        annotations: annotations || [],
        my_annotation: (annotations || []).find((a) => a.annotator_id === session.user.id),
      },
      context
    );
  } catch (error) {
    console.error("Annotation item API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * PATCH /api/annotations/items/[id]
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

    const body: UpdateItemRequest = await request.json();
    const supabase = createServerClient();

    // Get current item
    const { data: item } = await supabase
      .from("annotation_items")
      .select("*")
      .eq("id", id)
      .single();

    if (!item) {
      return errorResponse(
        { code: "SEIZN_404", message: "Item not found", status: 404 },
        context
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", item.org_id)
      .single();

    if (!membership) {
      return errorResponse(
        { code: "SEIZN_105", message: "Access denied", status: 403 },
        context
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (body.status) {
      updateData.status = body.status;

      // Track timing
      if (body.status === "completed" && item.assigned_at) {
        const assignedAt = new Date(item.assigned_at);
        const now = new Date();
        updateData.time_spent_seconds = Math.floor((now.getTime() - assignedAt.getTime()) / 1000);
        updateData.completed_at = now.toISOString();
      }
    }

    if (body.assigned_to !== undefined) {
      updateData.assigned_to = body.assigned_to;
      if (body.assigned_to) {
        updateData.assigned_at = new Date().toISOString();
        updateData.status = "assigned";
      }
    }

    // Update item
    const { data: updated, error } = await supabase
      .from("annotation_items")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update item:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to update item", status: 500 },
        context
      );
    }

    return successResponse({ item: updated }, context);
  } catch (error) {
    console.error("Annotation item API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
