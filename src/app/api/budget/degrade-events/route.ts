import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

/**
 * GET /api/budget/degrade-events
 * Get recent budget degrade events
 */
export async function GET(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse({ code: "SEIZN_104", message: "Authentication required", status: 401 }, context);
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const supabase = createServerClient();

    const { data, error, count } = await supabase
      .from("budget_degrade_events")
      .select("*", { count: "exact" })
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Failed to fetch degrade events:", error);
      return errorResponse({ code: "SEIZN_405", message: "Failed to fetch events", status: 500 }, context);
    }

    // Transform to expected format
    const events = (data || []).map((event) => ({
      id: event.id,
      timestamp: event.created_at,
      reason: event.reason,
      originalConfig: event.original_config || {},
      degradedConfig: event.degraded_config || {},
      costSaved: event.cost_saved_usd || 0,
    }));

    return successResponse({
      events,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    }, context);
  } catch (error) {
    console.error("Degrade events API error:", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}
